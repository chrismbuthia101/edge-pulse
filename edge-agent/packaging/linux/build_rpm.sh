#!/usr/bin/env bash
# Build an EdgePulse Agent .rpm using fpm.
# Run from edge-agent/:  bash packaging/linux/build_rpm.sh
# Prerequisites: gem install fpm, python3, rpm-build

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

VERSION=$(python3 -c "
import re, pathlib
text = pathlib.Path('${REPO_ROOT}/pyproject.toml').read_text()
m = re.search(r'version\s*=\s*[\"\']([\d.]+)[\"\']', text)
print(m.group(1) if m else '0.1.0')
")

PACKAGE_NAME="edgepulse-agent"
ARCH="x86_64"
DIST_DIR="${REPO_ROOT}/packaging/dist"
OUTPUT="${DIST_DIR}/${PACKAGE_NAME}-${VERSION}-1.${ARCH}.rpm"
STAGING_DIR="/tmp/edgepulse-rpm-staging"

INSTALL_PREFIX="/opt/edgepulse"
SITE_PACKAGES="${INSTALL_PREFIX}/lib/site-packages"

echo "Building EdgePulse Agent .rpm  version=${VERSION}  output=${OUTPUT}"

# Validate required build-time credentials
if [[ -z "${SUPABASE_URL:-}" ]]; then
    echo "ERROR: SUPABASE_URL must be set for production RPM builds"
    echo "       For dev builds: SUPABASE_URL=https://placeholder PUBLISHABLE_KEY=placeholder bash build_rpm.sh"
    exit 1
fi

trap 'echo "Cleaning up staging..."; rm -rf "${STAGING_DIR}"' EXIT

if ! command -v fpm &>/dev/null; then
    echo "ERROR: fpm not found. Install with: gem install fpm"
    exit 1
fi

if ! command -v python3 &>/dev/null; then
    echo "ERROR: python3 not found."
    exit 1
fi

# Stage files
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

# Install Python packages via pip --target
echo "[2/4] Installing Python packages via pip --target..."

if poetry export --without-hashes -f requirements.txt -o /tmp/ep-requirements.txt 2>/dev/null; then
    echo "  Using lockfile constraints from poetry.lock"
    CONSTRAINT="--constraint /tmp/ep-requirements.txt"
else
    CONSTRAINT=""
    echo "  Warning: poetry export unavailable — skipping lockfile constraint"
fi

python3 -m pip install --quiet --upgrade pip wheel setuptools
python3 -m pip install --quiet \
    --target "${STAGING_DIR}${SITE_PACKAGES}" \
    --no-compile \
    --no-build-isolation \
    ${CONSTRAINT:+"${CONSTRAINT}"} \
    "${REPO_ROOT}"

rm -rf "${STAGING_DIR}${SITE_PACKAGES}"/{pip,wheel,setuptools} \
       "${STAGING_DIR}${SITE_PACKAGES}"/*.dist-info/RECORD 2>/dev/null || true

# Write _build_vars.py with baked-in Supabase configuration
_EDGEPULSE_PKG="${STAGING_DIR}${SITE_PACKAGES}/edgepulse"
mkdir -p "${_EDGEPULSE_PKG}"
cat > "${_EDGEPULSE_PKG}/_build_vars.py" <<BUILD_VARS
# Auto-generated at package build time -- do not edit
BUILD_SUPABASE_URL: str = "${SUPABASE_URL:-}"
BUILD_PUBLISHABLE_KEY: str = "${PUBLISHABLE_KEY:-}"
BUILD_VARS

# Entry-point launcher
cat > "${STAGING_DIR}${INSTALL_PREFIX}/bin/edge-agent" <<'WRAPPER'
#!/bin/bash
export PYTHONPATH=/opt/edgepulse/lib/site-packages${PYTHONPATH:+:${PYTHONPATH}}
exec python3 -m edgepulse "$@"
WRAPPER
chmod 755 "${STAGING_DIR}${INSTALL_PREFIX}/bin/edge-agent"

cp "${REPO_ROOT}/packaging/agent_config.json" "${STAGING_DIR}/etc/edgepulse/agent_config.json"
cp -r "${REPO_ROOT}/src/models/." "${STAGING_DIR}/var/lib/edgepulse/models/"

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

# Maintainer scripts
SCRIPTS_TMP="$(mktemp -d)"

POSTINST="${SCRIPTS_TMP}/rpm_postinst.sh"
cat > "${POSTINST}" <<'POSTINST_RPM'
#!/bin/bash
set -e
for dir in /var/lib/edgepulse /var/lib/edgepulse/models /var/lib/edgepulse/data \
           /var/log/edgepulse /run/edgepulse; do
    mkdir -p "$dir" && chmod 750 "$dir"
done
if [[ "$1" -eq 1 ]]; then
    systemctl daemon-reload 2>/dev/null || true
    systemctl enable edgepulse-agent.service 2>/dev/null || true
    echo "EdgePulse Agent installed. Start with: systemctl start edgepulse-agent"
fi
POSTINST_RPM
chmod 755 "${POSTINST}"

PREUN="${SCRIPTS_TMP}/rpm_preun.sh"
cat > "${PREUN}" <<'PREUN_RPM'
#!/bin/bash
if [[ "$1" -eq 0 ]]; then
    systemctl stop edgepulse-agent.service 2>/dev/null || true
    systemctl disable edgepulse-agent.service 2>/dev/null || true
    systemctl daemon-reload 2>/dev/null || true
fi
PREUN_RPM
chmod 755 "${PREUN}"

# Build with fpm
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

# Generate SHA256 checksum
sha256sum "${OUTPUT}" > "${OUTPUT}.sha256"
echo "  Checksum: $(cat "${OUTPUT}.sha256")"

echo ""
echo "SUCCESS: ${OUTPUT}  ($(du -sh "${OUTPUT}" | cut -f1))"
echo "  Install: sudo rpm -ivh ${OUTPUT}"
echo "  Or:      sudo dnf install ${OUTPUT}"
