# Auto-uploads the latest APK to Google Drive after a Gradle build.
# Triggered by a Claude Code PostToolUse hook on Bash.
# Requires rclone configured with a "gdrive" remote.

param()
$ErrorActionPreference = 'SilentlyContinue'

# Read hook stdin JSON
try {
    $raw = [Console]::In.ReadToEnd()
    $json = $raw | ConvertFrom-Json
} catch {
    exit 0
}

$cmd = $json.tool_input.command
if ($cmd -notmatch 'gradlew') { exit 0 }
if ($cmd -notmatch '(assembleDebug|assembleRelease|assemble)') { exit 0 }

# Find the newest APK (must have been written in the last 5 minutes)
$apkSearchPaths = @(
    "C:\Working\omnisync\app\android\app\build\outputs\apk",
    "$env:USERPROFILE\Downloads"
)

$cutoff = (Get-Date).AddMinutes(-5)
$apk = $apkSearchPaths |
    Where-Object { Test-Path $_ } |
    ForEach-Object { Get-ChildItem $_ -Recurse -Filter "*.apk" -ErrorAction SilentlyContinue } |
    Where-Object { $_.LastWriteTime -gt $cutoff } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $apk) { exit 0 }

# Locate rclone (handles both PATH and winget install locations)
$rcloneCmd = Get-Command rclone -ErrorAction SilentlyContinue
$rclonePath = if ($rcloneCmd) { $rcloneCmd.Source } else { $null }
if (-not $rclonePath) {
    $rclonePath = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter "rclone.exe" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1 -ExpandProperty FullName
}
if (-not $rclonePath) {
    Write-Host "[APK Upload] rclone not installed. Run: winget install Rclone.Rclone"
    exit 0
}

$remoteCheck = & $rclonePath about "gdrive:" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[APK Upload] gdrive remote not ready. Run: & '$rclonePath' config reconnect gdrive:"
    exit 0
}

# Get version from app.json
$appJson = Get-Content "C:\Working\omnisync\app\app.json" -Raw | ConvertFrom-Json
$version = $appJson.expo.version
$destName = "OmniSync${version}.apk"

# Stage into the shared AppRelease folder, then upload from there.
$stagingDir = "C:\Working\AppRelease"
$null = New-Item -ItemType Directory -Force $stagingDir
$stagingPath = Join-Path $stagingDir $destName
Copy-Item $apk.FullName $stagingPath -Force
Write-Host "[APK] Staged: $stagingPath"

Write-Host "[APK Upload] Uploading as $destName..."
& $rclonePath copyto $stagingPath "gdrive:OmniSync APKs/$destName" --ignore-checksum 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "[APK Upload] Done: $destName -> gdrive:OmniSync APKs/"
} else {
    Write-Host "[APK Upload] Upload failed. Check: & '$rclonePath' config show gdrive"
}
