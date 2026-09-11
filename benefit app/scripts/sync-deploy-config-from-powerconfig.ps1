param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('dev', 'test', 'prod')]
  [string]$Stage,

  [Parameter(Mandatory = $false)]
  [string]$PowerConfigPath = '.\power.config.json',

  [Parameter(Mandatory = $false)]
  [string]$DeployConfigPath = '.\scripts\powerapps-deploy.config.json',

  [Parameter(Mandatory = $false)]
  [switch]$AllowOverwrite,

  [Parameter(Mandatory = $false)]
  [switch]$SkipEnvironmentId,

  [Parameter(Mandatory = $false)]
  [switch]$SkipAppId
)

# --------------------------------------------------------------------------
# Reads the CURRENT power.config.json (i.e. the state after `pa app init`
# and `pa app add data-source` against a Power Platform environment) and
# back-fills the discovered environmentId, appId, dataverseInstanceUrl, and
# Dataverse connection GUID into powerapps-deploy.config.json under the
# specified stage.
#
# Use this to bootstrap the deploy config for a new environment (e.g. Dev
# or Prod) after wiring up the connection manually in the maker portal.
# --------------------------------------------------------------------------

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Test-IsPlaceholder {
  param([string]$Value)
  return [string]::IsNullOrWhiteSpace($Value) -or ($Value -match '^replace-with-')
}

function Get-ConnectionIdFromSharedConnectionPath {
  param([string]$SharedConnectionPath)
  if ($SharedConnectionPath -match '/connections/([^/]+)$') { return $Matches[1] }
  return $null
}

if (-not (Test-Path -LiteralPath $PowerConfigPath)) {
  throw "Cannot find power config at '$PowerConfigPath'."
}
if (-not (Test-Path -LiteralPath $DeployConfigPath)) {
  throw "Cannot find deploy config at '$DeployConfigPath'."
}

$powerConfig  = Get-Content -LiteralPath $PowerConfigPath  -Raw | ConvertFrom-Json
$deployConfig = Get-Content -LiteralPath $DeployConfigPath -Raw | ConvertFrom-Json

if ($null -eq $deployConfig.environments.$Stage) {
  throw "Stage '$Stage' does not exist in '$DeployConfigPath'."
}

$stageConfig = $deployConfig.environments.$Stage
$updated = 0
$skipped = 0

# environmentId
if (-not $SkipEnvironmentId.IsPresent) {
  $envId = [string]$powerConfig.environmentId
  if (-not [string]::IsNullOrWhiteSpace($envId)) {
    if ($AllowOverwrite.IsPresent -or (Test-IsPlaceholder ([string]$stageConfig.environmentId))) {
      $stageConfig.environmentId = $envId
      $updated++
      Write-Host "Updated $Stage.environmentId = $envId" -ForegroundColor Green
    } else {
      $skipped++
      Write-Host "Skipped $Stage.environmentId (existing non-placeholder). Use -AllowOverwrite to replace." -ForegroundColor Yellow
    }
  }
}

# appId
if (-not $SkipAppId.IsPresent) {
  $appId = [string]$powerConfig.appId
  if (-not [string]::IsNullOrWhiteSpace($appId) -and $appId -ne 'null') {
    if ($AllowOverwrite.IsPresent -or (Test-IsPlaceholder ([string]$stageConfig.appId))) {
      $stageConfig.appId = $appId
      $updated++
      Write-Host "Updated $Stage.appId = $appId" -ForegroundColor Green
    } else {
      $skipped++
      Write-Host "Skipped $Stage.appId (existing non-placeholder). Use -AllowOverwrite to replace." -ForegroundColor Yellow
    }
  }
}

# dataverseInstanceUrl
$instanceUrl = [string]$powerConfig.databaseReferences.'default.cds'.instanceUrl
if (-not [string]::IsNullOrWhiteSpace($instanceUrl)) {
  if ($AllowOverwrite.IsPresent -or (Test-IsPlaceholder ([string]$stageConfig.dataverseInstanceUrl))) {
    $stageConfig.dataverseInstanceUrl = $instanceUrl
    $updated++
    Write-Host "Updated $Stage.dataverseInstanceUrl = $instanceUrl" -ForegroundColor Green
  } else {
    $skipped++
    Write-Host "Skipped $Stage.dataverseInstanceUrl (existing non-placeholder). Use -AllowOverwrite to replace." -ForegroundColor Yellow
  }
}

# dataverseConnectionId (from any connection reference pointing to shared_commondataserviceforapps)
foreach ($ref in $powerConfig.connectionReferences.PSObject.Properties) {
  $refValue = $ref.Value
  if ($null -eq $refValue) { continue }
  if ($refValue.id -notmatch 'shared_commondataserviceforapps') { continue }
  $sharedPath = [string]$refValue.sharedConnectionId
  $connId = Get-ConnectionIdFromSharedConnectionPath -SharedConnectionPath $sharedPath
  if ([string]::IsNullOrWhiteSpace($connId)) { continue }

  if ($AllowOverwrite.IsPresent -or (Test-IsPlaceholder ([string]$stageConfig.dataverseConnectionId))) {
    $stageConfig.dataverseConnectionId = $connId
    $updated++
    Write-Host "Updated $Stage.dataverseConnectionId = $connId" -ForegroundColor Green
  } else {
    $skipped++
    Write-Host "Skipped $Stage.dataverseConnectionId (existing non-placeholder). Use -AllowOverwrite to replace." -ForegroundColor Yellow
  }
  break
}

$deployConfig | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $DeployConfigPath

Write-Host "`nSync complete. Updated: $updated. Skipped: $skipped." -ForegroundColor Cyan
Write-Host "Next: .\scripts\post-deploy-powerapps.ps1 -Stage $Stage" -ForegroundColor Cyan
