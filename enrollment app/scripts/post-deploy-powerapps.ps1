Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('dev', 'test', 'prod')]
  [string]$Stage,

  [Parameter(Mandatory = $false)]
  [string]$ConfigPath = '.\scripts\powerapps-deploy.config.json',

  [Parameter(Mandatory = $false)]
  [switch]$SkipBuild
)

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,

    [Parameter(Mandatory = $false)]
    [string[]]$Arguments = @(),

    [Parameter(Mandatory = $true)]
    [string]$Description
  )

  Write-Host "`n==> $Description" -ForegroundColor Cyan
  Write-Host "    $FilePath $($Arguments -join ' ')" -ForegroundColor DarkGray

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($Arguments -join ' ')"
  }
}

function Get-RequiredProperty {
  param(
    [Parameter(Mandatory = $true)]
    [psobject]$Object,

    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  $value = $Object.$Name
  if ([string]::IsNullOrWhiteSpace([string]$value)) {
    throw "Missing required config property '$Name'."
  }

  return [string]$value
}

function Assert-NotPlaceholder {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Value,

    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  if ($Value -match '^replace-with-') {
    throw "Config property '$Name' still has a placeholder value: '$Value'"
  }
}

if (-not (Test-Path -LiteralPath $ConfigPath)) {
  throw "Config file not found at '$ConfigPath'."
}

$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$appName = Get-RequiredProperty -Object $config -Name 'appName'

$target = $config.environments.$Stage
if ($null -eq $target) {
  throw "Environment '$Stage' is not defined in '$ConfigPath'."
}

$environmentId = Get-RequiredProperty -Object $target -Name 'environmentId'
Assert-NotPlaceholder -Value $environmentId -Name "$Stage.environmentId"

if ($null -eq $target.dataSources -or $target.dataSources.Count -eq 0) {
  throw "No dataSources configured for '$Stage' in '$ConfigPath'."
}

Write-Host "Starting post-deploy setup for stage '$Stage'." -ForegroundColor Green
Write-Host "App Name: $appName" -ForegroundColor Green
Write-Host "Environment: $environmentId" -ForegroundColor Green

Invoke-CheckedCommand -FilePath 'pac' -Arguments @('code', 'init', '-n', $appName, '-env', $environmentId) -Description 'Initialize app against target environment'

foreach ($dataSource in $target.dataSources) {
  $apiId = Get-RequiredProperty -Object $dataSource -Name 'apiId'
  $connectionId = Get-RequiredProperty -Object $dataSource -Name 'connectionId'
  Assert-NotPlaceholder -Value $connectionId -Name "$Stage.$apiId.connectionId"

  $args = @('code', 'add-data-source', '-a', $apiId, '-c', $connectionId)

  if ($dataSource.PSObject.Properties.Name -contains 'table' -and -not [string]::IsNullOrWhiteSpace([string]$dataSource.table)) {
    $args += @('-t', [string]$dataSource.table)
  }

  if ($dataSource.PSObject.Properties.Name -contains 'dataset' -and -not [string]::IsNullOrWhiteSpace([string]$dataSource.dataset)) {
    $args += @('-d', [string]$dataSource.dataset)
  }

  Invoke-CheckedCommand -FilePath 'pac' -Arguments $args -Description "Add data source '$apiId'"
}

if (-not $SkipBuild.IsPresent) {
  Invoke-CheckedCommand -FilePath 'npm.cmd' -Arguments @('run', 'build') -Description 'Build app'
}

Invoke-CheckedCommand -FilePath 'npx.cmd' -Arguments @('power-apps', 'push') -Description 'Push app with Power Apps CLI wrapper'

Write-Host "`nPost-deploy setup completed successfully for '$Stage'." -ForegroundColor Green
