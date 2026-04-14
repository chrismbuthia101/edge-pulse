#!/usr/bin/env bash
# =============================================================================
#  build_deb.sh  —  Build an EdgePulse Agent .deb package using fpm
#
#  Run from the edge-agent/ directory:
#      bash packaging/linux/build_deb.sh
#
#  Prerequisites:
#      gem install fpm
#      python bootstrap_model.py   (run once before packaging)
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
OUTPUT="${DIST_DIR}/${PACKAGE_NAME}_${VERSION}_${ARCH}.deb"

INSTALL_PREFIX="/opt/edgepulse"
SITE_PACKAGES="${INSTALL_PREFIX}/lib/site-packages"
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

MODEL_PATH="${REPO_ROOT}/src/models/edgepulse_primary_isolation_forest.joblib"
if [[ ! -f "${MODEL_PATH}" ]]; then
    echo "WARNING: No bootstrapped model found at ${MODEL_PATH}"
    echo "         Running bootstrap_model.py now..."
    cd "${REPO_ROOT}"
    python3 src/edgepulse/scripts/bootstrap_model.py --output-dir src/models/
fi

# ---------------------------------------------------------------------------
# Clean staging area
# ---------------------------------------------------------------------------
echo "[1/7] Cleaning staging directory..."
rm -rf "${STAGING_DIR}"
mkdir -p \
    "${STAGING_DIR}${INSTALL_PREFIX}/bin" \
    "${STAGING_DIR}${INSTALL_PREFIX}/lib" \
    "${STAGING_DIR}${INSTALL_PREFIX}/share/edgepulse" \
    "${STAGING_DIR}${SYSTEMD_DIR}" \
    "${STAGING_DIR}${CONFIG_DIR}" \
    "${STAGING_DIR}${VAR_DIR}/models" \
    "${DIST_DIR}"

# ---------------------------------------------------------------------------
# Install Python packages with pip --target
# ---------------------------------------------------------------------------
echo "[2/7] Installing Python packages via pip --target..."
python3 -m pip install --quiet --upgrade pip wheel

python3 -m pip install --quiet \
    --target "${STAGING_DIR}${SITE_PACKAGES}" \
    --no-compile \
    "${REPO_ROOT}[api-full,notifications]"

# Remove pip/wheel/setuptools metadata to keep the package lean
rm -rf "${STAGING_DIR}${SITE_PACKAGES}"/pip \
       "${STAGING_DIR}${SITE_PACKAGES}"/wheel \
       "${STAGING_DIR}${SITE_PACKAGES}"/setuptools \
       "${STAGING_DIR}${SITE_PACKAGES}"/*.dist-info/RECORD || true

# ---------------------------------------------------------------------------
# Entry-point launcher
#
# Sets PYTHONPATH so the system python3 can find the packages installed
# above, then invokes the edgepulse module.
# ---------------------------------------------------------------------------
echo "[3/7] Writing entry-point launcher..."

cat > "${STAGING_DIR}${INSTALL_PREFIX}/bin/edge-agent" <<'WRAPPER'
#!/bin/bash
# EdgePulse Agent launcher
# Sets PYTHONPATH so the system python3 can find our bundled packages.
export PYTHONPATH=/opt/edgepulse/lib/site-packages${PYTHONPATH:+:${PYTHONPATH}}
exec python3 -m edgepulse "$@"
WRAPPER
chmod 755 "${STAGING_DIR}${INSTALL_PREFIX}/bin/edge-agent"

cp "${REPO_ROOT}/src/edgepulse/scripts/bootstrap_model.py" "${STAGING_DIR}${INSTALL_PREFIX}/share/edgepulse/"

# ---------------------------------------------------------------------------
# Copy bootstrapped model
# ---------------------------------------------------------------------------
echo "[4/7] Copying bootstrapped model..."
if [[ -f "${MODEL_PATH}" ]]; then
    cp "${MODEL_PATH}" "${STAGING_DIR}${VAR_DIR}/models/"
    META="${MODEL_PATH%.joblib}.json"
    [[ -f "${META}" ]] && cp "${META}" "${STAGING_DIR}${VAR_DIR}/models/"
fi

# ---------------------------------------------------------------------------
# systemd unit file
# ---------------------------------------------------------------------------
echo "[5/7] Writing systemd unit file..."
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
ExecStart=/opt/edgepulse/bin/edge-agent run
WorkingDirectory=/var/lib/edgepulse
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

# ---------------------------------------------------------------------------
# Default config file
# ---------------------------------------------------------------------------
cat > "${STAGING_DIR}${CONFIG_DIR}/agent_config.json" <<'CONF'
{
  "collection_interval": 60,
  "detection_threshold": 0.5,
  "sync_enabled": false,
  "offline_queue_size": 10000,
  "logging_level": "INFO",
  "enable_process_monitoring": true,
  "enable_network_monitoring": true,
  "model_type": "isolation_forest"
}
CONF

# ---------------------------------------------------------------------------
# Write postinst / prerm / postrm maintainer scripts
# ---------------------------------------------------------------------------
echo "[6/7] Writing maintainer scripts..."

POSTINST="${SCRIPT_DIR}/postinst"
cat > "${POSTINST}" <<'POSTINST_SCRIPT'
#!/bin/bash
set -e

# Create service directories with restricted permissions
for dir in /var/lib/edgepulse /var/lib/edgepulse/models /var/lib/edgepulse/data \
           /var/log/edgepulse /run/edgepulse /etc/edgepulse; do
    mkdir -p "$dir"
    chmod 750 "$dir"
done

# Bootstrap the ML model if not already present (e.g. fresh install without
# a bundled model, or if the bundled copy was skipped at package-build time).
MODEL="/var/lib/edgepulse/models/edgepulse_primary_isolation_forest.joblib"
if [[ ! -f "$MODEL" ]]; then
    echo "EdgePulse: Bootstrapping anomaly detection model (this takes ~10 seconds)..."
    PYTHONPATH=/opt/edgepulse/lib/site-packages \
    python3 /opt/edgepulse/share/edgepulse/bootstrap_model.py \
        --output-dir /var/lib/edgepulse/models/ \
        --n-samples 2000 \
        2>&1 | sed 's/^/  /'
    echo "EdgePulse: Model ready."
fi

# Reload systemd and enable (but don't auto-start) the service
if command -v systemctl &>/dev/null && systemctl --version &>/dev/null 2>&1; then
    systemctl daemon-reload
    systemctl enable edgepulse-agent.service
    echo ""
    echo "┌─────────────────────────────────────────────────────────┐"
    echo "│  EdgePulse Agent installed successfully!                │"
    echo "│                                                         │"
    echo "│  Start the service:                                     │"
    echo "│    sudo systemctl start edgepulse-agent                 │"
    echo "│                                                         │"
    echo "│  Check status:                                          │"
    echo "│    sudo systemctl status edgepulse-agent                │"
    echo "│                                                         │"
    echo "│  Edit config:                                           │"
    echo "│    sudo nano /etc/edgepulse/agent_config.json           │"
    echo "└─────────────────────────────────────────────────────────┘"
fi
POSTINST_SCRIPT
chmod 755 "${POSTINST}"

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

POSTRM="${SCRIPT_DIR}/postrm"
cat > "${POSTRM}" <<'POSTRM_SCRIPT'
#!/bin/bash
set -e
case "$1" in
    purge)
        rm -rf /var/lib/edgepulse /var/log/edgepulse /run/edgepulse /etc/edgepulse
        ;;
esac
POSTRM_SCRIPT
chmod 755 "${POSTRM}"

# ---------------------------------------------------------------------------
# Build with fpm
# ---------------------------------------------------------------------------
echo "[7/7] Running fpm..."

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
    --depends "python3 (>= 3.9)" \
    --depends "adduser" \
    --after-install "${POSTINST}" \
    --before-remove "${PRERM}" \
    --after-remove "${POSTRM}" \
    --package "${OUTPUT}" \
    --chdir "${STAGING_DIR}" \
    --prefix "/" \
    .

# Clean up maintainer scripts from the source tree
rm -f "${POSTINST}" "${PRERM}" "${POSTRM}"

echo ""
echo "============================================================"
echo "  SUCCESS: ${OUTPUT}"
echo "  Size   : $(du -sh "${OUTPUT}" | cut -f1)"
echo "============================================================"
echo ""
echo "  Install with:"
echo "    sudo dpkg -i ${OUTPUT}"
echo "    sudo apt-get install -f"
echo ""