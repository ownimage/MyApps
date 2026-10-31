[CmdletBinding()]
param(
    [string] $Configuration = 'Release',
    [string] $Runtime = 'win-x64',
    [string] $Output,
    [switch] $FrameworkDependent,
    [switch] $NoZip
)

$ErrorActionPreference = 'Stop'

if (-not $Output) { $Output = Join-Path $PSScriptRoot 'out' }

$project = Join-Path $PSScriptRoot 'Midi.Capture.csproj'
if (-not (Test-Path $project)) {
    throw "Project not found: $project"
}

# Find a dotnet that actually has an SDK. The runtime-only host is not enough.
$dotnet = $null

$command = Get-Command dotnet -ErrorAction SilentlyContinue
if ($command) {
    $sdks = & $command.Source --list-sdks 2>$null
    if ($LASTEXITCODE -eq 0 -and $sdks) { $dotnet = $command.Source }
}

if (-not $dotnet) {
    $local = Join-Path $env:USERPROFILE '.dotnet\dotnet.exe'
    if (Test-Path $local) {
        $sdks = & $local --list-sdks 2>$null
        if ($LASTEXITCODE -eq 0 -and $sdks) { $dotnet = $local }
    }
}

if (-not $dotnet) {
    throw "No .NET SDK found. Install one with:  winget install Microsoft.DotNet.SDK.8"
}

Write-Host "dotnet   : $dotnet"
Write-Host "project  : $project"
Write-Host "output   : $Output"
Write-Host ""

$arguments = @(
    'publish', $project,
    '--configuration', $Configuration,
    '--runtime', $Runtime,
    '--output', $Output,
    '--nologo'
)

# Stamp the git commit into the banner, so a stale copy of the exe is obvious.
$stamp = '0.1.0'
try {
    $sha = & git -C $PSScriptRoot rev-parse --short HEAD 2>$null
    if ($LASTEXITCODE -eq 0 -and $sha) {
        $dirty = & git -C $PSScriptRoot status --porcelain -- . 2>$null
        if ($dirty) { $sha = "$sha-dirty" }
        $stamp = "$stamp+$sha"
    }
} catch {
    # No git, or not a repo. The plain version is still useful.
}
$arguments += "-p:InformationalVersion=$stamp"

if ($FrameworkDependent) {
    $arguments += '--self-contained'
    $arguments += 'false'
    $arguments += '-p:PublishSingleFile=false'
} else {
    # Self-contained: the target machine needs no .NET runtime installed.
    $arguments += '--self-contained'
    $arguments += 'true'
    $arguments += '-p:PublishSingleFile=false'
}

& $dotnet @arguments
if ($LASTEXITCODE -ne 0) {
    throw "dotnet publish failed with exit code $LASTEXITCODE"
}

$exe = Join-Path $Output 'midi-capture.exe'
if (-not (Test-Path $exe)) {
    throw "midi-capture.exe was not produced in $Output"
}

Write-Host ""
Write-Host "built    : $exe ($((Get-Item $exe).Length) bytes)"

if (-not $NoZip) {
    $zip = Join-Path $PSScriptRoot 'midi-capture.zip'
    if (Test-Path $zip) { Remove-Item $zip -Force }
    Compress-Archive -Path (Join-Path $Output '*') -DestinationPath $zip -Force
    Write-Host "packaged : $zip"
}

Write-Host ""
Write-Host "Built. Copy the whole folder to the machine with the MIDI device:"
Write-Host "  $Output"
