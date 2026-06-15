# Supabase Configuration Guide

This document outlines the setup and deployment process for the Edge Pulse project's Supabase backend.

## Prerequisites

- Docker installed and running
- Supabase CLI installed

# [Get supabase cli from here](https://github.com/supabase/cli)

- Node.js and pnpm package manager
- Supabase account with project created

## Environment Setup

1. **Set environment variables:**

```bash
# Get this from your supabase dashboard settings
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
supabase link --project-ref your_project_url
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

### Reset local db

```bash
supabase db reset
supabase stop
```

### Reset remote db

```bash
supabase db reset --linked
```

## Edge Functions Deployment

### Deploy Individual Functions

```bash
supabase functions deploy enroll-device
supabase functions deploy rotate-api-key
supabase functions deploy verify-hash-chain
```

## Project Structure

```
edge-pulse/
├── supabase/
│   ├── migrations/
│   │   └── 002_rls_policies.sql
│   └── .temp/
│   │
│   └── functions/
│       └── enroll-device/
│       └── rotate-api-key/
└── client/
```

## Troubleshooting

- Ensure Docker is running before starting Supabase
- Verify environment variables are set correctly
- Check database connection if migrations fail
- Use `--debug` flag for detailed error information

## Notes

- Local database and remote database are currently up to date
- All three edge functions are successfully deployed
- Project uses Row Level Security (RLS) policies
