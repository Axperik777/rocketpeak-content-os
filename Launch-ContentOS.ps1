$ErrorActionPreference = 'Stop'
$appRoot = $PSScriptRoot
$appUrl = 'https://axperik777.github.io/rocketpeak-content-os/#settings'
$runtimeDir = Join-Path $appRoot 'runtime'
$logPath = Join-Path $runtimeDir 'launch.log'

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null

function Write-LaunchLog {
    param([string]$Message)
    $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Add-Content -LiteralPath $logPath -Value "$stamp $Message" -Encoding UTF8
}

try {
    Write-LaunchLog 'Launcher started.'

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
