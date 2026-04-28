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

# CLI package lives in ./cli/ at repo root
cli_src = os.path.join(os.getcwd(), 'cli')

# Collect all uvicorn submodules (it uses dynamic imports heavily)
uvicorn_hidden   = collect_submodules('uvicorn')
fastapi_hidden   = collect_submodules('fastapi')
pydantic_hidden  = collect_submodules('pydantic')
anyio_hidden     = collect_submodules('anyio')
httpx_hidden     = collect_submodules('httpx')
# AI agent providers — lazily imported inside functions so PyInstaller misses them
anthropic_hidden = collect_submodules('anthropic')
openai_hidden    = collect_submodules('openai')

hidden_imports = (
    uvicorn_hidden + fastapi_hidden + pydantic_hidden +
    anyio_hidden + httpx_hidden + anthropic_hidden + openai_hidden +
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

# ── Main app Analysis ─────────────────────────────────────────────────────────
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

# ── ts CLI Analysis ───────────────────────────────────────────────────────────
ts_hidden = collect_submodules('typer') + collect_submodules('rich')

b = Analysis(
    [os.path.join('backend', 'ts_entry.py')],
    pathex=[os.path.join(os.getcwd(), 'backend'), os.getcwd()],
    binaries=[],
    datas=[(cli_src, 'ts')],
    hiddenimports=ts_hidden + httpx_hidden + ['ts', 'ts.cli', 'ts.client', 'ts.config', 'ts.output',
        'ts.commands', 'ts.commands.pipeline', 'ts.commands.run', 'ts.commands.schedule',
        'ts.commands.catalog', 'ts.commands.transform', 'ts.commands.dq',
        'ts.commands.agent', 'ts.commands.context', 'ts.commands.admin',
        'keyring', 'keyring.backend'],
    hookspath=[],
    runtime_hooks=[],
    excludes=['tkinter', 'matplotlib', 'numpy', 'pandas'],
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)
ts_pyz = PYZ(b.pure, b.zipped_data, cipher=block_cipher)

# ── Platform-specific output ──────────────────────────────────────────────────

if sys.platform == 'darwin':
    # Mac: .app bundle — ts binary sits alongside TransformStudio in Contents/MacOS/
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
    ts_exe = EXE(
        ts_pyz, b.scripts, [],
        exclude_binaries=True,
        name='ts',
        debug=False,
        bootloader_ignore_signals=False,
        strip=False,
        upx=False,
        console=True,
    )
    coll = COLLECT(
        exe, ts_exe,
        a.binaries, a.zipfiles, a.datas,
        b.binaries, b.zipfiles, b.datas,
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
    # Windows: two separate .exe files in dist/
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
    ts_exe = EXE(
        ts_pyz, b.scripts, b.binaries, b.zipfiles, b.datas, [],
        name='ts',
        debug=False,
        strip=False,
        upx=True,
        console=True,
        onefile=True,
    )

else:
    # Linux: directory bundle — ts binary sits alongside TransformStudio
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
    ts_exe = EXE(
        ts_pyz, b.scripts, [],
        exclude_binaries=True,
        name='ts',
        debug=False,
        strip=False,
        upx=True,
        console=True,
    )
    coll = COLLECT(
        exe, ts_exe,
        a.binaries, a.zipfiles, a.datas,
        b.binaries, b.zipfiles, b.datas,
        strip=False, upx=True, upx_exclude=[],
        name='TransformStudio',
    )
