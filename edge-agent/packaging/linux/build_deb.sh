#!/usr/bin/env bash
# Build an EdgePulse Agent .deb using fpm.
# Run from edge-agent/:  bash packaging/linux/build_deb.sh
# Prerequisites: gem install fpm, python3

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
ARCH="amd64"
MAINTAINER="EdgePulse <support@edgepulse.io>"
DESCRIPTION="EdgePulse AI-powered security monitoring and anomaly detection agent"
URL="https://edgepulse.io"

STAGING_DIR="/tmp/edgepulse-deb-staging"
DIST_DIR="${REPO_ROOT}/packaging/dist"
WHEEL_DIR="${REPO_ROOT}/dist"
OUTPUT="${DIST_DIR}/${PACKAGE_NAME}_${VERSION}_${ARCH}.deb"

INSTALL_PREFIX="/opt/edgepulse"

trap 'echo "Cleaning up staging..."; rm -rf "${STAGING_DIR}"' EXIT
SYSTEMD_DIR="/etc/systemd/system"
CONFIG_DIR="/etc/edgepulse"
VAR_DIR="/var/lib/edgepulse"

echo "Building EdgePulse Agent .deb  version=${VERSION}  output=${OUTPUT}"

if ! command -v fpm &>/dev/null; then
    echo "ERROR: fpm not found. Install with: gem install fpm"
    exit 1
fi

if ! command -v python3 &>/dev/null; then
    echo "ERROR: python3 not found."
    exit 1
fi

# ── Build sealed config (if SUPABASE_URL is set) ──────────────────────────
_BUILD_VARS_SRC="${REPO_ROOT}/src/edgepulse/_build_vars.py"
rm -f "${_BUILD_VARS_SRC}"

if [ -n "${SUPABASE_URL:-}" ]; then
    echo "[1/6] Generating sealed build config..."
    python3 "${REPO_ROOT}/packaging/scripts/seal_config.py" \
        --output "${_BUILD_VARS_SRC}"
    echo "  Sealed config written to ${_BUILD_VARS_SRC}"
else
    echo "[1/6] Skipping sealed config (SUPABASE_URL not set)"
fi

# ── Build Python wheel ────────────────────────────────────────────────────
echo "[2/6] Building Python wheel..."
cd "${REPO_ROOT}"
rm -rf "${WHEEL_DIR}"/*.whl 2>/dev/null || true
python3 -m pip install --quiet build 2>/dev/null || \
    python3 -m pip install --quiet --break-system-packages build
python3 -m build --wheel --no-isolation -o "${WHEEL_DIR}" .

WHEEL_FILE=$(ls "${WHEEL_DIR}"/edge_agent-*.whl 2>/dev/null | head -1)
if [[ -z "${WHEEL_FILE}" ]]; then
    echo "ERROR: Wheel build failed."
    rm -f "${_BUILD_VARS_SRC}"
    exit 1
fi
echo "  Wheel: $(basename "${WHEEL_FILE}")"

# Clean up build vars from source tree (now embedded in the wheel)
rm -f "${_BUILD_VARS_SRC}"

# ── Export poetry lockfile constraints (optional) ──────────────────────────
CONSTRAINT_FILE=""
if command -v poetry &>/dev/null; then
    if poetry export --without-hashes -f requirements.txt -o /tmp/ep-constraints.txt 2>/dev/null; then
        CONSTRAINT_FILE="/tmp/ep-constraints.txt"
        echo "  Using lockfile constraints from poetry.lock"
    else
        echo "  Note: poetry.lock not found — skipping lockfile constraint"
    fi
fi

# ── Create staging directory ──────────────────────────────────────────────
echo "[3/6] Creating staging directory..."
rm -rf "${STAGING_DIR}"
mkdir -p \
    "${STAGING_DIR}${INSTALL_PREFIX}/bin" \
    "${STAGING_DIR}${INSTALL_PREFIX}/lib" \
    "${STAGING_DIR}${SYSTEMD_DIR}" \
    "${STAGING_DIR}${CONFIG_DIR}" \
    "${STAGING_DIR}${VAR_DIR}/models" \
    "${DIST_DIR}"

# ── Stage files ───────────────────────────────────────────────────────────
echo "[4/6] Staging files..."

# Wheel (installed by postinst into the venv)
cp "${WHEEL_FILE}" "${STAGING_DIR}${INSTALL_PREFIX}/lib/"

# Constraint file (used by postinst for reproducible installs)
if [ -n "${CONSTRAINT_FILE}" ]; then
    cp "${CONSTRAINT_FILE}" "${STAGING_DIR}${INSTALL_PREFIX}/lib/constraints.txt"
fi

# Default config
cp "${REPO_ROOT}/packaging/agent_config.json" "${STAGING_DIR}${CONFIG_DIR}/agent_config.json"

# ML models
cp -r "${REPO_ROOT}/src/models/." "${STAGING_DIR}${VAR_DIR}/models/"

# Entry-point launcher
cat > "${STAGING_DIR}${INSTALL_PREFIX}/bin/edge-agent" <<'WRAPPER'
#!/bin/bash
VENV_PYTHON="/opt/edgepulse/venv/bin/python3"
if [[ ! -x "${VENV_PYTHON}" ]]; then
    echo "ERROR: EdgePulse venv not found at ${VENV_PYTHON}" >&2
    echo "  Reinstall the package: sudo apt-get install --reinstall edgepulse-agent" >&2
    exit 1
fi
exec "${VENV_PYTHON}" -m edgepulse "$@"
WRAPPER
chmod 755 "${STAGING_DIR}${INSTALL_PREFIX}/bin/edge-agent"

# systemd unit
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
Environment="EDGE_PULSE_DATA_DIR=/var/lib/edgepulse"
ExecStart=${INSTALL_PREFIX}/bin/edge-agent run --config /etc/edgepulse/agent_config.json
WorkingDirectory=${VAR_DIR}
RuntimeDirectory=edgepulse
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=edgepulse-agent
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=${VAR_DIR} /var/log/edgepulse /run/edgepulse /etc/edgepulse ${INSTALL_PREFIX}
PrivateTmp=true
LimitNOFILE=65535
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
UNIT

# ── Maintainer scripts ────────────────────────────────────────────────────
echo "[5/6] Writing maintainer scripts..."

POSTINST="${SCRIPT_DIR}/postinst"
BUILT_WHEEL="$(basename "${WHEEL_FILE}")"
cat > "${POSTINST}" <<POSTINST_SCRIPT
#!/bin/bash
set -e

WHEEL="/opt/edgepulse/lib/${BUILT_WHEEL}"
CONSTRAINTS="/opt/edgepulse/lib/constraints.txt"

echo ""
echo "EdgePulse Agent ${VERSION} — post-install setup"
echo ""

# Create runtime directories
for dir in /var/lib/edgepulse \
           /var/lib/edgepulse/models \
           /var/lib/edgepulse/data \
           /var/log/edgepulse \
           /run/edgepulse \
           /etc/edgepulse; do
    mkdir -p "\$dir"
    chmod 750 "\$dir"
done

# Create the virtual environment using the target machine's Python
echo "  Setting up Python virtual environment..."
python3 -m venv /opt/edgepulse/venv

/opt/edgepulse/venv/bin/pip install --quiet --upgrade pip wheel setuptools

# Install the wheel + dependencies
# Use constraints file if present (shipped with the package)
if [ -f "\${CONSTRAINTS}" ]; then
    echo "  Installing with pinned dependencies from constraints file..."
    /opt/edgepulse/venv/bin/pip install --quiet \
        --constraint "\${CONSTRAINTS}" \
        "\${WHEEL}[linux]"
    rm -f "\${CONSTRAINTS}"
else
    /opt/edgepulse/venv/bin/pip install --quiet "\${WHEEL}[linux]"
fi

# Clean up the wheel file
rm -f "\${WHEEL}"

# Marker file for system install detection
touch /opt/edgepulse/.system-install

# Enable and start the systemd service
if command -v systemctl &>/dev/null && systemctl --version &>/dev/null 2>&1; then
    systemctl daemon-reload
    systemctl enable edgepulse-agent.service 2>/dev/null || true
fi

echo ""
echo "EdgePulse Agent ${VERSION} installed."
echo "  Enroll:  sudo /opt/edgepulse/bin/edge-agent enroll <TOKEN>"
echo "  Start:   sudo systemctl start edgepulse-agent"
echo "  Status:  sudo systemctl status edgepulse-agent"
echo "  Logs:    sudo journalctl -u edgepulse-agent -f"
echo ""
POSTINST_SCRIPT
chmod 755 "${POSTINST}"

PRERM="${SCRIPT_DIR}/prerm"
cat > "${PRERM}" <<'PRERM_SCRIPT'
#!/bin/bash
set -e
if command -v systemctl &>/dev/null; then
    systemctl stop edgepulse-agent.service 2>/dev/null || true
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

# ── Build with fpm ────────────────────────────────────────────────────────
echo ""
echo "[6/6] Building .deb with fpm..."

rm -f "${OUTPUT}"
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
    --depends "python3-venv" \
    --depends "adduser" \
    --depends "libsecret-1-0" \
    --after-install "${POSTINST}" \
    --before-remove "${PRERM}" \
    --after-remove "${POSTRM}" \
    --package "${OUTPUT}" \
    --chdir "${STAGING_DIR}" \
    --prefix "/" \
    .

rm -f "${POSTINST}" "${PRERM}" "${POSTRM}"

# Generate SHA256 checksum
sha256sum "${OUTPUT}" > "${OUTPUT}.sha256"
echo "  Checksum: $(cat "${OUTPUT}.sha256")"

echo ""
echo "SUCCESS: ${OUTPUT}  ($(du -sh "${OUTPUT}" | cut -f1))"
echo "  Install: sudo dpkg -i ${OUTPUT} && sudo apt-get install -f"
