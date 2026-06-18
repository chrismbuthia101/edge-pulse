# EdgePulse Agent — Packaging Guide

This document covers how to build, test, and release all distribution artifacts
for the EdgePulse Agent: a PyPI wheel, a Debian `.deb`, an RPM `.rpm`, and a
Windows `.exe` installer.

---

## Contents

1. [Artifact overview](#artifact-overview)
2. [Directory layout](#directory-layout)
3. [Prerequisites](#prerequisites)
4. [Building each artifact](#building-each-artifact)
   - [PyPI wheel](#pypi-wheel)
   - [Debian .deb](#debian-deb)
   - [RPM .rpm](#rpm-rpm)
   - [Windows installer](#windows-installer)
6. [CI/CD pipeline](#cicd-pipeline)
7. [Releasing a new version](#releasing-a-new-version)
8. [Installed file layout](#installed-file-layout)
9. [Troubleshooting](#troubleshooting)

---

## Artifact overview

| Artifact | File | Platform | Installs via |
|----------|------|----------|-------------|
| Python wheel | `edge_agent-X.Y.Z-py3-none-any.whl` | Any | `pip install` |
| Source dist | `edge_agent-X.Y.Z.tar.gz` | Any | `pip install` |
| Debian package | `edgepulse-agent_X.Y.Z_amd64.deb` | Ubuntu / Debian | `dpkg -i` / `apt` |
| RPM package | `edgepulse-agent-X.Y.Z-1.x86_64.rpm` | RHEL / Fedora / SUSE | `rpm -i` / `dnf` |
| Windows installer | `EdgePulse-Agent-Setup-X.Y.Z.exe` | Windows 10+ x64 | NSIS GUI or `/S` silent |

---

## Directory layout

```
edge-agent/
├── pyproject.toml               # Package metadata and dependencies
├── src/
│   ├── edgepulse/               # Installed Python package
│   └── models/                  # Pre-trained model files
│       └── edgepulse_primary_isolation_forest.joblib
└── packaging/
    ├── README.md                # This file
    ├── dist/                    # All build outputs land here (git-ignored)
    ├── agent_config.json        # Shared default agent configuration
    ├── linux/
    │   ├── build_deb.sh         # Builds the .deb
    │   └── build_rpm.sh         # Builds the .rpm
    └── windows/
        ├── build_windows.ps1    # Orchestrates PyInstaller + NSIS
        ├── nsis/
        │   └── installer.nsi    # NSIS installer script
        └── pyinstaller/
            └── edgepulse.spec   # PyInstaller spec
```

All finished packages are written to `packaging/dist/`. That directory is
git-ignored and is created automatically by each build script.

---

## Prerequisites

### Common (all platforms)

- **Python 3.9–3.12** with `pip` ≥ 23
- **Make** — standard on Linux/macOS, install via `choco install make` on Windows

### Wheel only

No extra tools. Uses the standard `build` module.

### Debian .deb

- **Ruby + fpm** — `gem install fpm`
- A Debian/Ubuntu build host (the script targets `amd64`)

### RPM .rpm

- **Ruby + fpm** — `gem install fpm`
- **rpm-build** — `sudo apt-get install rpm` (on Ubuntu CI) or
  `sudo yum install rpm-build` (on RHEL)

### Windows installer

- **PyInstaller** — `pip install pyinstaller`
- **NSIS 3.09+** — download from <https://nsis.sourceforge.io/> or
  `choco install nsis --version=3.09 -y`
- `makensis` on `PATH`

---



---

## Building each artifact

All commands are run from the `edge-agent/` directory.

### PyPI wheel

```bash
# Install build tools
pip install build twine

# Build wheel + sdist
make wheel

# Optional: verify the wheel before uploading
twine check dist/*
```

Output: `dist/edge_agent-X.Y.Z-py3-none-any.whl` and `dist/edge_agent-X.Y.Z.tar.gz`

To upload to PyPI:

```bash
twine upload dist/*
# Or via the CI Trusted Publisher (see .github/workflows/release.yml)
```

### Debian .deb

```bash
# From edge-agent/
make deb
```

**What the script does:**

1. Reads the version from `pyproject.toml`.
2. Installs all Python packages to a staging area using
   `pip install --target`, which avoids the Python interpreter relocation
   problem that plagued the previous venv-copy approach.
3. Writes a launcher wrapper at `/opt/edgepulse/bin/edge-agent` that sets
   `PYTHONPATH` and calls the system `python3`.
4. Bundles the model, a systemd unit, and a default config.
5. Runs `fpm` to produce the `.deb`.

Output: `packaging/dist/edgepulse-agent_X.Y.Z_amd64.deb`

**Install / uninstall:**

```bash
sudo dpkg -i packaging/dist/edgepulse-agent_X.Y.Z_amd64.deb
sudo apt-get install -f          # fix any missing system deps

sudo dpkg -r edgepulse-agent     # remove (keep data)
sudo dpkg -P edgepulse-agent     # purge (remove data too)
```

### RPM .rpm

```bash
make rpm
```

Same approach as the `.deb` build. Uses `pip --target` and sets `PYTHONPATH`
in the launcher.

Output: `packaging/dist/edgepulse-agent-X.Y.Z-1.x86_64.rpm`

**Install / uninstall:**

```bash
sudo rpm -ivh packaging/dist/edgepulse-agent-X.Y.Z-1.x86_64.rpm
# or
sudo dnf install packaging/dist/edgepulse-agent-X.Y.Z-1.x86_64.rpm

sudo rpm -e edgepulse-agent
```

### Windows installer

Run in PowerShell from the `edge-agent\` directory:

```powershell
.\packaging\windows\build_windows.ps1

# Override version (e.g. for a pre-release)
.\packaging\windows\build_windows.ps1 -Version "1.2.3-rc1"
```

**What the script does:**

1. Reads the version from `pyproject.toml` (or uses `-Version`).
2. Installs Python dependencies via `pip install -e .[api-full,notifications]`.
3. Runs `pyinstaller packaging/windows/pyinstaller/edgepulse.spec` to
   produce a self-contained bundle at `dist/edgepulse/`.
4. Copies the model into the bundle.
5. Runs `makensis /DPRODUCT_VERSION=X.Y.Z packaging/windows/nsis/installer.nsi`
   to produce the setup executable.

Output: `packaging/dist/EdgePulse-Agent-Setup-X.Y.Z.exe`

**Silent install / uninstall:**

```powershell
# Silent install
.\EdgePulse-Agent-Setup-X.Y.Z.exe /S

# Silent uninstall
"C:\Program Files\EdgePulse\uninstall.exe" /S
```

**NSIS version override** — the installer script uses:

```nsis
!ifndef PRODUCT_VERSION
  !define PRODUCT_VERSION "0.1.0"
!endif
```

The `!ifndef` guard means calling `makensis /DPRODUCT_VERSION=1.2.3` correctly
overrides the default without causing a "macro already defined" compile error.

---



---

## Releasing a new version

1. **Update the version** in `edge-agent/pyproject.toml`:

   ```toml
   [tool.poetry]
   version = "1.2.3"
   ```

2. **Commit and tag:**

   ```bash
   git add pyproject.toml
   git commit -m "Release v1.2.3"
   git tag v1.2.3
   git push origin main --tags
   ```

---

## Installed file layout

### Linux (.deb / .rpm)

```
/opt/edgepulse/
├── bin/
│   └── edge-agent          # Launcher wrapper (sets PYTHONPATH)
└── lib/
    └── site-packages/      # All Python packages (installed by pip --target)

/var/lib/edgepulse/
├── models/                 # ML model files
└── data/                   # Runtime database and sync queue

/etc/edgepulse/
└── agent_config.json       # Default configuration

/etc/systemd/system/
└── edgepulse-agent.service # systemd unit

/var/log/edgepulse/         # Log files
/run/edgepulse/             # Runtime socket / PID files
```

### Windows (NSIS installer)

```
C:\Program Files\EdgePulse\     # INSTALL_DIR — the PyInstaller bundle
    edge-agent.exe
    ... (all bundled DLLs and .pyd files)

C:\ProgramData\EdgePulse\       # DATA_DIR — persists across upgrades
    models\
        edgepulse_primary_isolation_forest.joblib
    data\
    logs\
    agent_config.json
```

---

## Troubleshooting

### `edge-agent: command not found` after .deb install

The wrapper is at `/opt/edgepulse/bin/edge-agent`. Add it to PATH:

```bash
export PATH="/opt/edgepulse/bin:$PATH"
```

Or create a symlink:

```bash
sudo ln -sf /opt/edgepulse/bin/edge-agent /usr/local/bin/edge-agent
```

### `ModuleNotFoundError: No module named 'edgepulse'`

The launcher wrapper sets `PYTHONPATH=/opt/edgepulse/lib/site-packages`. If
you are running `python3 -m edgepulse` directly (not via the wrapper), you
need to set it manually:

```bash
PYTHONPATH=/opt/edgepulse/lib/site-packages python3 -m edgepulse run
```

### `No model file found` warning on startup

### fpm: `No such file or directory` during .deb build

Make sure you are running the script **from the `edge-agent/` directory**,
not from the repository root:

```bash
cd edge-agent
bash packaging/linux/build_deb.sh
```

### NSIS: `!define: macro already defined: PRODUCT_VERSION`

This was a bug in the original `installer.nsi`. The corrected version wraps
the define in `!ifndef PRODUCT_VERSION ... !endif`, so
`makensis /DPRODUCT_VERSION=X.Y.Z` works correctly.

### NSIS: `undefined macro: WordReplace`

This was a bug in the original `installer.nsi`. The corrected version adds
`!include "WordFunc.nsh"` which provides `${WordReplace}`.

### PyInstaller fails with `FileNotFoundError: src/data/schema.sql`

This was a bug in the original `edgepulse.spec`. The corrected version
removes that reference — `DatabaseManager` uses inline SQL, not a `.sql` file.

### Windows Service won't start after install

Check the Event Viewer under **Windows Logs → Application** for errors from
`EdgePulseAgent`. Common causes:

- Config file missing: the installer writes a default to
  `C:\ProgramData\EdgePulse\agent_config.json`
- Port 8080 already in use: change `API__PORT` in the config file