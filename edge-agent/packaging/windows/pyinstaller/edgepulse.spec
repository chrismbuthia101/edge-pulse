import sys
import os
from pathlib import Path

SPEC_DIR = os.path.abspath(SPECPATH)            # .../edge-agent/packaging/windows/pyinstaller
REPO_ROOT = os.path.abspath(os.path.join(SPEC_DIR, '..', '..', '..'))  # .../edge-agent
SRC_ROOT  = os.path.join(REPO_ROOT, 'src')      # .../edge-agent/src

datas = [
    (os.path.join(SRC_ROOT, 'data', 'schema.sql'), 'data'),
    (os.path.join(REPO_ROOT, '.env.example'), '.'),
    (os.path.join(SRC_ROOT, 'models'), 'models'),
    (os.path.join(REPO_ROOT, 'packaging', 'agent_config.json'), '.'),
]

hiddenimports = [
    '_cffi_backend',
    'pydantic',
    'pydantic.v1',
    'pydantic_settings',
    'pydantic_core',
    'structlog',
    'structlog.contextvars',
    'structlog.dev',
    'structlog.processors',
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
    'aiosqlite',
    'httpx',
    'httpx._transports.default',
    'httpcore',
    'tenacity',
    'cryptography',
    'cryptography.fernet',
    'cryptography.hazmat.primitives',
    'cryptography.hazmat.primitives.kdf.pbkdf2',
    'cryptography.hazmat.backends.openssl',
    'win32service',
    'win32serviceutil',
    'win32event',
    'servicemanager',
    'win32api',
    'win32con',
    'win32security',
    'psutil',
    'fastapi',
    'uvicorn',
    'uvicorn.main',
    'uvicorn.config',
    'uvicorn.loops.asyncio',
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

excludes = [
    'test', 'tests', 'unittest', 'pytest',
    'IPython', 'ipykernel', 'notebook',
    'matplotlib', 'PIL', 'Pillow',
    'tkinter', '_tkinter', 'wx',
    'PyQt5', 'PyQt6', 'PySide2', 'PySide6',
    'tensorflow', 'keras', 'shap', 'lime',
]

block_cipher = None

a = Analysis(
    [os.path.join(SRC_ROOT, 'edgepulse', '__main__.py')],
    pathex=[SRC_ROOT, REPO_ROOT],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[os.path.join(SPEC_DIR, 'hooks')],
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
    upx=True,
    console=True,
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
        'vcruntime140.dll',
        'python3*.dll',
        'win32*.pyd',
    ],
    name='edgepulse',
)