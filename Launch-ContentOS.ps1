$ErrorActionPreference = 'Stop'
$appRoot = $PSScriptRoot
$appUrl = 'http://127.0.0.1:4173/'
$runtimeDir = Join-Path $appRoot 'runtime'
$logPath = Join-Path $runtimeDir 'launch.log'

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null

function Write-LaunchLog {
    param([string]$Message)
    $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Add-Content -LiteralPath $logPath -Value "$stamp $Message" -Encoding UTF8
}

function Test-AppReady {
    try {
        return (Invoke-WebRequest -UseBasicParsing -Uri $appUrl -TimeoutSec 2).StatusCode -eq 200
    } catch {
        return $false
    }
}

try {
    Write-LaunchLog 'Launcher started.'

    if (-not (Test-AppReady)) {
        $npmPath = 'C:\Program Files\nodejs\npm.cmd'
        if (-not (Test-Path -LiteralPath $npmPath)) {
            $npmPath = (Get-Command npm.cmd -ErrorAction Stop).Source
        }

        Start-Process -FilePath $npmPath -ArgumentList @('run', 'preview', '--', '--port', '4173') -WorkingDirectory $appRoot -WindowStyle Hidden
        Write-LaunchLog 'Local server process started.'

        $ready = $false
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            Start-Sleep -Milliseconds 300
            if (Test-AppReady) {
                $ready = $true
                break
            }
        }

        if (-not $ready) {
            throw 'Local server did not become ready.'
        }
    }

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
