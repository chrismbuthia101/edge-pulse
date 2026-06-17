#Requires -Version 5.1

[CmdletBinding()]
param(
    [string]$Version = "",
    [switch]$SkipPyInstaller,
    [switch]$SkipNSIS,
    [switch]$Clean
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step([string]$msg) {
    Write-Host ""
    Write-Host "▶ $msg" -ForegroundColor Cyan
}

function Write-OK([string]$msg) {
    Write-Host "  ✓ $msg" -ForegroundColor Green
}

function Write-Warn([string]$msg) {
    Write-Host "  ⚠ $msg" -ForegroundColor Yellow
}

function Require-Command([string]$cmd) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Host "ERROR: '$cmd' not found on PATH." -ForegroundColor Red
        exit 1
    }
}

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot   = Resolve-Path (Join-Path $ScriptDir "..\..") | Select-Object -ExpandProperty Path
$SrcRoot    = Join-Path $RepoRoot "src"
$DistDir    = Join-Path $RepoRoot "packaging\dist"
$SpecFile   = Join-Path $ScriptDir "pyinstaller\edgepulse.spec"
$NsiFile    = Join-Path $ScriptDir "nsis\installer.nsi"

if (-not $Version) {
    $pyproject = Get-Content (Join-Path $RepoRoot "pyproject.toml") -Raw
    if ($pyproject -match 'version\s*=\s*"([\d.]+)"') {
        $Version = $Matches[1]
    } else {
        $Version = "0.1.0"
    }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor White
Write-Host "  EdgePulse Agent — Windows Build" -ForegroundColor White
Write-Host "  Version : $Version" -ForegroundColor White
Write-Host "============================================================" -ForegroundColor White

Write-Step "Checking prerequisites..."
Require-Command "python"
Require-Command "pip"
$pythonVer = python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
Write-OK "Python $pythonVer"

if (-not $SkipPyInstaller) { Require-Command "pyinstaller" }
if (-not $SkipNSIS)        { Require-Command "makensis"    }

if ($Clean) {
    Write-Step "Cleaning dist/..."
    $distPath = Join-Path $RepoRoot "dist"
    if (Test-Path $distPath) { Remove-Item $distPath -Recurse -Force }
    Write-OK "Cleaned dist/"
}

New-Item -ItemType Directory -Force -Path $DistDir | Out-Null

Write-Step "Installing Python dependencies..."
Push-Location $RepoRoot
try {
    pip install -e ".[api-full,notifications,ml-inference]" --quiet
    if ($LASTEXITCODE -ne 0) { throw "pip install failed" }
    pip install pyinstaller --quiet
    Write-OK "Dependencies installed"
} finally {
    Pop-Location
}

if (-not $SkipPyInstaller) {
    Write-Step "Running PyInstaller..."
    Push-Location $RepoRoot
    try {
        pyinstaller $SpecFile `
            --distpath (Join-Path $RepoRoot "dist") `
            --workpath (Join-Path $RepoRoot "build") `
            --noconfirm `
            --clean
        if ($LASTEXITCODE -ne 0) { throw "PyInstaller exited with code $LASTEXITCODE" }
    } finally {
        Pop-Location
    }

    $bundleDir = Join-Path $RepoRoot "dist\edgepulse"
    if (-not (Test-Path $bundleDir)) {
        throw "PyInstaller bundle not found at $bundleDir"
    }
    Write-OK "Bundle created: $bundleDir"

    $bundleModels = Join-Path $bundleDir "models"
    $sourceModels = Join-Path $SrcRoot "models"
    if (Test-Path $sourceModels) {
        Write-Step "Copying models into bundle..."
        New-Item -ItemType Directory -Force -Path $bundleModels | Out-Null
        Copy-Item "$sourceModels\*" $bundleModels -Recurse -Force
        Write-OK "Models copied to bundle"
    }

    $bundleConfig = Join-Path $bundleDir "agent_config.json"
    $sourceConfig = Join-Path $RepoRoot "packaging\agent_config.json"
    if (Test-Path $sourceConfig) {
        Write-Step "Copying default config into bundle..."
        Copy-Item $sourceConfig $bundleConfig -Force
        Write-OK "Default config copied to bundle"
    }
}

if (-not $SkipNSIS) {
    Write-Step "Compiling NSIS installer..."
    $bundleDir = Join-Path $RepoRoot "dist\edgepulse"
    if (-not (Test-Path $bundleDir)) {
        throw "PyInstaller bundle not found. Run without -SkipPyInstaller first."
    }

    Push-Location $RepoRoot
    try {
        makensis "/DPRODUCT_VERSION=$Version" $NsiFile
        if ($LASTEXITCODE -ne 0) { throw "makensis exited with code $LASTEXITCODE" }
    } finally {
        Pop-Location
    }

    $outputExe = Join-Path $DistDir "EdgePulse-Agent-Setup-$Version.exe"
    if (-not (Test-Path $outputExe)) {
        throw "Expected output not found: $outputExe"
    }

    $sizeKB = [math]::Round((Get-Item $outputExe).Length / 1KB)
    Write-OK "Installer created: $outputExe ($sizeKB KB)"
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  BUILD SUCCESSFUL" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green

$output = Join-Path $DistDir "EdgePulse-Agent-Setup-$Version.exe"
if (Test-Path $output) {
    Write-Host "  Installer: $output" -ForegroundColor White
    Write-Host ""
    Write-Host "  Test with (as Administrator):" -ForegroundColor Gray
    Write-Host "    $output /S" -ForegroundColor Gray
    Write-Host "    Get-Service EdgePulseAgent" -ForegroundColor Gray
}
Write-Host ""
