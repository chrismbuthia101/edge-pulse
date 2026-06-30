# EdgePulse Developer Manual

## Architecture Overview

EdgePulse is a Next.js 16 (App Router) frontend backed by Supabase (Postgres + Auth + Realtime). A Python edge agent runs on monitored devices, collects system signals, runs ML anomaly detection, and syncs alerts via Supabase REST/Realtime.

```
Browser (Next.js 16)
    ↕ Supabase JS SDK
Supabase (Auth · Postgres · Realtime · Edge Functions)
    ↕ REST / webhook
Python Edge Agent (device-side ML inference)
```

---

## Repository Structure

```
edge-agent/          Python agent (collection, detection, sync)
  src/
    edgepulse/
      agent/         Agent orchestration
      analysis/      Analysis utilities
      api/           FastAPI-based API server (port 8080)
      auth/          Device authentication
      config/        Pydantic-settings based configuration
      data/          SQL schema files
      detectors/     Anomaly detectors (Isolation Forest, Autoencoder)
      features/      Feature engineering
      models/        ML model artifacts
      pipeline/      Collection pipeline
      platform/      Platform-specific code (Linux, Windows)
      registry/      Device registry
      storage/       Persistent storage (SQLite via aiosqlite)
      sync/          Cloud sync to Supabase
      utils/         General utilities
    models/          Pre-trained model file
  packaging/
    linux/           Debian/RPM build scripts
    windows/         NSIS installer and PyInstaller spec

client/              Next.js 16 frontend
  app/
    (auth)/          Login, register, forgot/reset password
    (dashboard)/     All dashboard pages
      dashboard/
        alerts/      Alert management + detail view
        assignments/ Device-to-analyst assignments
        audit-log/   Tamper-evident log viewer
        devices/     Device fleet management + detail view
        live/        Real-time event feed
        ml-insights/ ML model performance (admin only)
        notifications/ Notification center
        reports/     Report generation hub (6 sub-reports)
        settings/    User settings (8 tabs)
        users/       User management (admin only)
        xai/         Explainable AI comparison
    (onboarding)/    Organization setup flows
    admin/           Super-admin pages
    docs/            Documentation pages
    downloads/       Downloads page with dynamic release data
  components/
    charts/          Chart components (ShapChart.tsx, etc.)
    dashboard/       Sidebar, topbar, charts, panels
    docs/            Documentation page components
    landing/         Marketing page components
    ui/              shadcn/ui primitives + custom components
  lib/
    auth/            useAuth hook, AuthBootstrap
    hooks/           Custom React hooks
    repositories/    Data access layer (one file per domain)
    services/        Business logic layer
    stores/          Zustand stores (one per domain)
    supabase/        Client/server config + types

supabase/            Supabase configuration
  functions/         8 Edge Functions (Deno)
  migrations/        3 migration files

docs/                Documentation (markdown)
```

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16, App Router, TypeScript |
| Styling | Tailwind CSS v4, CSS variables for theming |
| Components | shadcn/ui (Radix primitives) |
| Animation | Framer Motion |
| State | Zustand (one store per domain, ~17 stores) |
| Backend | Supabase (Auth, Postgres, Realtime) |
| Charts | Recharts |
| Toasts | Sonner |
| Fonts | Plus Jakarta Sans, IBM Plex Mono |

---

## Setup

### Prerequisites

- Node.js 18+
- pnpm (package manager)
- A Supabase project
- Docker (for local Supabase)

### Install & run

```bash
cd client
pnpm install
cp .env.example .env.local  # add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
pnpm dev                    # http://localhost:3000
```

### Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

---

## Authentication & Authorization

Auth is fully Supabase-backed with hCaptcha bot protection.

### Auth Flow

1. `supabase.auth.signInWithPassword` / `signInWithOAuth({ provider: "google" })` in `login/page.tsx`
2. OAuth callback handled by `app/(auth)/auth/callback/route.ts` — exchanges code for a session, redirects to `/auth/resolve`
3. Session state is read in `lib/auth/useAuth.tsx` and exposed app-wide via `AuthBootstrap`
4. Role (`ORG_ADMIN` / `ORG_ANALYST`) is stored in the `analyst_users` table and read into `auth-store`
5. New users land in a **Pending** state until an admin approves them in `/dashboard/users`

### Roles

| Role | Access |
|------|--------|
| `ORG_ADMIN` | Full system access — all devices, all alerts, ML Insights, user management, system settings, device assignments |
| `ORG_ANALYST` | Scoped to assigned devices only — can investigate alerts, view SHAP explanations, access audit log |

Route protection lives in `dashboard/layout.tsx`: unauthenticated users are redirected to login; unapproved users see a "Pending Approval" screen.

---

## Dashboard Routes Reference

### Overview Group

| Route | Description |
|-------|-------------|
| `/dashboard` | Main dashboard with stat cards, 24h anomaly chart, resolution gauge, severity distribution, priority alert feed |
| `/dashboard/live` | Real-time event feed with filtering, pause/resume, CSV export |

### Detection Group

| Route | Description |
|-------|-------------|
| `/dashboard/alerts` | Alert management with search, filtering, bulk actions, SHAP explainability |
| `/dashboard/alerts/[alert_id]` | Individual alert detail with full SHAP feature attribution |
| `/dashboard/devices` | Device fleet management with states, risk levels, enrollment, isolation |
| `/dashboard/devices/[id]` | Individual device detail |

### Intelligence Group (role-gated)

| Route | Roles | Description |
|-------|-------|-------------|
| `/dashboard/ml-insights` | ORG_ADMIN | Model performance, SHAP importance, real-time model health |
| `/dashboard/xai` | ORG_ADMIN, ORG_ANALYST | XAI comparison (SHAP, LIME, Isolation Forest) |

### System Group

| Route | Description |
|-------|-------------|
| `/dashboard/audit-log` | Tamper-evident log viewer with hash-chain verification |
| `/dashboard/notifications` | Notification center with unread tracking |

### Administration Group (ORG_ADMIN only)

| Route | Description |
|-------|-------------|
| `/dashboard/users` | User management with invites, role assignment, status toggling |
| `/dashboard/assignments` | Device-to-analyst assignment management |
| `/dashboard/reports` | Report generation hub with 6 sub-reports |
| `/dashboard/settings` | User settings with 8 tabs |

### Report Sub-Routes

| Route | Description |
|-------|-------------|
| `/dashboard/reports/alert-analysis` | Alert analysis with severity breakdown, time-series, PDF export |
| `/dashboard/reports/device-fleet` | OS distribution, risk profile, online/offline stats |
| `/dashboard/reports/executive-summary` | Key metrics, incidents, resolution rates, PDF/CSV export |
| `/dashboard/reports/integrity-audit` | Hash chain verification, integrity check timeline |
| `/dashboard/reports/ml-performance` | Accuracy/precision/recall/f1, confusion matrix, feature importance |
| `/dashboard/reports/user-management` | Active/inactive counts, role distribution, recent activity |

---

## State Management

Each domain has its own Zustand store in `stores/`. Stores call services/repositories directly.

| Store | Purpose |
|-------|---------|
| `admin-store` | Admin view data |
| `alert-store` | Alerts list, pending count, bulk actions |
| `anomaly-store` | Anomaly data |
| `auth-store` | Current user, role |
| `device-assignment-store` | Device-assignment mappings |
| `device-enrollment-store` | Device enrollment state |
| `device-store` | Device fleet, isolation, refresh |
| `health-store` | System health metrics |
| `live-store` | Real-time event feed |
| `logs-store` | Tamper-evident log entries |
| `notification-store` | Notifications |
| `organization-store` | Organization settings |
| `report-store` | Report generation state |
| `sync-queue-store` | Sync queue management |
| `ui-store` | UI state (sidebar, theme, etc.) |
| `user-store` | User management |

---

## Data Layer Pattern

```
Component → Store → Service → Repository → Supabase
```

- **Repository** (`lib/repositories/`) — raw Supabase queries, returns typed data (19 files)
- **Service** (`lib/services/`) — business logic, orchestrates repositories (19 files)
- **Store** (`stores/`) — holds UI state, calls services/repos, exposes actions (17 files)
- **Component** — subscribes to store, calls store actions

---

## Edge Agent Development

### Agent Setup

```bash
cd edge-agent
make install              # Core dependencies
cp .env.example .env      # Create environment file
```

### Running

```bash
make dev   # Development mode with DEBUG logging
make run   # Production mode with INFO logging

# Or using Python directly
python -m edgepulse run --verbose
```

### Quality Commands

```bash
make test        # Run test suite
make lint        # black (check) + ruff + mypy
make fmt         # Auto-format with black + ruff
make typecheck   # mypy only
make clean       # Remove cache files
make audit       # pip-audit on dependencies
```

### Service Management

```bash
make service-install   # Install as systemd service
make service-start     # Start the service
make service-stop      # Stop the service
make service-status    # Show status
make service-logs      # Tail logs
```

### Enrollment

```bash
make enroll        # Enroll device with EdgePulse backend
```

---

## Packaging the Agent

| Target | Command | Output |
|--------|---------|--------|
| Python wheel | `make wheel` | `dist/edge_agent-*.whl` |
| Debian .deb | `make deb` | `packaging/dist/edgepulse-agent_*_amd64.deb` |
| RPM .rpm | `make rpm` | `packaging/dist/edgepulse-agent-*.x86_64.rpm` |
| Windows .exe | `make windows` | `packaging/dist/EdgePulse-Agent-Setup-*.exe` |

See `docs/Packaging Guide.md` for full details.

---

## Linting & Testing

```bash
# Frontend
cd client
pnpm lint         # ESLint
pnpm typecheck    # TypeScript check
pnpm build        # Full production build

# Agent
cd edge-agent
make test
make fmt
make lint
```

---

## Common Pitfalls

- **Supabase client vs server**: `lib/supabase/client.ts` is for client components; `lib/supabase/server.ts` uses `cookies()` for server components and route handlers.
- **`useAlertStore.getState()`** is used inside event handlers and non-hook contexts — this is intentional, do not convert to hook calls inside callbacks.
- **`explanation_json` is sometimes stringified**: The alert detail page double-parses it (`JSON.parse(JSON.stringify(...))`) — avoid double-serializing.
- **pnpm workspace**: Always use `pnpm install`, never `npm install`.
- **Role checking**: Use `hasRole()` from `useAuth` — never direct role string comparison.

---

## Environment Variables Reference

### Edge Agent

| Variable | Default | Description |
|----------|---------|-------------|
| `DEVICE_ID` | auto | Unique device identifier |
| `SUPABASE_URL` | — | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Service role key for sync |
| `API__PORT` | 8080 | Local API server port |
| `COLLECTION__INTERVAL` | 60 | Collection interval (seconds) |
| `FEATURES__FEATURE_DIMENSION` | 50 | Feature vector dimension |
| `FEATURES__HISTORY_RETENTION_HOURS` | 24 | Feature history window |
| `DETECTION__USE_ENSEMBLE` | true | Use ensemble of detectors |
| `DETECTION__ISOLATION_FOREST_N_ESTIMATORS` | 100 | Number of Isolation Forest trees |
| `ALERTING__MIN_SEVERITY` | medium | Minimum severity to alert |
| `ALERTING__CORRELATION_WINDOW` | 300 | Alert correlation window (seconds) |
| `SYNC__BATCH_SIZE` | 50 | Sync batch size |
| `SYNC__OFFLINE_QUEUE_MAX` | 10000 | Max offline queue entries |
| `SYNC__RETRY_MAX_ATTEMPTS` | 5 | Max retry attempts |
| `PRIVACY__DATA_RETENTION_DAYS` | 30 | Local data retention (days) |
| `LOG__LEVEL` | INFO | Logging level |
| `METRICS__COLLECTION_INTERVAL` | 30 | Metrics interval (seconds) |

### Client

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key |
