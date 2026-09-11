param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('dev', 'test', 'prod')]
  [string]$Stage,

  [Parameter(Mandatory = $false)]
  [string]$ConfigPath = '.\scripts\powerapps-deploy.config.json',

  [Parameter(Mandatory = $false)]
  [string]$PowerConfigPath = '.\power.config.json',

  [Parameter(Mandatory = $false)]
  [string]$DeployEnvOutputPath = '.\src\constants\deployEnvConfig.ts',

  [Parameter(Mandatory = $false)]
  [switch]$SkipBuild,

  [Parameter(Mandatory = $false)]
  [switch]$SkipPush,

  [Parameter(Mandatory = $false)]
  [switch]$AllowPlaceholders
)

# --------------------------------------------------------------------------
# Benefit App deployment script.
#
# Rewrites `power.config.json` and `src/constants/deployEnvConfig.ts` for the
# target stage (dev / test / prod) using values from `powerapps-deploy.config.json`,
# then optionally builds and pushes via the Power Apps CLI (`pa`).
#
# Usage:
#   .\scripts\post-deploy-powerapps.ps1 -Stage test
#   .\scripts\post-deploy-powerapps.ps1 -Stage dev -SkipPush
#
# The `pa` binary is provided by @microsoft/power-apps-cli; if not on PATH we
# fall back to `npx pa`.
# --------------------------------------------------------------------------

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-NotPlaceholder {
  param([string]$Value, [string]$Name)
  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "Missing required config property '$Name'."
  }
  if ($Value -match '^replace-with-') {
    if ($AllowPlaceholders.IsPresent) {
      Write-Host "  Warning: '$Name' is still a placeholder ('$Value'). Continuing because -AllowPlaceholders was set." -ForegroundColor Yellow
      return
    }
    throw "Config property '$Name' still has a placeholder value: '$Value'. Fill it in (or pass -AllowPlaceholders) before deploying."
  }
}

function Test-HasProperty {
  param([Parameter(Mandatory)]$Object, [Parameter(Mandatory)][string]$PropertyName)
  if ($null -eq $Object) { return $false }
  return $null -ne ($Object.PSObject.Properties[$PropertyName])
}

function Invoke-Pa {
  param([string[]]$Arguments, [string]$Description)

  Write-Host "`n==> $Description" -ForegroundColor Cyan

  $paCmd = Get-Command 'pa' -ErrorAction SilentlyContinue
  if ($paCmd) {
    Write-Host "    pa $($Arguments -join ' ')" -ForegroundColor DarkGray
    & pa @Arguments
  } else {
    Write-Host "    npx pa $($Arguments -join ' ')" -ForegroundColor DarkGray
    & npx pa @Arguments
  }

  if ($LASTEXITCODE -ne 0) {
    throw "pa command failed with exit code ${LASTEXITCODE}: pa $($Arguments -join ' ')"
  }
}

# --- Load config -----------------------------------------------------------

if (-not (Test-Path -LiteralPath $ConfigPath)) {
  throw "Cannot find deploy config at '$ConfigPath'."
}
if (-not (Test-Path -LiteralPath $PowerConfigPath)) {
  throw "Cannot find power config at '$PowerConfigPath'."
}

$deployConfig = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$powerConfig  = Get-Content -LiteralPath $PowerConfigPath -Raw | ConvertFrom-Json

if ($null -eq $deployConfig.environments.$Stage) {
  throw "Stage '$Stage' does not exist in '$ConfigPath'."
}

$target = $deployConfig.environments.$Stage
$tenantId = [string]$deployConfig.tenantId
$dataverseRefId = [string]$deployConfig.dataverseReferenceId

Assert-NotPlaceholder -Value $tenantId -Name 'tenantId'
Assert-NotPlaceholder -Value $dataverseRefId -Name 'dataverseReferenceId'
Assert-NotPlaceholder -Value ([string]$target.environmentId)         -Name "environments.$Stage.environmentId"
Assert-NotPlaceholder -Value ([string]$target.dataverseInstanceUrl)  -Name "environments.$Stage.dataverseInstanceUrl"
Assert-NotPlaceholder -Value ([string]$target.dataverseConnectionId) -Name "environments.$Stage.dataverseConnectionId"

$environmentId = [string]$target.environmentId
$dataverseInstanceUrl = [string]$target.dataverseInstanceUrl
$dataverseConnectionId = [string]$target.dataverseConnectionId

Write-Host "`n=== Deploying Benefit App to stage: $Stage ===" -ForegroundColor Green
Write-Host "  environmentId       : $environmentId"
Write-Host "  dataverseInstanceUrl: $dataverseInstanceUrl"

# --- Validate required data sources are wired up ---------------------------

$requiredDataSources = @()
if ($deployConfig.PSObject.Properties.Name -contains 'requiredDataSources' -and $null -ne $deployConfig.requiredDataSources) {
  $requiredDataSources = @($deployConfig.requiredDataSources)
}

$requiredDataverseApis = @()
if ($deployConfig.PSObject.Properties.Name -contains 'requiredDataverseApis' -and $null -ne $deployConfig.requiredDataverseApis) {
  $requiredDataverseApis = @($deployConfig.requiredDataverseApis)
}

if ($requiredDataSources.Count -gt 0 -or $requiredDataverseApis.Count -gt 0) {
  Write-Host "`n==> Verifying required data sources" -ForegroundColor Cyan

  $currentDataSources = $null
  if ($null -ne $powerConfig.databaseReferences -and $null -ne $powerConfig.databaseReferences.'default.cds') {
    $currentDataSources = $powerConfig.databaseReferences.'default.cds'.dataSources
  }

  $missing = @()
  foreach ($required in $requiredDataSources) {
    $logical = [string]$required.logicalName
    if ([string]::IsNullOrWhiteSpace($logical)) { continue }
    $found = $false
    if ($null -ne $currentDataSources) {
      foreach ($ds in $currentDataSources.PSObject.Properties) {
        if ([string]$ds.Value.logicalName -eq $logical) { $found = $true; break }
      }
    }
    if ($found) {
      Write-Host "    [OK]      table  $logical" -ForegroundColor DarkGray
    } else {
      Write-Host "    [MISSING] table  $logical  ->  $($required.addCommand)" -ForegroundColor Yellow
      $missing += $logical
    }
  }

  # Dataverse APIs (e.g. WhoAmI) are registered under .power/schemas/dataverse/*.Schema.json
  # by the CLI. They are NOT reflected in power.config.json, so we check the schema folder.
  $schemaDir = Join-Path (Split-Path -Parent $PowerConfigPath) '.power\schemas\dataverse'
  foreach ($api in $requiredDataverseApis) {
    $apiName = [string]$api.name
    if ([string]::IsNullOrWhiteSpace($apiName)) { continue }
    $schemaFile = Join-Path $schemaDir ("{0}.Schema.json" -f $apiName)
    if (Test-Path -LiteralPath $schemaFile) {
      Write-Host "    [OK]      api    $apiName" -ForegroundColor DarkGray
    } else {
      Write-Host "    [MISSING] api    $apiName  ->  $($api.addCommand)" -ForegroundColor Yellow
      $missing += "api:$apiName"
    }
  }

  if ($missing.Count -gt 0) {
    if ($AllowPlaceholders.IsPresent) {
      Write-Host "    Warning: $($missing.Count) required data source(s) missing. Continuing because -AllowPlaceholders was set." -ForegroundColor Yellow
    } else {
      throw "Required data source(s) not registered in this workspace: $($missing -join ', '). Run the add commands shown above, or re-run with -AllowPlaceholders to skip this check."
    }
  }
}

# --- Rewrite src/constants/deployEnvConfig.ts ------------------------------

# Model app IDs: seed with the configured values, then optionally auto-discover
# via `pac org fetch` (Power Platform CLI). If pac isn't available or an app
# can't be found, fall back to the configured appModuleId.
$modelAppsResolved = @()
if ((Test-HasProperty -Object $target -PropertyName 'modelApps') -and $null -ne $target.modelApps) {
  $modelAppsResolved = @($target.modelApps)
}

if ($modelAppsResolved.Count -gt 0) {
  $pacCmd = Get-Command pac -ErrorAction SilentlyContinue
  if ($null -ne $pacCmd) {
    Write-Host "`n==> Discovering model app IDs via pac org fetch" -ForegroundColor Cyan
    try {
      # Build a single FetchXML query for all display names to avoid re-auth per call.
      $conditions = ($modelAppsResolved | ForEach-Object {
        $safe = ([string]$_.displayName).Replace("'", "&apos;")
        "<value>$safe</value>"
      }) -join ''
      $fetchXml = "<fetch><entity name='appmodule'><attribute name='name'/><attribute name='appmoduleid'/><filter><condition attribute='name' operator='in'>$conditions</condition></filter></entity></fetch>"

      $output = (& pac org fetch --environment $dataverseInstanceUrl --xml $fetchXml 2>&1) | Out-String

      # Parse each data row: "<name...>    <uniquename?>    <guid>"
      $discovered = @{}
      $lines = $output -split "`r?`n" | Where-Object { $_ -match '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' }
      foreach ($line in $lines) {
        $guidMatch = [regex]::Match($line, '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})')
        if (-not $guidMatch.Success) { continue }
        $guid = $guidMatch.Groups[1].Value
        # Match the row's name against a configured display name.
        foreach ($mapp in $modelAppsResolved) {
          $displayName = [string]$mapp.displayName
          if ([string]::IsNullOrWhiteSpace($displayName)) { continue }
          if ($line -match [regex]::Escape($displayName)) {
            $discovered[$displayName] = $guid
            break
          }
        }
      }

      foreach ($mapp in $modelAppsResolved) {
        $displayName = [string]$mapp.displayName
        if ($discovered.ContainsKey($displayName)) {
          $mapp.appModuleId = $discovered[$displayName]
          Write-Host "    Found '$displayName': $($mapp.appModuleId)" -ForegroundColor Green
        } else {
          Write-Host "    '$displayName' not found in '$Stage' - using configured fallback ($($mapp.appModuleId))" -ForegroundColor Yellow
        }
      }
    } catch {
      Write-Host "    pac org fetch failed: $_ - using configured model app IDs" -ForegroundColor Yellow
    }
  } else {
    Write-Host "`n    pac CLI not available (install Power Platform CLI for model app auto-discovery)" -ForegroundColor DarkGray
  }
}

$modelAppsJson = (@($modelAppsResolved) | ConvertTo-Json -Compress -Depth 10)
if ($modelAppsResolved.Count -eq 1) { $modelAppsJson = "[$modelAppsJson]" }

# Warn about any remaining placeholder model app IDs.
foreach ($mapp in $modelAppsResolved) {
  if ([string]$mapp.appModuleId -match '^replace-with-') {
    Write-Host "    Warning: model app '$($mapp.key)' has a placeholder appModuleId - link will be inactive" -ForegroundColor Yellow
  }
}

# Code app IDs: seed with configured values, then optionally auto-discover via
# `pac code list`. Runs BEFORE the canvas discovery below, because the canvas
# step uses Get-AdminPowerApp (Microsoft.PowerApps.Administration.PowerShell)
# which opens a long-lived HTTP session that can stall subsequent `pac` calls
# in the same PowerShell process. Ordering: model (pac) -> code (pac) -> canvas (PS).
$codeAppIdsJson = '{}'
if ((Test-HasProperty -Object $target -PropertyName 'codeAppIds') -and $null -ne $target.codeAppIds) {
  $codeAppIdsJson = $target.codeAppIds | ConvertTo-Json -Compress
}

if ((Test-HasProperty -Object $deployConfig -PropertyName 'codeAppNames') -and $null -ne $deployConfig.codeAppNames) {
  $pacCmd = Get-Command pac -ErrorAction SilentlyContinue
  if ($null -ne $pacCmd) {
    Write-Host "`n==> Discovering code app IDs via pac org fetch (canvasapp)" -ForegroundColor Cyan
    try {
      # Code apps are stored in the Dataverse `canvasapp` table (they are a
      # canvas-app subtype). Query it via `pac org fetch --environment <url>`
      # so we always target the right env - `pac code list` uses whatever env
      # is currently selected on the auth profile, which would return the wrong
      # env's IDs, and `pac org select` crashes on cross-env switches.
      $codeAppNamesList = @()
      foreach ($p in $deployConfig.codeAppNames.PSObject.Properties) {
        $codeAppNamesList += ,@{ key = $p.Name; displayName = [string]$p.Value }
      }

      $conditions = ($codeAppNamesList | ForEach-Object {
        $safe = $_.displayName.Replace("'", "&apos;")
        "<value>$safe</value>"
      }) -join ''
      $fetchXml = "<fetch><entity name='canvasapp'><attribute name='displayname'/><attribute name='canvasappid'/><filter><condition attribute='displayname' operator='in'>$conditions</condition></filter></entity></fetch>"

      $output = (& pac org fetch --environment $dataverseInstanceUrl --xml $fetchXml 2>&1) | Out-String

      # Seed with any already-configured non-placeholder values.
      $resolvedCodeIds = @{}
      if ((Test-HasProperty -Object $target -PropertyName 'codeAppIds') -and $null -ne $target.codeAppIds) {
        foreach ($p in $target.codeAppIds.PSObject.Properties) {
          $resolvedCodeIds[$p.Name] = [string]$p.Value
        }
      }

      $discovered = @{}
      $lines = $output -split "`r?`n" | Where-Object { $_ -match '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' }
      foreach ($line in $lines) {
        $guidMatch = [regex]::Match($line, '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})')
        if (-not $guidMatch.Success) { continue }
        $guid = $guidMatch.Groups[1].Value
        foreach ($capp in $codeAppNamesList) {
          if ($line -match [regex]::Escape($capp.displayName)) {
            $discovered[$capp.displayName] = $guid
            break
          }
        }
      }

      foreach ($capp in $codeAppNamesList) {
        if ($discovered.ContainsKey($capp.displayName)) {
          $resolvedCodeIds[$capp.key] = $discovered[$capp.displayName]
          Write-Host "    Found '$($capp.displayName)': $($discovered[$capp.displayName])" -ForegroundColor Green
        } else {
          Write-Host "    '$($capp.displayName)' not found in '$Stage' - using configured fallback" -ForegroundColor Yellow
        }
      }

      $codeAppIdsJson = if ($resolvedCodeIds.Count -gt 0) { $resolvedCodeIds | ConvertTo-Json -Compress } else { '{}' }
    } catch {
      Write-Host "    pac org fetch (canvasapp) failed: $_ - using configured code app IDs" -ForegroundColor Yellow
    }
  } else {
    Write-Host "`n    pac CLI not available (install Power Platform CLI for code app auto-discovery)" -ForegroundColor DarkGray
  }
}

# Warn about any remaining placeholder code app IDs.
$warnCodeIds = if ($codeAppIdsJson -ne '{}') { $codeAppIdsJson | ConvertFrom-Json } else { $null }
if ($null -ne $warnCodeIds) {
  $warnCodeIds.PSObject.Properties | Where-Object { [string]$_.Value -match '^replace-with-' } | ForEach-Object {
    Write-Host "    Warning: code app '$($_.Name)' has a placeholder ID - app switcher link will be inactive" -ForegroundColor Yellow
  }
}

# Canvas app IDs: seed with the configured values, then optionally auto-discover via
# Get-AdminPowerApp (Microsoft.PowerApps.Administration.PowerShell). If the module
# isn't available or an app can't be found, fall back to the configured value.
$canvasAppIdsJson = '{}'
if ((Test-HasProperty -Object $target -PropertyName 'canvasAppIds') -and $null -ne $target.canvasAppIds) {
  $canvasAppIdsJson = $target.canvasAppIds | ConvertTo-Json -Compress
}

if ((Test-HasProperty -Object $deployConfig -PropertyName 'canvasAppNames') -and $null -ne $deployConfig.canvasAppNames) {
  $getAdminCmd = Get-Command Get-AdminPowerApp -ErrorAction SilentlyContinue
  if ($null -ne $getAdminCmd) {
    Write-Host "`n==> Discovering canvas app IDs via Get-AdminPowerApp" -ForegroundColor Cyan
    try {
      $resolvedIds = @{}
      # Seed with any already-configured non-placeholder values.
      if ((Test-HasProperty -Object $target -PropertyName 'canvasAppIds') -and $null -ne $target.canvasAppIds) {
        foreach ($p in $target.canvasAppIds.PSObject.Properties) {
          $resolvedIds[$p.Name] = [string]$p.Value
        }
      }
      foreach ($p in $deployConfig.canvasAppNames.PSObject.Properties) {
        $key         = $p.Name
        $displayName = [string]$p.Value
        # Wrap in @() so single/zero results don't collapse; guard the property
        # access because different Get-AdminPowerApp versions may return objects
        # without an AppName property when the filter matches nothing.
        $matches = @(Get-AdminPowerApp -ErrorAction SilentlyContinue |
                     Where-Object { $_.DisplayName -like "*$displayName*" -and $_.EnvironmentName -eq $environmentId })
        $appName = $null
        if ($matches.Count -gt 0 -and $null -ne $matches[0].PSObject.Properties['AppName']) {
          $appName = $matches[0].AppName
        }
        if (-not [string]::IsNullOrWhiteSpace($appName)) {
          $resolvedIds[$key] = [string]$appName
          Write-Host "    Found '$displayName': $appName" -ForegroundColor Green
        } else {
          Write-Host "    '$displayName' not found in '$Stage' - using configured fallback" -ForegroundColor Yellow
        }
      }
      $canvasAppIdsJson = if ($resolvedIds.Count -gt 0) { $resolvedIds | ConvertTo-Json -Compress } else { '{}' }
    } catch {
      Write-Host "    Get-AdminPowerApp failed: $_ - using configured canvas app IDs" -ForegroundColor Yellow
    }
  } else {
    Write-Host "`n    Get-AdminPowerApp not available (install Microsoft.PowerApps.Administration.PowerShell for auto-discovery)" -ForegroundColor DarkGray
  }
}

# Warn about any remaining placeholder canvas app IDs.
$warnIds = if ($canvasAppIdsJson -ne '{}') { $canvasAppIdsJson | ConvertFrom-Json } else { $null }
if ($null -ne $warnIds) {
  $warnIds.PSObject.Properties | Where-Object { [string]$_.Value -match '^replace-with-' } | ForEach-Object {
    Write-Host "    Warning: canvas app '$($_.Name)' has a placeholder ID - app switcher link will be inactive" -ForegroundColor Yellow
  }
}

$deployEnvContent = @"
// Auto-generated by scripts/post-deploy-powerapps.ps1 - do not edit manually.
// Run the deploy script (.\scripts\post-deploy-powerapps.ps1 -Stage <stage>) to regenerate.
export const DEPLOY_ENV = {
  stage: '$Stage',
  environmentId: '$environmentId',
  tenantId: '$tenantId',
  modelApps: $modelAppsJson,
  canvasAppIds: $canvasAppIdsJson,
  codeAppIds: $codeAppIdsJson,
} as const;
"@

$deployEnvOutputDir = Split-Path -Parent $DeployEnvOutputPath
if (-not (Test-Path -LiteralPath $deployEnvOutputDir)) {
  New-Item -ItemType Directory -Path $deployEnvOutputDir -Force | Out-Null
}
Set-Content -LiteralPath $DeployEnvOutputPath -Value $deployEnvContent -NoNewline
Write-Host "`n==> Wrote $DeployEnvOutputPath" -ForegroundColor Cyan

# --- Rewrite power.config.json ---------------------------------------------

$powerConfig.environmentId = $environmentId

# App ID: leave null if placeholder, otherwise set it.
$appId = [string]$target.appId
if (-not [string]::IsNullOrWhiteSpace($appId) -and -not ($appId -match '^replace-with-')) {
  $powerConfig.appId = $appId
}

# Dataverse connection reference
if ($null -eq $powerConfig.connectionReferences) {
  $powerConfig | Add-Member -MemberType NoteProperty -Name connectionReferences -Value ([PSCustomObject]@{})
}
$sharedPath = "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps/connections/$dataverseConnectionId"
$dataverseRef = [PSCustomObject]@{
  id                 = '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps'
  displayName        = 'Microsoft Dataverse'
  dataSources        = @('commondataserviceforapps')
  authenticationType = 'ServicePrincipalOauth'
  sharedConnectionId = $sharedPath
  dataSets           = [PSCustomObject]@{}
}
# Rebuild connectionReferences to guarantee the Dataverse reference is present with the right key.
$newConnectionRefs = [PSCustomObject]@{}
Add-Member -InputObject $newConnectionRefs -MemberType NoteProperty -Name $dataverseRefId -Value $dataverseRef
foreach ($existing in $powerConfig.connectionReferences.PSObject.Properties) {
  if ($existing.Name -ne $dataverseRefId -and $existing.Value.id -ne '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps') {
    Add-Member -InputObject $newConnectionRefs -MemberType NoteProperty -Name $existing.Name -Value $existing.Value
  }
}
$powerConfig.connectionReferences = $newConnectionRefs

# Database references (Dataverse CDS)
if ($null -eq $powerConfig.databaseReferences -or $null -eq $powerConfig.databaseReferences.'default.cds') {
  throw "power.config.json is missing databaseReferences.'default.cds'. Run 'pa app add data-source' first."
}

# Ensure required fields on default.cds exist and are set to the target values.
$cds = $powerConfig.databaseReferences.'default.cds'
function Set-OrAddProperty {
  param([Parameter(Mandatory)]$Object, [Parameter(Mandatory)][string]$Name, [Parameter(Mandatory)]$Value)
  if ($null -ne ($Object | Get-Member -Name $Name -MemberType NoteProperty -ErrorAction SilentlyContinue)) {
    $Object.$Name = $Value
  } else {
    Add-Member -InputObject $Object -MemberType NoteProperty -Name $Name -Value $Value
  }
}
Set-OrAddProperty -Object $cds -Name 'state'         -Value 'Configured'
Set-OrAddProperty -Object $cds -Name 'instanceUrl'   -Value $dataverseInstanceUrl
Set-OrAddProperty -Object $cds -Name 'webApiVersion' -Value 'v9.0'
Set-OrAddProperty -Object $cds -Name 'version'       -Value 'v9.0'
Set-OrAddProperty -Object $cds -Name 'environmentVariableName' -Value ''

$powerConfig | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $PowerConfigPath
Write-Host "==> Wrote $PowerConfigPath" -ForegroundColor Cyan

# --- Build -----------------------------------------------------------------

if (-not $SkipBuild.IsPresent) {
  Write-Host "`n==> Building app (npm run build)" -ForegroundColor Cyan
  & npm run build
  if ($LASTEXITCODE -ne 0) {
    throw "npm run build failed with exit code $LASTEXITCODE"
  }
}

# --- Push ------------------------------------------------------------------
# NOTE: Push to the Power Platform environment is intentionally disabled for now.
# The app has not been published yet. When you're ready to enable auto-push,
# uncomment the block below and remove this note.
#
# if (-not $SkipPush.IsPresent) {
#   $env:PA_CLI_ENVIRONMENT_ID = $environmentId
#   Write-Host "`n  Set PA_CLI_ENVIRONMENT_ID=$environmentId for pa app commands." -ForegroundColor DarkGray
#   Invoke-Pa -Arguments @('app', 'push', '--non-interactive') -Description "Push app to $Stage environment"
# }

Write-Host "`n(Push step is currently commented out - files rewritten only. Run 'npx pa app push' manually when ready.)" -ForegroundColor Yellow
Write-Host "`n=== Deployment to $Stage complete ===" -ForegroundColor Green
