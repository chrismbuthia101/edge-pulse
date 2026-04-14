# =============================================================================
#  edgepulse.spec  —  PyInstaller spec file for EdgePulse Agent
#
#  Usage (from edge-agent/ directory):
#      pyinstaller packaging/windows/pyinstaller/edgepulse.spec
#
#  Output: dist/edgepulse/   (one-dir bundle)
#          dist/edgepulse/edge-agent.exe
# =============================================================================

import sys
import os
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths — resolve relative to the spec file's location
# ---------------------------------------------------------------------------
# When PyInstaller runs a .spec, __file__ is the spec path.
SPEC_DIR = os.path.dirname(os.path.abspath(SPECPATH))          # packaging/windows/pyinstaller/
REPO_ROOT = os.path.abspath(os.path.join(SPEC_DIR, '..', '..', '..'))  # edge-agent/
SRC_ROOT  = os.path.join(REPO_ROOT, 'src')

# ---------------------------------------------------------------------------
# Collected data files (bundled into the .exe directory)
# ---------------------------------------------------------------------------
datas = [
    # Include the schema SQL so the DB manager can read it
    (os.path.join(SRC_ROOT, 'data', 'schema.sql'), 'data'),
    # Include the bootstrap script so post-install can call it
    (os.path.join(REPO_ROOT, 'bootstrap_model.py'), '.'),
    # Default config (empty placeholder; real config goes in ProgramData)
    (os.path.join(REPO_ROOT, '.env.example'), '.'),
]

# Include the model file if it was bootstrapped before packaging
model_path = os.path.join(SRC_ROOT, 'models', 'edgepulse_primary_isolation_forest.joblib')
if os.path.exists(model_path):
    datas.append((os.path.join(SRC_ROOT, 'models'), 'models'))
    print(f"[spec] Including bootstrapped model from {model_path}")
else:
    print("[spec] WARNING: No model file found — run bootstrap_model.py before packaging")

# ---------------------------------------------------------------------------
# Hidden imports
#   PyInstaller's static analysis misses some runtime imports
# ---------------------------------------------------------------------------
hiddenimports = [
    # Core Python / standard library
    'importlib.metadata',
    'importlib.resources',
    'importlib_metadata',
    'email.mime.text',
    'email.mime.multipart',
    '_cffi_backend',
    'ctypes',

    # Pydantic / pydantic-settings
    'pydantic',
    'pydantic.v1',
    'pydantic_settings',
    'pydantic_core',

    # Structlog
    'structlog',
    'structlog.contextvars',
    'structlog.dev',
    'structlog.processors',

    # ML / numerical
    'sklearn',
    'sklearn.ensemble',
    'sklearn.ensemble._iforest',
    'sklearn.utils._cython_blas',
    'sklearn.utils._weight_vector',
    'sklearn.neighbors._dist_metrics',
    'numpy',
    'numpy.core._multiarray_umath',
    'joblib',
    'joblib.externals.loky',
    'joblib.externals.loky.backend',

    # Async / HTTP
    'asyncio',
    'aiosqlite',
    'httpx',
    'httpx._transports.default',
    'httpcore',
    'tenacity',

    # Database
    'sqlite3',

    # Cryptography
    'cryptography',
    'cryptography.fernet',
    'cryptography.hazmat.primitives',
    'cryptography.hazmat.primitives.kdf.pbkdf2',
    'cryptography.hazmat.backends.openssl',

    # Windows service (pywin32)
    'win32service',
    'win32serviceutil',
    'win32event',
    'servicemanager',
    'win32api',
    'win32con',
    'win32security',

    # Optional extras — include so the binary works with them installed
    'psutil',
    'fastapi',
    'uvicorn',
    'uvicorn.main',
    'uvicorn.config',
    'uvicorn.loops.asyncio',

    # EdgePulse internal modules
    'edgepulse',
    'edgepulse.core',
    'edgepulse.core.agent',
    'edgepulse.core.async_pipeline',
    'edgepulse.core.events_bus',
    'edgepulse.config',
    'edgepulse.config.settings',
    'edgepulse.config.privacy',
    'edgepulse.collectors',
    'edgepulse.features',
    'edgepulse.detectors',
    'edgepulse.alerts',
    'edgepulse.analysis',
    'edgepulse.sync',
    'edgepulse.storage',
    'edgepulse.auth',
    'edgepulse.platform.windows',
    'edgepulse.platform.windows.windows_service',
    'edgepulse.platform.windows.windows_service.service',
    'edgepulse.platform.windows.windows_service.installer',
    'edgepulse.platform.windows.windows_service.service_wrapper',
    'edgepulse.shared',
    'edgepulse.utils',
    'edgepulse.cli',
]

# ---------------------------------------------------------------------------
# Excluded modules (shrinks bundle size)
# ---------------------------------------------------------------------------
excludes = [
    'test',
    'tests',
    'unittest',
    'pytest',
    'IPython',
    'ipykernel',
    'notebook',
    'matplotlib',
    'PIL',
    'Pillow',
    'tkinter',
    '_tkinter',
    'wx',
    'PyQt5',
    'PyQt6',
    'PySide2',
    'PySide6',
    # TF / SHAP are optional — the agent works without them
    'tensorflow',
    'keras',
    'shap',
    'lime',
]

# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------
block_cipher = None

a = Analysis(
    # Entry point
    [os.path.join(SRC_ROOT, 'edgepulse', '__main__.py')],
    pathex=[SRC_ROOT, REPO_ROOT],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[
        os.path.join(SPEC_DIR, 'hooks'),  # custom hooks if needed
    ],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='edge-agent',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,         # compress with UPX if available (reduces size ~30%)
    console=True,     # keep console so service logs are visible
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=os.path.join(SPEC_DIR, 'edgepulse.ico') if os.path.exists(
        os.path.join(SPEC_DIR, 'edgepulse.ico')
    ) else None,
    version=os.path.join(SPEC_DIR, 'version_info.txt') if os.path.exists(
        os.path.join(SPEC_DIR, 'version_info.txt')
    ) else None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[
        # Do not compress these — they break if compressed
        'vcruntime140.dll',
        'python3*.dll',
        'win32*.pyd',
    ],
    name='edgepulse',  # → dist/edgepulse/
)