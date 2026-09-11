#Requires -Version 7.2
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$id = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
$log = Join-Path $repo ".fuel-trim-local/logs/test-$id.log"
$null = New-Item -ItemType Directory -Path (Split-Path $log -Parent) -Force
$exitCode = 1
function Invoke-TestNative([string]$Program, [string[]]$Arguments) {
    ('> ' + $Program + ' ' + ($Arguments -join ' ')) | Tee-Object -FilePath $log -Append | Write-Host
    & $Program @Arguments 2>&1 | Tee-Object -FilePath $log -Append | Write-Host
    $code = $LASTEXITCODE
    "Exit code: $code" | Tee-Object -FilePath $log -Append | Write-Host
    if ($code -ne 0) { $exception = [Exception]::new("Test command failed with exit code $code. See $log"); $exception.Data['NativeExitCode'] = $code; throw $exception }
}
Push-Location $repo
try {
    $null = Get-Command docker -ErrorAction Stop
    $imageMatch = [regex]::Matches((Get-Content -LiteralPath (Join-Path $repo 'scripts/dev-env/run.cmd') -Raw), 'ghcr\.io/flybywiresim/dev-env@sha256:[a-f0-9]{64}')
    if ($imageMatch.Count -ne 1) { throw 'Expected exactly one pinned development image in run.cmd.' }
    $dockerArgs = @('run', '--rm', '-v', "${repo}:/external", '-w', '/external', '--env', 'CI=true', '--env', 'GITHUB_ACTIONS=', $imageMatch[0].Value)
    Invoke-TestNative docker ($dockerArgs + @('bash', '-c', 'set -e; clang++ -std=c++17 -Wall -Wextra -Werror scripts/fuel-trim/fuel-trim-test.cpp -o /tmp/a339x-fuel-trim-test; /tmp/a339x-fuel-trim-test'))
    Invoke-TestNative docker ($dockerArgs + @('node', '--test', 'scripts/fuel-trim/contracts.test.cjs'))
    Invoke-TestNative (Join-Path $PSHOME 'pwsh.exe') @('-NoProfile', '-File', (Join-Path $PSScriptRoot 'Test-Deployment.ps1'))
    Write-Output "Fuel and deployment checks passed. Log: $log"
    $exitCode = 0
} catch {
    if ($_.Exception.Data.Contains('NativeExitCode')) { $exitCode = [int]$_.Exception.Data['NativeExitCode'] }
    Write-Error -Message $_.Exception.Message -ErrorAction Continue
} finally { Pop-Location }
exit $exitCode
