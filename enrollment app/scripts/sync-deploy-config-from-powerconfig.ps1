param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('dev', 'test', 'prod')]
  [string]$Stage,

  [Parameter(Mandatory = $false)]
  [string]$PowerConfigPath = '.\power.config.json',

  [Parameter(Mandatory = $false)]
  [string]$DeployConfigPath = '.\scripts\powerapps-deploy.config.json',

  [Parameter(Mandatory = $false)]
  [switch]$SkipEnvironmentId,

  [Parameter(Mandatory = $false)]
  [switch]$AllowOverwrite
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-ConnectionIdFromSharedConnectionPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SharedConnectionPath
  )

  if ($SharedConnectionPath -match '/connections/([^/]+)$') {
    return $Matches[1]
  }

  return $null
}

function Is-PlaceholderValue {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Value
  )

  return $Value -match '^replace-with-'
}

function Get-NormalizedApiId {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ApiId
  )

  $trimmed = $ApiId.Trim()
  if ($trimmed -match '/apis/([^/]+)$') {
    return $Matches[1]
  }

  return $trimmed
}

if (-not (Test-Path -LiteralPath $PowerConfigPath)) {
  throw "Cannot find power config at '$PowerConfigPath'."
}

if (-not (Test-Path -LiteralPath $DeployConfigPath)) {
  throw "Cannot find deploy config at '$DeployConfigPath'."
}

$powerConfig = Get-Content -LiteralPath $PowerConfigPath -Raw | ConvertFrom-Json
$deployConfig = Get-Content -LiteralPath $DeployConfigPath -Raw | ConvertFrom-Json

if ($null -eq $deployConfig.environments.$Stage) {
  throw "Stage '$Stage' does not exist in '$DeployConfigPath'."
}

$stageConfig = $deployConfig.environments.$Stage

$apiIdToConnectionId = @{}
foreach ($entry in $powerConfig.connectionReferences.PSObject.Properties) {
  $reference = $entry.Value

  if (
    $null -eq $reference -or
    -not ($reference.PSObject.Properties.Name -contains 'id') -or
    -not ($reference.PSObject.Properties.Name -contains 'sharedConnectionId')
  ) {
    continue
  }

  $apiId = [string]$reference.id
  $normalizedApiId = Get-NormalizedApiId -ApiId $apiId
  $sharedConnectionPath = [string]$reference.sharedConnectionId
  if ([string]::IsNullOrWhiteSpace($apiId) -or [string]::IsNullOrWhiteSpace($normalizedApiId) -or [string]::IsNullOrWhiteSpace($sharedConnectionPath)) {
    continue
  }

  $connectionId = Get-ConnectionIdFromSharedConnectionPath -SharedConnectionPath $sharedConnectionPath

  if ([string]::IsNullOrWhiteSpace($connectionId)) {
    continue
  }

  if (-not $apiIdToConnectionId.ContainsKey($apiId)) {
    $apiIdToConnectionId[$apiId] = $connectionId
  }
  if (-not $apiIdToConnectionId.ContainsKey($normalizedApiId)) {
    $apiIdToConnectionId[$normalizedApiId] = $connectionId
  }
}

$updatedCount = 0
$skippedCount = 0

if (-not $SkipEnvironmentId.IsPresent) {
  $discoveredEnvironmentId = [string]$powerConfig.environmentId
  if (-not [string]::IsNullOrWhiteSpace($discoveredEnvironmentId)) {
    if ($AllowOverwrite.IsPresent -or [string]::IsNullOrWhiteSpace([string]$stageConfig.environmentId) -or (Is-PlaceholderValue -Value ([string]$stageConfig.environmentId))) {
      $stageConfig.environmentId = $discoveredEnvironmentId
      $updatedCount++
      Write-Host "Updated $Stage.environmentId = $discoveredEnvironmentId" -ForegroundColor Green
    } else {
      $skippedCount++
      Write-Host "Skipped $Stage.environmentId (existing value is non-placeholder). Use -AllowOverwrite to replace." -ForegroundColor Yellow
    }
  }
}

foreach ($dataSource in $stageConfig.dataSources) {
  $apiId = [string]$dataSource.apiId
  $normalizedApiId = Get-NormalizedApiId -ApiId $apiId

  if (-not $apiIdToConnectionId.ContainsKey($apiId) -and -not $apiIdToConnectionId.ContainsKey($normalizedApiId)) {
    $skippedCount++
    Write-Host "No discovered shared connection ID for $apiId in power.config.json." -ForegroundColor Yellow
    continue
  }

  $lookupKey = if ($apiIdToConnectionId.ContainsKey($apiId)) { $apiId } else { $normalizedApiId }
  $discoveredConnectionId = [string]$apiIdToConnectionId[$lookupKey]
  $currentValue = [string]$dataSource.connectionId

  if ($AllowOverwrite.IsPresent -or [string]::IsNullOrWhiteSpace($currentValue) -or (Is-PlaceholderValue -Value $currentValue)) {
    $dataSource.connectionId = $discoveredConnectionId
    $updatedCount++
    Write-Host "Updated $Stage.$apiId.connectionId = $discoveredConnectionId" -ForegroundColor Green
  } else {
    $skippedCount++
    Write-Host "Skipped $Stage.$apiId.connectionId (existing value is non-placeholder). Use -AllowOverwrite to replace." -ForegroundColor Yellow
  }
}

$deployConfig | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $DeployConfigPath

Write-Host "`nSync complete. Updated: $updatedCount. Skipped: $skippedCount." -ForegroundColor Cyan
Write-Host "Next: run .\scripts\post-deploy-powerapps.ps1 -Stage $Stage -ConfigPath $DeployConfigPath" -ForegroundColor Cyan
