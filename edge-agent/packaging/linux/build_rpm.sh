#!/usr/bin/env bash
# =============================================================================
#  build_rpm.sh  —  Build an EdgePulse Agent .rpm package using fpm
#
#  Run from the edge-agent/ directory:
#      bash packaging/linux/build_rpm.sh
#
#  Prerequisites:
#      gem install fpm
#      yum install rpm-build   (on the build host)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

VERSION=$(python3 -c "
import re, pathlib
text = pathlib.Path('${REPO_ROOT}/pyproject.toml').read_text()
m = re.search(r'version\s*=\s*[\"\']([\d.]+)[\"\']\s', text)
print(m.group(1) if m else '0.1.0')
")

PACKAGE_NAME="edgepulse-agent"
ARCH="x86_64"
DIST_DIR="${REPO_ROOT}/packaging/dist"
OUTPUT="${DIST_DIR}/${PACKAGE_NAME}-${VERSION}-1.${ARCH}.rpm"
STAGING_DIR="/tmp/edgepulse-rpm-staging"

INSTALL_PREFIX="/opt/edgepulse"
SITE_PACKAGES="${INSTALL_PREFIX}/lib/site-packages"

echo "============================================================"
echo "  Building EdgePulse Agent .rpm"
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

MODEL_PATH="${REPO_ROOT}/src/models/edgepulse_primary_isolation_forest.joblib"
if [[ ! -f "${MODEL_PATH}" ]]; then
    echo "Bootstrapping model (no model found)..."
    cd "${REPO_ROOT}"
    python3 src/edgepulse/scripts/bootstrap_model.py --output-dir src/models/
fi

# ---------------------------------------------------------------------------
# Stage files
# ---------------------------------------------------------------------------
echo "[1/4] Staging files..."
rm -rf "${STAGING_DIR}"
mkdir -p \
    "${STAGING_DIR}${INSTALL_PREFIX}/bin" \
    "${STAGING_DIR}${INSTALL_PREFIX}/lib" \
    "${STAGING_DIR}${INSTALL_PREFIX}/share/edgepulse" \
    "${STAGING_DIR}/etc/systemd/system" \
    "${STAGING_DIR}/etc/edgepulse" \
    "${STAGING_DIR}/var/lib/edgepulse/models" \
    "${DIST_DIR}"

# ---------------------------------------------------------------------------
# Install Python packages via pip --target
# ---------------------------------------------------------------------------
echo "[2/4] Installing Python packages via pip --target..."
python3 -m pip install --quiet --upgrade pip wheel setuptools

python3 -m pip install --quiet \
    --target "${STAGING_DIR}${SITE_PACKAGES}" \
    --no-compile \
    --no-build-isolation \
    "${REPO_ROOT}[api-full,notifications,ml-inference]"

# Remove unnecessary metadata to keep the RPM lean
rm -rf "${STAGING_DIR}${SITE_PACKAGES}"/pip \
       "${STAGING_DIR}${SITE_PACKAGES}"/wheel \
       "${STAGING_DIR}${SITE_PACKAGES}"/setuptools \
       "${STAGING_DIR}${SITE_PACKAGES}"/*.dist-info/RECORD || true

# Entry-point launcher — uses system python3 declared as a dependency
cat > "${STAGING_DIR}${INSTALL_PREFIX}/bin/edge-agent" <<'WRAPPER'
#!/bin/bash
# EdgePulse Agent launcher
export PYTHONPATH=/opt/edgepulse/lib/site-packages${PYTHONPATH:+:${PYTHONPATH}}
exec python3 -m edgepulse "$@"
WRAPPER
chmod 755 "${STAGING_DIR}${INSTALL_PREFIX}/bin/edge-agent"

cp "${REPO_ROOT}/src/edgepulse/scripts/bootstrap_model.py" "${STAGING_DIR}${INSTALL_PREFIX}/share/edgepulse/"

# Model
cp "${MODEL_PATH}" "${STAGING_DIR}/var/lib/edgepulse/models/"

# systemd unit
cat > "${STAGING_DIR}/etc/systemd/system/edgepulse-agent.service" <<'UNIT'
[Unit]
Description=EdgePulse AI-powered security monitoring and anomaly detection agent
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=60
StartLimitBurst=3

[Service]
Type=simple
ExecStart=/opt/edgepulse/bin/edge-agent run --config /etc/edgepulse/agent_config.json
WorkingDirectory=/var/lib/edgepulse
RuntimeDirectory=edgepulse
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=edgepulse-agent
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/var/lib/edgepulse /var/log/edgepulse /run/edgepulse /etc/edgepulse
PrivateTmp=true
LimitNOFILE=65535
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
UNIT

# Default config
cat > "${STAGING_DIR}/etc/edgepulse/agent_config.json" <<'CONF'
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
    "supabase_url": "https://YOUR_PROJECT.supabase.co",
    "supabase_key": "YOUR_SUPABASE_ANON_KEY",
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
CONF

# ---------------------------------------------------------------------------
# Maintainer scripts (written to a temp dir, cleaned up after fpm)
# ---------------------------------------------------------------------------
SCRIPTS_TMP="$(mktemp -d)"

POSTINST="${SCRIPTS_TMP}/rpm_postinst.sh"
cat > "${POSTINST}" <<'POSTINST_RPM'
#!/bin/bash
set -e
# $1 = 1 on fresh install, 2 on upgrade
for dir in /var/lib/edgepulse /var/lib/edgepulse/models /var/lib/edgepulse/data \
           /var/log/edgepulse /run/edgepulse; do
    mkdir -p "$dir" && chmod 750 "$dir"
done

if [[ "$1" -eq 1 ]]; then
    MODEL="/var/lib/edgepulse/models/edgepulse_primary_isolation_forest.joblib"
    if [[ ! -f "$MODEL" ]]; then
        echo "EdgePulse: Bootstrapping ML model..."
        PYTHONPATH=/opt/edgepulse/lib/site-packages \
        python3 /opt/edgepulse/share/edgepulse/bootstrap_model.py \
            --output-dir /var/lib/edgepulse/models/ --n-samples 2000 2>&1 | sed 's/^/  /'
    fi
    systemctl daemon-reload 2>/dev/null || true
    systemctl enable edgepulse-agent.service 2>/dev/null || true
    echo "EdgePulse Agent installed. Start with: systemctl start edgepulse-agent"
fi
POSTINST_RPM
chmod 755 "${POSTINST}"

PREUN="${SCRIPTS_TMP}/rpm_preun.sh"
cat > "${PREUN}" <<'PREUN_RPM'
#!/bin/bash
# $1 = 0 on uninstall, 1 on upgrade
if [[ "$1" -eq 0 ]]; then
    systemctl stop edgepulse-agent.service 2>/dev/null || true
    systemctl disable edgepulse-agent.service 2>/dev/null || true
    systemctl daemon-reload 2>/dev/null || true
fi
PREUN_RPM
chmod 755 "${PREUN}"

# ---------------------------------------------------------------------------
# Build with fpm
# ---------------------------------------------------------------------------
echo "[3/4] Running fpm (rpm)..."

fpm \
    --input-type dir \
    --output-type rpm \
    --name "${PACKAGE_NAME}" \
    --version "${VERSION}" \
    --iteration 1 \
    --architecture "${ARCH}" \
    --maintainer "EdgePulse <support@edgepulse.io>" \
    --description "EdgePulse AI-powered security monitoring and anomaly detection agent" \
    --url "https://edgepulse.io" \
    --license "Proprietary" \
    --category "System Environment/Daemons" \
    --depends "python3 >= 3.9" \
    --after-install "${POSTINST}" \
    --before-remove "${PREUN}" \
    --rpm-summary "EdgePulse security monitoring agent" \
    --rpm-os "linux" \
    --package "${OUTPUT}" \
    --chdir "${STAGING_DIR}" \
    --prefix "/" \
    .

echo "[4/4] Cleaning up..."
rm -rf "${SCRIPTS_TMP}"

echo ""
echo "============================================================"
echo "  SUCCESS: ${OUTPUT}"
echo "  Size   : $(du -sh "${OUTPUT}" | cut -f1)"
echo "============================================================"
echo ""
echo "  Install with:"
echo "    sudo rpm -ivh ${OUTPUT}"
echo "  Or:"
echo "    sudo dnf install ${OUTPUT}"
echo ""