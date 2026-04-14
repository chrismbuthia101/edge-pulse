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
    "${REPO_ROOT}[api-full,notifications]"

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

# Default config
cat > "${STAGING_DIR}/etc/edgepulse/agent_config.json" <<'CONF'
{
  "collection_interval": 60,
  "detection_threshold": 0.5,
  "sync_enabled": false,
  "offline_queue_size": 10000,
  "logging_level": "INFO",
  "enable_process_monitoring": true,
  "enable_network_monitoring": true
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