# EdgePulse Developer Manual

## Architecture Overview

EdgePulse is a Next.js 16 (App Router) frontend backed by Supabase (Postgres + Auth + Realtime). A Python edge agent runs on monitored devices, syncs telemetry and anomaly scores, and communicates via Supabase REST/Realtime. All auth is handled by Supabase Auth with optional Google OAuth.

```
Browser (Next.js)
    ↕ Supabase JS SDK
Supabase (Auth · Postgres · Realtime · Edge Functions)
    ↕ REST / webhook
Python Edge Agent (device-side ML inference)
```

---

## Repository Structure

```
edge-agent/          Python agent (collection, detection, logging)
  src/
    edgepulse/       Main package
      alerts/        Alert management
      analysis/      Analysis utilities
      api/           API server
      auth/          Authentication
      collectors/    Data collectors
      config/        Configuration management
      core/          Core utilities
      detectors/     Anomaly detectors
      features/      Feature engineering
      platform/      Platform-specific code
      scripts/       Utility scripts
      security/      Security utilities
      shared/        Shared components
      storage/       Data persistence
      sync/          Sync mechanisms
      utils/         General utilities
    data/            Data files
    models/          ML model files
  packaging/         Distribution packaging
    linux/           Debian/RPM builds
    windows/         Windows installer
    scripts/         Build scripts

client/              Next.js frontend
  app/
    (auth)/          Login, register, forgot/reset password
    (dashboard)/     All dashboard pages
      dashboard/
        alerts/      Alert management
        assignments/ Device assignments
        cases/       Incident cases
        devices/     Device management
        explainability/ ML explainability
        health/      System health
        insights/    ML insights (admin only)
        integrity/   Log integrity
        live/        Real-time monitoring
        logs/        Tamper-evident logs
        notifications/ Notification settings
        reports/     Reports generation
        resilience/  System resilience
        settings/    User settings
        users/       User management (admin only)
  components/
    charts/          Chart components (ShapChart.tsx)
    dashboard/       Feature components (sidebar, topbar, charts, panels)
    landing/         Marketing page components
    ui/              shadcn/ui primitives + custom components
  lib/
    auth/            useAuth hook
    config/          Configuration files
    hooks/           use-alerts, use-measure, use-notifications, etc.
    repositories/    Data access layer (one file per domain)
    services/        Business logic (one file per domain)
    supabase/        client.ts, server.ts, type definitions
  stores/            Zustand stores (one per domain)

docs/                Documentation
  Enrollment Guide.md
  Model Training.md
  Packaging Guide.md
  Developer Manual.md

supabase/            Supabase configuration
  functions/         Edge functions
  migrations/          Database migrations
```

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16, App Router, TypeScript |
| Styling | Tailwind CSS v4, CSS variables for theming |
| Components | shadcn/ui (Radix primitives) |
| Animation | Framer Motion |
| State | Zustand (one store per domain) |
| Backend | Supabase (Auth, Postgres, Realtime) |
| Charts | Recharts |
| Toasts | Sonner |
| Fonts | Syne (display), IBM Plex Sans, IBM Plex Mono |

---

## Setup

### Prerequisites

- Node.js 16+
- pnpm (package manager)
- A Supabase project

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

## Authentication

Auth is fully Supabase-backed. The flow is:

1. `supabase.auth.signInWithPassword` / `signInWithOAuth` in `login/page.tsx`
2. OAuth callback handled by `app/(auth)/auth/callback/route.ts` — exchanges the code for a session, then redirects to `next` param or `/dashboard`
3. Session state is read in `lib/auth/useAuth.tsx` and exposed app-wide
4. Role (`ADMINISTRATOR` / `ANALYST`) is stored in the `analyst_users` table and read via `useAuthStore`
5. New users land in a **Pending** state until an admin approves them in `/dashboard/users`

Route protection lives in `dashboard/layout.tsx`: unapproved users see a "Pending Approval" screen instead of the dashboard.

---

## State Management

Each domain has its own Zustand store in `stores/`:

| Store | Purpose |
|-------|---------|
| `alert-store` | Alerts list, pending count, bulk actions |
| `auth-store` | Current user, role |
| `case-store` | Incident cases and notes |
| `device-enrollment-store` | Device enrollment state |
| `device-store` | Device fleet, isolation, refresh |
| `health-store` | System health metrics |
| `live-store` | Real-time event feed |
| `log-integrity-store` | Log integrity verification |
| `logs-store` | Tamper-evident log entries |
| `privacy-store` | Privacy mode settings |
| `report-store` | Report generation state |
| `retention-store` | Data retention settings |
| `sync-queue-store` | Sync queue management |
| `threshold-store` | Detection thresholds |
| `ui-store` | UI state |
| `user-store` | User management state |

Stores call repositories directly for data access and expose methods that components call. Components should **not** call repositories directly.

---

## Data Layer Pattern

```
Component → Store → Service → Repository → Supabase
```

- **Repository** (`lib/repositories/`) — raw Supabase queries, returns typed data
- **Service** (`lib/services/`) — business logic, orchestrates repositories
- **Store** (`stores/`) — holds UI state, calls services/repos, exposes actions
- **Component** — subscribes to store, calls store actions

### Repository Files

- `alert-repository.ts` — Alert queries and mutations
- `anomaly-repository.ts` — Anomaly data access
- `auth-repository.ts` — Authentication queries
- `base-repository.ts` — Base repository class
- `case-repository.ts` — Case management
- `device-assignment-repository.ts` — Device assignments
- `device-data-repository.ts` — Device telemetry data
- `device-enrollment-repository.ts` — Device enrollment
- `device-repository.ts` — Device CRUD operations
- `forensic-repository.ts` — Forensic data export
- `health-repository.ts` — System health data
- `live-repository.ts` — Real-time data
- `logs-repository.ts` — Tamper-evident logs
- `privacy-repository.ts` — Privacy settings
- `report-repository.ts` — Reports
- `retention-repository.ts` — Data retention
- `sync-queue-repository.ts` — Sync queue
- `threshold-repository.ts` — Threshold management
- `user-repository.ts` — User management

### Service Files

- `alert-service.ts` — Alert business logic
- `anomaly-service.ts` — Anomaly processing
- `auth-service.ts` — Authentication logic
- `case-service.ts` — Case workflows
- `device-data-service.ts` — Device data processing
- `device-enrollment-service.ts` — Enrollment flows
- `device-service.ts` — Device management
- `forensic-service.ts` — Forensic exports
- `health-service.ts` — Health monitoring
- `live-service.ts` — Real-time updates
- `log-integrity-service.ts` — Log verification
- `logs-service.ts` — Log management
- `privacy-service.ts` — Privacy controls
- `report-service.ts` — Report generation
- `retention-service.ts` — Retention policies
- `sync-queue-service.ts` — Queue processing
- `telemetry-service.ts` — Telemetry handling
- `threshold-service.ts` — Threshold logic
- `user-service.ts` — User operations

---

## Adding a New Page

1. Create `app/(dashboard)/dashboard/your-page/page.tsx`
2. Add a nav entry in `components/dashboard/sidebar.tsx` under `navItems` (include `roles` array if restricted)
3. Add a breadcrumb entry in `components/dashboard/dynamic-breadcrumb.tsx` if needed
4. Create a Zustand store in `stores/your-store.ts` if the page has its own data
5. Create repository/service files if new Supabase tables are involved

---

## Roles & Access Control

Roles are checked with the `hasRole(roles[])` helper from `useAuth`. Use it in:
- Sidebar nav items (`roles` field filters items per user)
- Page-level guards (`if (!hasRole(['ADMINISTRATOR'])) return <AccessDenied />`)
- Conditional UI (e.g., showing admin-only buttons)

Roles are stored in `analyst_users.role` and read after login.

### Role Definitions

**ADMINISTRATOR:**
- Full system access
- Can see all devices (assigned/unassigned)
- Can see all alerts across all devices
- Can manage device assignments
- Can access ML Insights
- Can manage users and system settings
- Can view all telemetry and forensic data

**ANALYST:**
- Scoped access to assigned devices only
- Can only see alerts from assigned devices
- Cannot access ML Insights (admin-only feature)
- Cannot manage users or system settings
- Can view telemetry and forensic data for assigned devices only
- Can create and manage cases for assigned devices

---

## Theming

CSS variables are defined in `app/globals.css` under `:root` (light) and `.dark`. The variable naming follows shadcn/ui conventions (`--primary`, `--muted`, `--destructive`, etc.). Custom additions include `--grid-light` / `--grid-dark` for the background grid pattern and `--alert-*` for severity colors.

The `ThemeProvider` from `next-themes` wraps the app in `layout.tsx`.

---

## Key Components

### `AlertFeed` (`components/dashboard/alert-feed.tsx`)
Subscribes to `useAlerts` hook. Renders a filterable, expandable list with inline resolve/dismiss actions. Uses `AnimatePresence` for animated entry/exit.

### `AlertRow` (`components/dashboard/alert-row.tsx`)
Individual alert row component with expand/collapse, SHAP visualization, and action buttons.

### `ShapPanel` (`components/dashboard/shap-panel.tsx`)
Reads the latest alert with `explanation_json.features` from the alert store. Renders feature attribution bars using Framer Motion. Positive contributions (red) increase the anomaly score; negative (blue) decrease it.

### `Sidebar` (`components/dashboard/sidebar.tsx`)
Collapsible (68px / 240px). State persisted to `localStorage`. Mobile overlay handled via `mobileSidebarOpen` prop. Filters nav items by user role.

### `Topbar` (`components/dashboard/topbar.tsx`)
Header with notifications, user menu, theme toggle, and search functionality.

### `DynamicBreadcrumb` (`components/dashboard/dynamic-breadcrumb.tsx`)
Context-aware breadcrumb navigation based on current route.

### `ThreatChart` (`components/dashboard/threat-chart.tsx`)
Falls back to static datasets if the alert store is empty. Builds a live 24h bucket chart from store alerts using `useMemo`.

### `SystemHealth` (`components/dashboard/system-health.tsx`)
Real-time system health monitoring with status indicators.

### `DeviceEnrollment` (`components/dashboard/device-enrollment.tsx`)
Device onboarding and enrollment management UI.

### `SyncQueuePanel` (`components/dashboard/sync-queue-panel.tsx`)
Displays pending sync operations and queue status.

### `LogIntegrityPanel` (`components/dashboard/log-integrity-panel.tsx`)
Shows tamper-evident log verification status.

---

## Hooks

Custom hooks in `lib/hooks/`:

- `use-alerts.ts` — Alert data fetching and real-time updates
- `use-measure.ts` — DOM element measurement
- `use-notifications.ts` — Notification management
- `use-page-visibility.ts` — Page visibility API wrapper
- `use-reduced-motion.ts` — Accessibility preference detection

---

## UI Components

### Dashboard Components

- `agent-performance.tsx` — Agent performance metrics
- `attack-category-chart.tsx` — Attack categorization visualization
- `detection-threshold-slider.tsx` — Threshold adjustment UI
- `device-assignment-manager.tsx` — Device assignment interface
- `dynamic-threat-level.tsx` — Threat level indicator
- `forensic-export.tsx` — Forensic data export UI
- `model-performance.tsx` — ML model metrics
- `network-topology.tsx` — Network visualization
- `online-offline-detection.tsx` — Device connectivity status
- `privacy-mode-indicator.tsx` — Privacy mode status
- `purge-device-data.tsx` — Data purging interface
- `sync-queue-status.tsx` — Sync status display
- `telemetry-retention.tsx` — Retention policy UI

### Chart Components

- `ShapChart.tsx` — SHAP value visualization using Recharts

---

## ML & Explainability

The Python agent runs an Isolation Forest model locally. SHAP values are computed per-inference and stored as `explanation_json` on alert records. The `ShapPanel`, `ExplainabilityPage`, and `InsightsPage` all consume this field.

To train a new model: see `docs/Model Training.md`. Place the output at `edge-agent/src/models/edgepulse_primary_isolation_forest.joblib`.

The `ShapChart` component (`components/charts/ShapChart.tsx`) renders a horizontal Recharts `BarChart` coloured by `contribution_type`.

---

## Edge Agent Development

### Setup

```bash
cd edge-agent

# Install dependencies
make install          # Core dependencies
make install-full     # With TensorFlow training support
make install-all      # All optional extras

# Bootstrap the model (required first run)
make bootstrap

# Create environment file
cp .env.example .env
```

### Running

```bash
# Development mode with debug logging
make dev

# Production mode
make run

# Or using Poetry directly
poetry run edge-agent run --verbose
```

### Quality Commands

```bash
make test        # Run test suite
make lint        # Run black (check) + mypy
make fmt         # Auto-format with black
make typecheck   # mypy only
make clean       # Remove cache files
```

### Service Management

```bash
make service-install   # Install as system service
make service-start     # Start the service
make service-stop      # Stop the service
make service-status    # Show service status
make service-logs      # Tail service logs
```

### Enrollment

```bash
make enroll        # Enroll device with EdgePulse backend
```

---

## Packaging the Agent

| Target | Command |
|--------|---------|
| Python wheel | `make wheel` |
| Debian .deb | `make deb` |
| RPM .rpm | `make rpm` |
| Windows .exe | `make windows` |

All builds require a bootstrapped model first: `make bootstrap`. See `docs/Packaging Guide.md` for full details.

---

## Linting & Testing

```bash
# Frontend
cd client
pnpm lint
pnpm build      # catches type errors

# Agent
cd edge-agent
make test
make fmt
make lint
```

---

## Common Pitfalls

- **`useAlertStore.getState()`** is used inside event handlers and non-hook contexts (e.g., `handleResolve`). This is intentional — do not convert these to hook calls inside callbacks.
- **Supabase client vs server**: `lib/supabase/client.ts` is for client components; `lib/supabase/server.ts` uses `cookies()` for server components and route handlers.
- **`explanation_json` is sometimes stringified**: The alert detail page double-parses it (`JSON.parse(JSON.stringify(...))`) — be careful not to double-serialize when writing new code.
- **pnpm workspace**: The project uses pnpm. Use `pnpm install` instead of `npm install`.
- **Role checking**: Always use `hasRole()` from `useAuth` for role checks, not direct role string comparison.

---

## Environment Variables Reference

### Edge Agent

| Variable | Description |
|----------|-------------|
| `DEVICE_ID` | Unique device identifier |
| `API_PORT` | API server port (default: 8080) |
| `COLLECTION_INTERVAL` | Data collection interval in seconds |
| `DETECTION_THRESHOLD` | Anomaly detection sensitivity (0.0-1.0) |
| `SYNC_ENABLED` | Enable cloud sync to Supabase |
| `LOG_LEVEL` | Logging level (DEBUG, INFO, WARNING, ERROR) |

### Client

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key |
