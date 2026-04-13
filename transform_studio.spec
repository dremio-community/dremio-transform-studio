# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for Dremio Transform Studio desktop app.
Run from the repo root:
  pyinstaller --clean transform_studio.spec
"""

import sys
import os
from PyInstaller.utils.hooks import collect_submodules, collect_data_files

block_cipher = None

# Collect all uvicorn submodules (it uses dynamic imports heavily)
uvicorn_hidden = collect_submodules('uvicorn')
fastapi_hidden = collect_submodules('fastapi')
pydantic_hidden = collect_submodules('pydantic')
anyio_hidden   = collect_submodules('anyio')
httpx_hidden   = collect_submodules('httpx')

hidden_imports = (
    uvicorn_hidden + fastapi_hidden + pydantic_hidden +
    anyio_hidden + httpx_hidden +
    [
        'aiosqlite',
        'croniter',
        'dotenv',
        'python_dotenv',
        'email_validator',
        'starlette',
        'starlette.staticfiles',
        'starlette.responses',
        'multipart',
        'python_multipart',
        # passlib uses dynamic handler imports — must list explicitly
        'passlib',
        'passlib.context',
        'passlib.handlers',
        'passlib.handlers.sha2_crypt',
        'passlib.handlers.bcrypt',
        'passlib.handlers.md5_crypt',
        'passlib.handlers.sha1_crypt',
        'passlib.handlers.pbkdf2',
        'passlib.handlers.argon2',
        'passlib.handlers.misc',
        'passlib.utils',
        'passlib.utils.handlers',
        'passlib.utils.pbkdf2',
        'passlib.crypto',
        'passlib.crypto.digest',
        'jose',
        'jose.jwt',
    ]
)

# Data files to bundle:
#   frontend/dist  → frontend_dist   (served as static files by FastAPI)
#   backend/transforms → transforms  (transform registry + codegen)
datas = [
    (os.path.join('frontend', 'dist'),         'frontend_dist'),
    (os.path.join('backend', 'transforms'),    'transforms'),
]

a = Analysis(
    [os.path.join('backend', 'desktop_launcher.py')],
    pathex=[os.path.join(os.getcwd(), 'backend')],
    binaries=[],
    datas=datas,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'matplotlib', 'numpy', 'pandas', 'PIL'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

# ── Platform-specific output ──────────────────────────────────────────────────

if sys.platform == 'darwin':
    # Mac: .app bundle
    exe = EXE(
        pyz, a.scripts, [],
        exclude_binaries=True,
        name='TransformStudio',
        debug=False,
        bootloader_ignore_signals=False,
        strip=False,
        upx=False,
        console=False,
        icon=os.path.join('build', 'icon.icns') if os.path.exists(os.path.join('build', 'icon.icns')) else None,
    )
    coll = COLLECT(
        exe, a.binaries, a.zipfiles, a.datas,
        strip=False, upx=False, upx_exclude=[],
        name='TransformStudio',
    )
    app = BUNDLE(
        coll,
        name='TransformStudio.app',
        icon=os.path.join('build', 'icon.icns') if os.path.exists(os.path.join('build', 'icon.icns')) else None,
        bundle_identifier='com.dremio.transform-studio',
        info_plist={
            'CFBundleName': 'Transform Studio',
            'CFBundleDisplayName': 'Dremio Transform Studio',
            'CFBundleShortVersionString': '1.0.0',
            'CFBundleVersion': '1.0.0',
            'NSHighResolutionCapable': True,
            'LSMinimumSystemVersion': '10.14.0',
        },
    )

elif sys.platform == 'win32':
    # Windows: single .exe
    exe = EXE(
        pyz, a.scripts, a.binaries, a.zipfiles, a.datas, [],
        name='TransformStudio',
        debug=False,
        bootloader_ignore_signals=False,
        strip=False,
        upx=True,
        upx_exclude=[],
        runtime_tmpdir=None,
        console=False,
        disable_windowed_traceback=False,
        target_arch=None,
        codesign_identity=None,
        entitlements_file=None,
        icon=os.path.join('build', 'icon.ico') if os.path.exists(os.path.join('build', 'icon.ico')) else None,
        onefile=True,
    )

else:
    # Linux: directory bundle (more reliable than onefile on Linux)
    exe = EXE(
        pyz, a.scripts, [],
        exclude_binaries=True,
        name='TransformStudio',
        debug=False,
        bootloader_ignore_signals=False,
        strip=False,
        upx=True,
        console=False,
    )
    coll = COLLECT(
        exe, a.binaries, a.zipfiles, a.datas,
        strip=False, upx=True, upx_exclude=[],
        name='TransformStudio',
    )
