param(
  [ValidateSet("git")]
  [string]$Mode = "git"
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$toolDir = Join-Path $root "tools\gitleaks"
$exePath = Join-Path $toolDir "gitleaks.exe"

function Install-Gitleaks {
  New-Item -ItemType Directory -Force -Path $toolDir | Out-Null

  $release = Invoke-RestMethod -Uri "https://api.github.com/repos/gitleaks/gitleaks/releases/latest" -Headers @{
    "User-Agent" = "loci-tooling"
  }
  $asset = $release.assets | Where-Object {
    $_.name -match "windows_x64\.zip$"
  } | Select-Object -First 1

  if (-not $asset) {
    throw "Could not find a Windows x64 Gitleaks release asset."
  }

  $zipPath = Join-Path $toolDir $asset.name
  Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zipPath -Headers @{
    "User-Agent" = "loci-tooling"
  }

  Expand-Archive -LiteralPath $zipPath -DestinationPath $toolDir -Force
  Remove-Item -LiteralPath $zipPath -Force

  if (-not (Test-Path -LiteralPath $exePath)) {
    throw "Downloaded Gitleaks archive did not contain gitleaks.exe."
  }
}

if (-not (Test-Path -LiteralPath $exePath)) {
  Install-Gitleaks
}

& $exePath version

if ($Mode -eq "git") {
  & $exePath git --config (Join-Path $root ".gitleaks.toml") --redact $root
}
