# Device Enrollment Guide

This document describes the device enrollment process for the EdgePulse Agent.

## Overview

Device enrollment is the process of registering an EdgePulse agent with the EdgePulse cloud backend. This registration creates a unique device identity and generates an API key that the agent uses to authenticate with the Supabase backend.

## Prerequisites

- EdgePulse Agent installed (via .deb package)
- Supabase project URL
- Valid enrollment token (obtained from the EdgePulse admin dashboard)

## Enrollment Methods

### Method 1: Automatic Enrollment (Recommended)

1. Edit the enrollment configuration file:
   ```bash
   sudo nano /etc/edgepulse/enrollment.json
   ```

2. Update the configuration with your Supabase URL and enrollment token:
   ```json
   {
     "supabase_url": "https://your-project.supabase.co",
     "enrollment_token": "your-enrollment-token-here"
   }
   ```

3. Run the enrollment command:
   ```bash
   sudo /opt/edgepulse/venv/bin/edge-agent enroll
   ```

### Method 2: Command Line Arguments

You can also enroll using command line arguments:

```bash
sudo /opt/edgepulse/venv/bin/edge-agent enroll \
  --supabase-url "https://your-project.supabase.co" \
  --token "your-enrollment-token"
```

### Method 3: Create Config File

Create `~/.edgepulse/enrollment.json` (non-root users):

```json
{
  "supabase_url": "https://your-project.supabase.co",
  "enrollment_token": "your-enrollment-token"
}
```

Or use `~/.edgepulse/enroll.cfg`:

```
supabase_url=https://your-project.supabase.co
enrollment_token=your-enrollment-token
```

## Post-Enrollment

After successful enrollment:

1. The agent credentials are stored securely
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
- Check the Supabase dashboard for valid tokens

### "Enrollment token expired"
- Generate a new enrollment token from the admin dashboard

### "Device already enrolled"
- The device is already registered
- You can check enrollment status in `/var/lib/edgepulse/` or via the CLI

### Network Errors
- Ensure the device can reach the Supabase URL
- Check firewall rules and network connectivity

## Unenrollment

To unenroll (remove device from backend):
1. Stop the agent: `sudo systemctl stop edgepulse-agent`
2. Remove credentials: `sudo rm -rf /var/lib/edgepulse/credentials`
3. The device can be re-enrolled with a new token if needed

## Configuration Files

| Location | Purpose |
|----------|---------|
| `/etc/edgepulse/enrollment.json` | System-wide enrollment config |
| `~/.edgepulse/enrollment.json` | User-level enrollment config |
| `/var/lib/edgepulse/credentials/` | Stored device credentials |
| `/etc/edgepulse/agent_config.json` | Agent runtime configuration |

## API Reference

### Enroll Device Endpoint

**POST** `{supabase_url}/functions/v1/enroll-device`

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