#!/usr/bin/env bash
# =============================================================================
#  build_deb.sh  —  Build a thin EdgePulse Agent .deb using fpm
#
#  Run from the edge-agent/ directory:
#      bash packaging/linux/build_deb.sh
#
#  Prerequisites:
#      gem install fpm
#      python3 -m pip install --upgrade build twine
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

VERSION=$(python3 -c "
import re, pathlib
text = pathlib.Path('${REPO_ROOT}/pyproject.toml').read_text()
m = re.search(r'version\s*=\s*[\"\']([\d.]+)[\"\']\s', text)
print(m.group(1) if m else '0.1.0')
")

PACKAGE_NAME="edgepulse-agent"
ARCH="amd64"
MAINTAINER="EdgePulse <support@edgepulse.io>"
DESCRIPTION="EdgePulse AI-powered security monitoring and anomaly detection agent"
URL="https://edgepulse.io"

STAGING_DIR="/tmp/edgepulse-deb-staging"
DIST_DIR="${REPO_ROOT}/packaging/dist"
WHEEL_DIR="${REPO_ROOT}/dist"
OUTPUT="${DIST_DIR}/${PACKAGE_NAME}_${VERSION}_${ARCH}.deb"

INSTALL_PREFIX="/opt/edgepulse"
VENV_DIR="${INSTALL_PREFIX}/venv"
SYSTEMD_DIR="/etc/systemd/system"
CONFIG_DIR="/etc/edgepulse"
VAR_DIR="/var/lib/edgepulse"
LOG_DIR="/var/log/edgepulse"
RUN_DIR="/run/edgepulse"

echo "============================================================"
echo "  Building EdgePulse Agent .deb"
echo "  Version : ${VERSION}"
echo "  Output  : ${OUTPUT}"
echo "============================================================"

# ---------------------------------------------------------------------------
# Sanity checks
# ---------------------------------------------------------------------------
if ! command -v fpm &>/dev/null; then
    echo "ERROR: fpm not found. Install with: gem install fpm"
    exit 1
fi
if ! command -v python3 &>/dev/null; then
    echo "ERROR: python3 not found."
    exit 1
fi

# ---------------------------------------------------------------------------
# Build Python wheel (thin packaging - no deps bundled)
# ---------------------------------------------------------------------------
echo "[1/7] Building Python wheel..."
cd "${REPO_ROOT}"

rm -rf "${WHEEL_DIR}"/*.whl 2>/dev/null || true
python3 -m pip install --quiet build
python3 -m build --wheel --no-isolation -o "${WHEEL_DIR}" .

WHEEL_FILE=$(ls "${WHEEL_DIR}"/edge_agent-*.whl 2>/dev/null | head -1)
if [[ -z "${WHEEL_FILE}" ]]; then
    echo "ERROR: Wheel build failed. Check output above."
    exit 1
fi
echo "  Wheel: $(basename "${WHEEL_FILE}")"

# ---------------------------------------------------------------------------
# Bootstrap model if not present
# ---------------------------------------------------------------------------
MODEL_PATH="${REPO_ROOT}/src/models/edgepulse_primary_isolation_forest.joblib"
if [[ ! -f "${MODEL_PATH}" ]]; then
    echo "[2/7] Bootstrapping ML model..."
    cd "${REPO_ROOT}"
    python3 -m pip install --quiet joblib numpy scikit-learn
    python3 src/edgepulse/scripts/bootstrap_model.py --output-dir src/models/
fi

# ---------------------------------------------------------------------------
# Clean and create staging directory
# ---------------------------------------------------------------------------
echo "[3/7] Creating staging directory..."
rm -rf "${STAGING_DIR}"
mkdir -p \
    "${STAGING_DIR}${INSTALL_PREFIX}/bin" \
    "${STAGING_DIR}${SYSTEMD_DIR}" \
    "${STAGING_DIR}${CONFIG_DIR}" \
    "${STAGING_DIR}${VAR_DIR}/models" \
    "${DIST_DIR}"

# ---------------------------------------------------------------------------
# Copy app files (no site-packages!)
# ---------------------------------------------------------------------------
echo "[4/7] Copying application files (thin packaging)..."

cp "${WHEEL_FILE}" "${STAGING_DIR}${INSTALL_PREFIX}/edge_agent-${VERSION}-py3-none-any.whl"

cp "${REPO_ROOT}/src/edgepulse/scripts/bootstrap_model.py" "${STAGING_DIR}${INSTALL_PREFIX}/"

# Copy bootstrapped model
if [[ -f "${MODEL_PATH}" ]]; then
    cp "${MODEL_PATH}" "${STAGING_DIR}${VAR_DIR}/models/"
    META="${MODEL_PATH%.joblib}.json"
    [[ -f "${META}" ]] && cp "${META}" "${STAGING_DIR}${VAR_DIR}/models/"
fi

# ---------------------------------------------------------------------------
# Entry-point launcher (uses venv)
# ---------------------------------------------------------------------------
echo "[5/7] Writing entry-point launcher..."
cat > "${STAGING_DIR}${INSTALL_PREFIX}/bin/edge-agent" <<'WRAPPER'
#!/bin/bash
# EdgePulse Agent launcher
# Uses the venv Python installed at /opt/edgepulse/venv

VENV_PYTHON="/opt/edgepulse/venv/bin/python3"

if [[ ! -x "${VENV_PYTHON}" ]]; then
    echo "ERROR: EdgePulse venv not found at ${VENV_PYTHON}" >&2
    echo "Please reinstall the package or run: /opt/edgepulse/bin/install-deps" >&2
    exit 1
fi

exec "${VENV_PYTHON}" -m edgepulse "$@"
WRAPPER
chmod 755 "${STAGING_DIR}${INSTALL_PREFIX}/bin/edge-agent"

# ---------------------------------------------------------------------------
# systemd unit file (uses venv Python)
# ---------------------------------------------------------------------------
echo "[6/7] Writing systemd unit file..."
cat > "${STAGING_DIR}${SYSTEMD_DIR}/edgepulse-agent.service" <<UNIT
[Unit]
Description=${DESCRIPTION}
Documentation=https://docs.edgepulse.io
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=60
StartLimitBurst=3

[Service]
Type=simple
ExecStart=/opt/edgepulse/venv/bin/python3 -m edgepulse run --config /etc/edgepulse/agent_config.json
WorkingDirectory=/var/lib/edgepulse
RuntimeDirectory=edgepulse
Restart=on-failure
RestartSec=10
RestartPreventExitStatus=0
StandardOutput=journal
StandardError=journal
SyslogIdentifier=edgepulse-agent
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/var/lib/edgepulse /var/log/edgepulse /run/edgepulse /etc/edgepulse /opt/edgepulse
PrivateTmp=true
LimitNOFILE=65535
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
UNIT

# ---------------------------------------------------------------------------
# Write maintainer scripts
# ---------------------------------------------------------------------------
echo "[7/7] Writing maintainer scripts..."

# ---- postinst: creates venv and installs deps on TARGET ----
POSTINST="${SCRIPT_DIR}/postinst"
cat > "${POSTINST}" <<'POSTINST_SCRIPT'
#!/bin/bash
# postinst — EdgePulse Agent post-install script
# Creates the Python venv, installs deps, bootstraps the ML model,
# and prints clear numbered setup instructions.
set -e

VENV_DIR="/opt/edgepulse/venv"
AGENT_BIN="${VENV_DIR}/bin/edge-agent"

# ── 1. Create required directories ──────────────────────────────────────────
for dir in /var/lib/edgepulse \
           /var/lib/edgepulse/models \
           /var/lib/edgepulse/data \
           /var/log/edgepulse \
           /run/edgepulse \
           /etc/edgepulse; do
    mkdir -p "$dir"
    chmod 750 "$dir"
done

# ── 2. Find wheel file ───────────────────────────────────────────────────────
WHEEL_FILE=$(ls /opt/edgepulse/*.whl 2>/dev/null | head -1)
if [[ -z "${WHEEL_FILE}" ]]; then
    echo "ERROR: Could not find EdgePulse wheel file in /opt/edgepulse/" >&2
    exit 1
fi

# ── 3. Create Python virtual environment ────────────────────────────────────
echo "EdgePulse: Setting up Python environment..."

if [[ ! -d "${VENV_DIR}" ]]; then
    echo "  Creating isolated Python environment at ${VENV_DIR}..."
    python3 -m venv "${VENV_DIR}"
fi

"${VENV_DIR}/bin/pip" install --quiet --upgrade pip setuptools wheel

# ── 4. Install agent and dependencies ───────────────────────────────────────
echo "  Installing EdgePulse Agent and dependencies..."
"${VENV_DIR}/bin/pip" install --quiet "${WHEEL_FILE}[api-full,notifications,ml-inference,linux]"

# ── 5. Bootstrap ML model ────────────────────────────────────────────────────
MODEL="/var/lib/edgepulse/models/edgepulse_primary_isolation_forest.joblib"
if [[ ! -f "${MODEL}" ]]; then
    echo "  Bootstrapping anomaly detection model (this takes ~10-30 seconds)..."
    "${VENV_DIR}/bin/python" /opt/edgepulse/bootstrap_model.py \
        --output-dir /var/lib/edgepulse/models/ \
        --n-samples 2000 \
        2>&1 | sed 's/^/    /' || true
fi

# ── 6. Write enrollment config template (only if not already present) ────────
ENROLL_CFG="/etc/edgepulse/enrollment.json"
if [[ ! -f "${ENROLL_CFG}" ]]; then
    cat > "${ENROLL_CFG}" <<'ENROLL_CONFIG'
{
  "supabase_url": "https://YOUR_PROJECT_REF.supabase.co",
  "enrollment_token": "YOUR_ENROLLMENT_TOKEN",
  "supabase_anon_key": "YOUR_ANON_KEY",
  "device_hostname": null,
  "device_os": null,
  "agent_version": null,
  "timeout_seconds": 30
}
ENROLL_CONFIG
    chmod 640 "${ENROLL_CFG}"
fi

# ── 7. Write agent config (only if not already present) ──────────────────────
AGENT_CFG="/etc/edgepulse/agent_config.json"
if [[ ! -f "${AGENT_CFG}" ]]; then
    cat > "${AGENT_CFG}" <<'AGENT_CONFIG'
{
  "device_id": null,
  "environment": "production",
  "api": {
    "enabled": true,
    "mode": "auto",
    "port": 8080,
    "require_auth": false,
    "socket_path": null,
    "min_memory_mb": 512,
    "min_cpu_cores": 2
  },
  "sync": {
    "supabase_url": "",
    "supabase_key": "",
    "batch_size": 50,
    "retry_max_attempts": 5,
    "offline_queue_max": 10000,
    "sync_interval": 300
  },
  "collection": {
    "interval": 60,
    "window_1min": 60,
    "window_5min": 300,
    "window_15min": 900,
    "enable_process_monitoring": true,
    "enable_network_monitoring": true,
    "max_processes": 100
  },
  "features": {
    "feature_dimension": 50,
    "history_retention_hours": 24,
    "enable_auto_scaling": true,
    "normalize_features": true,
    "feature_selection": false
  },
  "detection": {
    "threshold": 0.5,
    "use_autoencoder": false,
    "use_ensemble": true,
    "isolation_forest_n_estimators": 100,
    "isolation_forest_contamination": "auto",
    "autoencoder_encoding_dim": 8,
    "autoencoder_hidden_layers": [64, 32, 16],
    "autoencoder_learning_rate": 0.001,
    "autoencoder_input_dim": null,
    "autoencoder_use_tflite": false
  },
  "privacy": {
    "data_retention_days": 30,
    "anonymization_level": "basic",
    "collect_command_lines": false,
    "encrypt_storage": false,
    "hash_sensitive_data": true
  },
  "alerting": {
    "enabled": true,
    "correlation_window": 300,
    "rate_limit": 5,
    "rate_window": 3600,
    "min_severity": "medium",
    "enable_local_notifications": true
  },
  "logging": {
    "level": "INFO",
    "format": "json",
    "file_path": null,
    "max_file_size_mb": 100,
    "backup_count": 5,
    "enable_console": true
  },
  "metrics": {
    "enabled": true,
    "prometheus_enabled": false,
    "prometheus_port": 9090,
    "collection_interval": 30,
    "retention_hours": 168
  },
  "enable_ml_features": true,
  "max_memory_usage_mb": 1024,
  "graceful_shutdown_timeout": 30,
  "health_check_interval": 60
}
AGENT_CONFIG
    chmod 640 "${AGENT_CFG}"
fi

# ── 8. Enable systemd service (but do NOT start it yet) ──────────────────────
if command -v systemctl &>/dev/null && systemctl --version &>/dev/null 2>&1; then
    systemctl daemon-reload
    systemctl enable edgepulse-agent.service 2>/dev/null || true
fi

# ── 9. Print setup instructions ──────────────────────────────────────────────
cat <<'INSTRUCTIONS'

╔══════════════════════════════════════════════════════════════════════════════╗
║            EdgePulse Agent — Installation Complete                          ║
║                                                                              ║
║  The agent is installed but NOT yet running.                                 ║
║  Complete the following steps to finish configuration:                       ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  STEP 1 — Edit the enrollment configuration                                  ║
║  ─────────────────────────────────────────                                   ║
║  Open the enrollment file and replace the placeholder values:                ║
║                                                                              ║
║    sudo nano /etc/edgepulse/enrollment.json                                  ║
║                                                                              ║
║  Set ALL of these values (get them from your EdgePulse dashboard):           ║
║    "supabase_url"       → your Supabase project URL                          ║
║                           e.g. https://abcdefghij.supabase.co               ║
║    "enrollment_token"   → one-time token from the Devices page               ║
║    "supabase_anon_key"  → your Supabase anon/public API key                  ║
║                                                                              ║
║  STEP 2 — Enroll this device                                                 ║
║  ────────────────────────────                                                ║
║    sudo /opt/edgepulse/venv/bin/edge-agent enroll                            ║
║                                                                              ║
║  On success you will see:                                                    ║
║    ✓ Device enrolled successfully!                                           ║
║      Device ID : <uuid>                                                      ║
║      API Key   : <key>...                                                    ║
║                                                                              ║
║  STEP 3 — Start the agent service                                            ║
║  ───────────────────────────────                                             ║
║    sudo systemctl start edgepulse-agent                                      ║
║                                                                              ║
║  STEP 4 — Verify the service is running                                      ║
║  ──────────────────────────────────────                                      ║
║    sudo systemctl status edgepulse-agent                                     ║
║                                                                              ║
║  STEP 5 — Watch live logs                                                    ║
║  ────────────────────────                                                    ║
║    sudo journalctl -u edgepulse-agent -f                                     ║
║                                                                              ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  USEFUL COMMANDS                                                              ║
║                                                                              ║
║  Check enrollment & model status:                                            ║
║    sudo /opt/edgepulse/venv/bin/edge-agent status                            ║
║                                                                              ║
║  Re-enroll (e.g. token expired):                                             ║
║    sudo nano /etc/edgepulse/enrollment.json   (update token)                 ║
║    sudo /opt/edgepulse/venv/bin/edge-agent enroll                            ║
║                                                                              ║
║  Stop the service:                                                           ║
║    sudo systemctl stop edgepulse-agent                                       ║
║                                                                              ║
║  Edit agent settings:                                                        ║
║    sudo nano /etc/edgepulse/agent_config.json                                ║
║    sudo systemctl restart edgepulse-agent                                    ║
║                                                                              ║
║  Uninstall:                                                                  ║
║    sudo dpkg --purge edgepulse-agent                                         ║
║                                                                              ║
║  Documentation:  https://docs.edgepulse.io                                  ║
╚══════════════════════════════════════════════════════════════════════════════╝

INSTRUCTIONS
POSTINST_SCRIPT

chmod 755 "${POSTINST}"

# ---- prerm: stop service ----
PRERM="${SCRIPT_DIR}/prerm"
cat > "${PRERM}" <<'PRERM_SCRIPT'
#!/bin/bash
set -e
if command -v systemctl &>/dev/null; then
    systemctl stop edgepulse-agent.service  2>/dev/null || true
    systemctl disable edgepulse-agent.service 2>/dev/null || true
    systemctl daemon-reload 2>/dev/null || true
fi
PRERM_SCRIPT
chmod 755 "${PRERM}"

# ---- postrm: cleanup ----
POSTRM="${SCRIPT_DIR}/postrm"
cat > "${POSTRM}" <<'POSTRM_SCRIPT'
#!/bin/bash
set -e
case "$1" in
    purge)
        if command -v systemctl &>/dev/null; then
            systemctl stop edgepulse-agent.service 2>/dev/null || true
            systemctl disable edgepulse-agent.service 2>/dev/null || true
            rm -f /etc/systemd/system/edgepulse-agent.service
            systemctl daemon-reload 2>/dev/null || true
        fi
        rm -rf /var/lib/edgepulse /var/log/edgepulse /run/edgepulse /etc/edgepulse /opt/edgepulse
        ;;
esac
POSTRM_SCRIPT
chmod 755 "${POSTRM}"

# ---------------------------------------------------------------------------
# Build with fpm (thin package - no bundled deps!)
# ---------------------------------------------------------------------------
echo ""
echo "Building .deb with fpm..."

fpm \
    --input-type dir \
    --output-type deb \
    --name "${PACKAGE_NAME}" \
    --version "${VERSION}" \
    --architecture "${ARCH}" \
    --maintainer "${MAINTAINER}" \
    --description "${DESCRIPTION}" \
    --url "${URL}" \
    --license "Proprietary" \
    --category "utils" \
    --deb-priority "optional" \
    --depends "python3 (>= 3.9), python3 (<< 3.14)" \
    --depends "adduser" \
    --depends "libsecret-1-0" \
    --after-install "${POSTINST}" \
    --before-remove "${PRERM}" \
    --after-remove "${POSTRM}" \
    --package "${OUTPUT}" \
    --chdir "${STAGING_DIR}" \
    --prefix "/" \
    .

# Clean up maintainer scripts from source tree
rm -f "${POSTINST}" "${PRERM}" "${POSTRM}"

echo ""
echo "============================================================"
echo "  SUCCESS: ${OUTPUT}"
echo "  Size   : $(du -sh "${OUTPUT}" | cut -f1)"
echo "============================================================"
echo ""
echo "  Package type: THIN (venv created on install)"
echo "  Python deps:  Installed at install-time (not bundled)"
echo ""
echo "  Install with:"
echo "    sudo dpkg -i ${OUTPUT}"
echo "    sudo apt-get install -f"
echo ""
echo "  What happens on install:"
echo "    1. Creates venv at /opt/edgepulse/venv"
echo "    2. Installs Python deps via pip (correct ABI)"
echo "    3. Bootstraps ML model"
echo "    4. Enables systemd service"
echo ""
