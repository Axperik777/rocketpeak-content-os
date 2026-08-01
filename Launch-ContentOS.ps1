$ErrorActionPreference = 'Stop'
$appRoot = $PSScriptRoot
$appUrl = 'https://axperik777.github.io/rocketpeak-content-os/#home'
$runtimeDir = Join-Path $appRoot 'runtime'
$logPath = Join-Path $runtimeDir 'launch.log'
$companionLog = Join-Path $runtimeDir 'local-companion.log'
$companionErrorLog = Join-Path $runtimeDir 'local-companion-error.log'
$companionUrl = 'http://127.0.0.1:43121/health'

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null

function Write-LaunchLog {
    param([string]$Message)
    $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Add-Content -LiteralPath $logPath -Value "$stamp $Message" -Encoding UTF8
}

try {
    Write-LaunchLog 'Launcher started.'

    $companionReady = $false
    try {
        $health = Invoke-RestMethod -Uri $companionUrl -Method Get -TimeoutSec 1
        $companionReady = [bool]$health.ok
    } catch { }

    if (-not $companionReady) {
        $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
        if (-not $nodeCommand) { throw 'Node.js is required for local project folders.' }
        $companionScript = Join-Path $appRoot 'scripts\local-companion.mjs'
        Start-Process -FilePath $nodeCommand.Source -ArgumentList @($companionScript) -WorkingDirectory $appRoot -WindowStyle Hidden -RedirectStandardOutput $companionLog -RedirectStandardError $companionErrorLog
        for ($attempt = 0; $attempt -lt 20; $attempt++) {
            Start-Sleep -Milliseconds 150
            try {
                $health = Invoke-RestMethod -Uri $companionUrl -Method Get -TimeoutSec 1
                if ($health.ok) { $companionReady = $true; break }
            } catch { }
        }
    }
    if ($companionReady) { Write-LaunchLog 'Local project folder companion is ready.' }
    else { Write-LaunchLog 'WARNING: Local project folder companion did not start.' }

    $chromePaths = @(
        'C:\Program Files\Google\Chrome\Application\chrome.exe',
        'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe'
    )
    $chromePath = $chromePaths | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

    if ($chromePath) {
        & $chromePath '--new-window' $appUrl
        Write-LaunchLog 'Application opened in Chrome.'
    } else {
        Start-Process $appUrl
        Write-LaunchLog 'Application opened in the default browser.'
    }
} catch {
    Write-LaunchLog ("ERROR: " + $_.Exception.Message)
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show('RocketPeak Content OS could not start. See runtime\launch.log.', 'RocketPeak Content OS') | Out-Null
    exit 1
}
