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

# Read version from pyproject.toml (no external deps required)
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
VENV_DIR="/tmp/edgepulse-build-venv"
DIST_DIR="${REPO_ROOT}/packaging/dist"
OUTPUT="${DIST_DIR}/${PACKAGE_NAME}_${VERSION}_${ARCH}.deb"

INSTALL_PREFIX="/opt/edgepulse"
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
    python3 bootstrap_model.py --output-dir src/models/
fi

# ---------------------------------------------------------------------------
# Clean staging area
# ---------------------------------------------------------------------------
echo "[1/7] Cleaning staging directory..."
rm -rf "${STAGING_DIR}"
mkdir -p "${STAGING_DIR}${INSTALL_PREFIX}"
mkdir -p "${STAGING_DIR}${SYSTEMD_DIR}"
mkdir -p "${STAGING_DIR}${CONFIG_DIR}"
mkdir -p "${DIST_DIR}"

# ---------------------------------------------------------------------------
# Build virtual environment with all dependencies
# ---------------------------------------------------------------------------
echo "[2/7] Building virtual environment..."
rm -rf "${VENV_DIR}"
python3 -m venv "${VENV_DIR}"
source "${VENV_DIR}/bin/activate"

pip install --quiet --upgrade pip wheel

# Install from pyproject.toml with all relevant extras
pip install --quiet \
    "${REPO_ROOT}[api-full,notifications]" \
    --extra-index-url https://pypi.org/simple

deactivate

# ---------------------------------------------------------------------------
# Populate staging: venv → INSTALL_PREFIX
# ---------------------------------------------------------------------------
echo "[3/7] Copying venv into staging area..."

# Copy lib (Python packages)
cp -r "${VENV_DIR}/lib" "${STAGING_DIR}${INSTALL_PREFIX}/"

# Copy bin (entry points)
mkdir -p "${STAGING_DIR}${INSTALL_PREFIX}/bin"
# Create a wrapper script that calls the correct Python
cat > "${STAGING_DIR}${INSTALL_PREFIX}/bin/edge-agent" <<'WRAPPER'
#!/bin/bash
exec /opt/edgepulse/bin/python3 -m edgepulse "$@"
WRAPPER
chmod 755 "${STAGING_DIR}${INSTALL_PREFIX}/bin/edge-agent"

# Copy the Python interpreter itself
cp "${VENV_DIR}/bin/python3" "${STAGING_DIR}${INSTALL_PREFIX}/bin/python3"
# Make it a proper symlink-free copy
patchelf_available=false
if command -v patchelf &>/dev/null; then
    patchelf_available=true
fi

# Copy source files (needed for bootstrap_model.py etc.)
mkdir -p "${STAGING_DIR}${INSTALL_PREFIX}/share/edgepulse"
cp "${REPO_ROOT}/bootstrap_model.py" "${STAGING_DIR}${INSTALL_PREFIX}/share/edgepulse/"

# ---------------------------------------------------------------------------
# Copy bootstrapped model
# ---------------------------------------------------------------------------
echo "[4/7] Copying bootstrapped model..."
mkdir -p "${STAGING_DIR}${VAR_DIR}/models"
if [[ -f "${MODEL_PATH}" ]]; then
    cp "${MODEL_PATH}" "${STAGING_DIR}${VAR_DIR}/models/"
    # Also copy the metadata JSON if present
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
# Write postinst / prerm scripts (fpm will include these)
# ---------------------------------------------------------------------------
echo "[6/7] Writing maintainer scripts..."

POSTINST="${SCRIPT_DIR}/postinst"
cat > "${POSTINST}" <<'POSTINST_SCRIPT'
#!/bin/bash
set -e

# Create service directories
for dir in /var/lib/edgepulse /var/lib/edgepulse/models /var/lib/edgepulse/data \
           /var/log/edgepulse /run/edgepulse /etc/edgepulse; do
    mkdir -p "$dir"
    chmod 750 "$dir"
done

# Bootstrap the ML model if not already present
MODEL="/var/lib/edgepulse/models/edgepulse_primary_isolation_forest.joblib"
BUNDLED="/var/lib/edgepulse/models/edgepulse_primary_isolation_forest.joblib"

if [[ ! -f "$MODEL" ]]; then
    echo "EdgePulse: Bootstrapping anomaly detection model (this takes ~10 seconds)..."
    /opt/edgepulse/bin/python3 /opt/edgepulse/share/edgepulse/bootstrap_model.py \
        --output-dir /var/lib/edgepulse/models/ \
        --n-samples 2000 \
        2>&1 | sed 's/^/  /'
    echo "EdgePulse: Model ready."
fi

# Reload systemd and enable (but don't start) the service
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
# On purge, remove data directories
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