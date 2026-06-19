# Device Enrollment Guide

This document describes the device enrollment process for the EdgePulse Agent.

## Overview

Device enrollment registers an EdgePulse agent with the EdgePulse cloud backend. It creates a unique device identity and generates an API key used to authenticate with the Supabase backend.

## Prerequisites

- EdgePulse Agent installed (via .deb/.rpm package or Windows installer)
- An enrollment token (obtained from the EdgePulse admin dashboard)

## Enrollment

### Quick Start (Recommended)

If `supabase_url` was baked in at build time:

```bash
sudo edge-agent enroll <ENROLLMENT_TOKEN>
```

### Advanced: CLI flags

Override baked-in values (hidden flag, for debugging):

```bash
sudo edge-agent enroll <TOKEN> --supabase-url "https://your-project.supabase.co"
```

### Automated Deployment

Create `/etc/edgepulse/enrollment.json`:

```json
{
  "supabase_url": "https://your-project.supabase.co",
  "enrollment_token": "your-enrollment-token"
}
```

Then run:

```bash
sudo edge-agent enroll
```

## Post-Enrollment

After successful enrollment:

1. Device credentials (device ID + API key) are stored securely in the OS keyring or encrypted file
2. The enrollment configuration file is removed
3. The device can now sync with the backend

To start the agent:

```bash
sudo systemctl start edgepulse-agent
```

To check status:

```bash
sudo systemctl status edgepulse-agent
```

## Troubleshooting

### "Invalid enrollment token"

- Verify the token is correct and not expired
- Check the EdgePulse dashboard for valid tokens

### "Enrollment token expired"

- Generate a new enrollment token from the admin dashboard

### Network Errors

- Ensure the device can reach the Supabase URL
- Check firewall rules and network connectivity

## Unenrollment

1. Stop the agent: `sudo systemctl stop edgepulse-agent`
2. Delete stored credentials: `sudo rm -f ~/.edgepulse/credentials.enc`
3. The device can be re-enrolled with a new token

## Configuration Files

| Location                           | Purpose                       |
| ---------------------------------- | ----------------------------- |
| `/etc/edgepulse/enrollment.json`   | Automated enrollment config   |
| `/etc/edgepulse/agent_config.json` | Agent runtime configuration   |

## API Reference

### Enroll Device Endpoint

**POST** `{supabase_url}/functions/v1/enroll-device`

**Header:** `Authorization: Bearer {enrollment_token}`

Request:

```json
{
  "enrollment_token": "string",
  "hostname": "string",
  "operating_system": "string",
  "agent_version": "string"
}
```

Response:

```json
{
  "success": true,
  "device_id": "uuid",
  "api_key": "string"
}
```
