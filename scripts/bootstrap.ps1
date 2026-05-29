<#
.SYNOPSIS
LOCI Development Bootstrap — verifies all dependencies and guides setup.
Run this once when setting up the project on a new machine.

.DESCRIPTION
Checks Node.js, npm dependencies, Supabase CLI, and environment variables.
Provides clear instructions for anything that's missing.
#>

param([switch] $Fix)

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

Write-Host "`n===== LOCI Dev Bootstrap =====`n" -ForegroundColor Cyan

$allOk = $true

# ── 1. Node.js ──────────────────────────────────────
Write-Host "[1/5] Node.js" -ForegroundColor White
$nodeVersion = & node -v 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "  OK   node $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "  MISS Node.js not found. Install from https://nodejs.org (v20+)" -ForegroundColor Red
    $allOk = $false
}

# ── 2. npm dependencies ─────────────────────────────
Write-Host "[2/5] npm dependencies" -ForegroundColor White
if (-not (Test-Path "$projectRoot\node_modules\.package-lock.json")) {
    Write-Host "  WARN node_modules missing or incomplete. Run: npm install" -ForegroundColor Yellow
    if ($Fix) {
        Write-Host "  FIX  Running npm install..." -ForegroundColor Yellow
        npm install
    }
    $allOk = $false
} else {
    Write-Host "  OK   node_modules present" -ForegroundColor Green
}

# ── 3. Supabase CLI ─────────────────────────────────
Write-Host "[3/5] Supabase CLI" -ForegroundColor White
$sbVersion = & npx supabase --version 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "  OK   supabase $sbVersion" -ForegroundColor Green
} else {
    Write-Host "  WARN Supabase CLI not working. Already installed as devDependency." -ForegroundColor Yellow
    Write-Host "  INFO To start Supabase locally: npx supabase start" -ForegroundColor Gray
    Write-Host "  INFO To link to a project:     npx supabase link --project-ref <ref>" -ForegroundColor Gray
}

# ── 4. Environment variables ────────────────────────
Write-Host "[4/5] Environment variables (LOCI_* in OS env)" -ForegroundColor White

$requiredVars = @{
    "LOCI_SUPABASE_URL"              = "VITE_SUPABASE_URL"
    "LOCI_SUPABASE_ANON_KEY"         = "VITE_SUPABASE_ANON_KEY"
}

$optionalVars = @{
    "LOCI_SUPABASE_FUNCTIONS_URL"    = "VITE_SUPABASE_FUNCTIONS_URL"
    "LOCI_CV_EXTRACTOR_URL"          = "VITE_CV_EXTRACTOR_URL"
    "LOCI_SUPABASE_SERVICE_ROLE_KEY" = "SUPABASE_SERVICE_ROLE_KEY"
    "LOCI_DEEPSEEK_API_KEY"          = "DEEPSEEK_API_KEY"
    "LOCI_DEEPSEEK_MODEL"            = "DEEPSEEK_MODEL"
    "LOCI_ANTHROPIC_API_KEY"         = "ANTHROPIC_API_KEY"
    "LOCI_OPENAI_API_KEY"            = "OPENAI_API_KEY"
    "LOCI_GEMINI_API_KEY"            = "GEMINI_API_KEY"
    "LOCI_LLM_PROVIDER"              = "LLM_PROVIDER"
    "LOCI_APP_ORIGIN"                = "APP_ORIGIN"
    "LOCI_APP_OWNER"                 = "VITE_APP_OWNER"
}

$missingRequired = @()
$missingOptional = @()
$foundVars = @()

foreach ($osVar in $requiredVars.Keys) {
    $value = [Environment]::GetEnvironmentVariable($osVar, "User")
    if (-not $value) { $value = [Environment]::GetEnvironmentVariable($osVar, "Machine") }
    if ($value) {
        $foundVars += "$osVar  ->  $($requiredVars[$osVar])"
    } else {
        $missingRequired += $osVar
        $allOk = $false
    }
}

foreach ($osVar in $optionalVars.Keys) {
    $value = [Environment]::GetEnvironmentVariable($osVar, "User")
    if (-not $value) { $value = [Environment]::GetEnvironmentVariable($osVar, "Machine") }
    if ($value) {
        $foundVars += "$osVar  ->  $($optionalVars[$osVar])"
    } else {
        $missingOptional += $osVar
    }
}

if ($foundVars.Count -gt 0) {
    Write-Host "  Found:" -ForegroundColor Green
    foreach ($v in $foundVars) {
        Write-Host "    $v" -ForegroundColor Cyan
    }
}

if ($missingRequired.Count -gt 0) {
    Write-Host "  REQUIRED (missing):" -ForegroundColor Red
    foreach ($v in $missingRequired) {
        $envKey = $requiredVars[$v]
        Write-Host "    [Environment]::SetEnvironmentVariable('$v', '<value>', 'User')  # -> $envKey" -ForegroundColor Red
    }
}

if ($missingOptional.Count -gt 0) {
    Write-Host "  Optional (not set):" -ForegroundColor Yellow
    foreach ($v in $missingOptional) {
        $envKey = $optionalVars[$v]
        Write-Host "    [Environment]::SetEnvironmentVariable('$v', '<value>', 'User')  # -> $envKey" -ForegroundColor DarkYellow
    }
}

if ($missingRequired.Count -gt 0) {
    Write-Host "`n  TIP: Set the required vars in a PowerShell admin window, then re-run this script." -ForegroundColor Yellow
} elseif ($missingOptional.Count -gt 0 -and $missingOptional.Contains("LOCI_DEEPSEEK_API_KEY")) {
    Write-Host "`n  TIP: Set LOCI_DEEPSEEK_API_KEY to use Deepseek as the LLM provider." -ForegroundColor Yellow
    Write-Host "  Get a key at https://platform.deepseek.com/api_keys" -ForegroundColor Gray
}

# ── 5. Verify build ─────────────────────────────────
Write-Host "[5/5] Build check" -ForegroundColor White
$envFile = Join-Path $projectRoot ".env.local"

if ($missingRequired.Count -gt 0) {
    Write-Host "  SKIP Cannot run full build without required env vars." -ForegroundColor Yellow
    Write-Host "  INFO You can still write code; the dev server and build need env vars." -ForegroundColor Gray
} else {
    # Generate .env.local from OS env vars
    & "$PSScriptRoot\inject-secrets.ps1"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  WARN inject-secrets.ps1 failed." -ForegroundColor Yellow
    }

    Write-Host "  Running build..." -ForegroundColor Gray
    $buildResult = & npm run build 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  OK   Build passes" -ForegroundColor Green
    } else {
        Write-Host "  WARN Build had issues (may be missing API keys for Edge Functions):" -ForegroundColor Yellow
        Write-Host "  $buildResult" -ForegroundColor DarkYellow
    }
}

# ── Summary ─────────────────────────────────────────
Write-Host "`n===== Summary =====`n" -ForegroundColor Cyan

if ($allOk -and $missingOptional.Count -le 4) {
    Write-Host "Ready to develop. Run:  npm run dev" -ForegroundColor Green
    Write-Host ""
    Write-Host "Quick start:"
    Write-Host "  1. Add your Deepseek API key to OS env vars (see above)"
    Write-Host "  2. Run: .\scripts\inject-secrets.ps1"
    Write-Host "  3. Run: npm run dev"
    Write-Host "  4. Open: http://localhost:5173"
} elseif ($allOk) {
    Write-Host "Core dependencies OK. Set at least one LLM API key above." -ForegroundColor Yellow
    Write-Host "Then run:  npm run dev" -ForegroundColor Yellow
} else {
    Write-Host "Fix the REQUIRED items above, then re-run: .\scripts\bootstrap.ps1" -ForegroundColor Red
}

Write-Host ""
