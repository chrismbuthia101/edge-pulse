# Supabase Configuration Guide

This document outlines the setup and deployment process for the EdgePulse project's Supabase backend.

## Prerequisites

- Docker installed and running
- Supabase CLI installed
- Node.js 18+ and pnpm
- Supabase account with project created

## Environment Setup

1. **Set environment variables:**

```bash
export SUPABASE_DB_PASSWORD="your_db_password"
# OR
source supabase/.env
```

2. **Start Docker service:**

```bash
sudo systemctl start docker
sudo systemctl enable docker
docker ps
```

3. **Add user to docker group (if needed):**

```bash
sudo usermod -aG docker $USER
newgrp docker
```

## Project Setup

1. **Link local project to remote Supabase:**

```bash
supabase link --project-ref your_project_ref
```

2. **Login to Supabase:**

```bash
supabase login
```

## Database Operations

### Start Local Development

```bash
supabase start
```

### Database Migrations

```bash
# Apply migrations locally
supabase migration up

# Push migrations to remote
supabase db push

# Check for schema differences
supabase db diff --schema public
```

### Debug Database Push

```bash
supabase db push --debug
```

### Reset Local DB

```bash
supabase db reset
supabase stop
```

### Reset Remote DB

```bash
supabase db reset --linked
```

## Edge Functions Deployment

The project has 8 Edge Functions. All functions are in `supabase/functions/`.

### Deploy All Functions

```bash
supabase functions deploy
```

### Deploy Individual Functions

```bash
supabase functions deploy enroll-device
supabase functions deploy rotate-api-key
supabase functions deploy sync-device-data
supabase functions deploy invite-analyst
supabase functions deploy setup-organization
supabase functions deploy setup-profile
supabase functions deploy enforce-retention
supabase functions deploy verify-hash-chain
```

### Edge Function Reference

| Function | Purpose |
|----------|---------|
| `enroll-device` | Register a new device with the backend |
| `rotate-api-key` | Rotate a device's API key |
| `sync-device-data` | Sync telemetry and alerts from the agent |
| `invite-analyst` | Invite a new analyst user |
| `setup-organization` | Create or configure an organization |
| `setup-profile` | Set up a user profile after first login |
| `enforce-retention` | Enforce data retention policies |
| `verify-hash-chain` | Verify tamper-evident audit log integrity |

## Project Structure

```
edge-pulse/
├── supabase/
│   ├── config.toml               # Supabase configuration
│   ├── migrations/
│   │   ├── 001_core_schema.sql   # Core tables and types
│   │   ├── 002_rls_policies.sql  # Row Level Security policies
│   │   └── 003_storage.sql       # Storage buckets
│   ├── functions/
│   │   ├── enroll-device/
│   │   ├── rotate-api-key/
│   │   ├── sync-device-data/
│   │   ├── invite-analyst/
│   │   ├── setup-organization/
│   │   ├── setup-profile/
│   │   ├── enforce-retention/
│   │   └── verify-hash-chain/
│   └── .temp/                    # Temp files (git-ignored)
└── client/
```

## Troubleshooting

- Ensure Docker is running before starting Supabase
- Verify environment variables are set correctly
- Check database connection if migrations fail
- Use `--debug` flag for detailed error information
- If `supabase db push` fails, run `supabase db diff` to review pending changes

## Notes

- Local and remote databases should be kept in sync with regular `supabase db push`
- All edge functions are deployed independently to minimize blast radius
- The project uses Row Level Security (RLS) policies for data isolation
- Database migrations are numbered sequentially — create new migrations rather than editing existing ones
