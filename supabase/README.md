# EdgePulse Supabase Backend

This directory contains the Supabase backend configuration for the EdgePulse monitoring system.

## Structure

- `migrations/` - SQL migration files for database schema
- `functions/` - Supabase Edge Functions
- `seed.sql` - Development seed data (optional)

## Local Development

### Prerequisites

- Docker and Docker Compose
- Supabase CLI (install via `npm install -g supabase`)

### Setup

```bash
# Start local Supabase
supabase start

# Run migrations
supabase db reset

# Access services
# Studio: http://localhost:54323
# API: http://localhost:54321
# DB: postgresql://postgres:postgres@localhost:54322/postgres
```

### Environment Variables

```bash
# Copy environment template
cp .env.example .env.local

# Required variables
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Migrations

Migrations are numbered and executed in order:

- `001_initial_schema.sql` - Core tables (telemetry, devices, alerts)
- `002_rls_policies.sql` - Row Level Security policies
- `003_enrollment_auth.sql` - Device enrollment and authentication
- `004_analytics_ml.sql` - ML features and analytics tables
- `005_audit_logging.sql` - Audit trail and tamper-evident logging

## Edge Functions

Functions are organized by purpose:

- `enroll-device` - Device enrollment with token validation
- `rotate-api-key` - API key rotation for devices
- `verify-hash-chain` - Tamper-evident log verification
- `generate-report` - Report generation for admin users

## Deployment

```bash
# Link to project
supabase link --project-ref your-project-ref

# Deploy migrations
supabase db push

# Deploy functions
supabase functions deploy
```

## Security

- All tables have RLS enabled
- Device authentication uses API keys
- User authentication uses Supabase Auth JWT
- Admin-only functions require proper role verification
