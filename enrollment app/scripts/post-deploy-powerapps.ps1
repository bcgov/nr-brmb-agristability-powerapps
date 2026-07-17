param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('dev', 'test', 'prod')]
  [string]$Stage,

  [Parameter(Mandatory = $false)]
  [string]$ConfigPath = '.\scripts\powerapps-deploy.config.json',

  [Parameter(Mandatory = $false)]
  [switch]$SkipBuild,

  [Parameter(Mandatory = $false)]
  [switch]$PreserveSchemas
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

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

function Invoke-CapturedCommand {
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

  $output = & $FilePath @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($Arguments -join ' ')"
  }

  return $output
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

function Test-HasProperty {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Object,

    [Parameter(Mandatory = $true)]
    [string]$PropertyName
  )

  if ($null -eq $Object) {
    return $false
  }

  return $null -ne ($Object | Get-Member -Name $PropertyName -MemberType NoteProperty, Property, AliasProperty -ErrorAction SilentlyContinue)
}

function Get-DataSourceNameVariants {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  if ([string]::IsNullOrWhiteSpace($Name)) {
    return @()
  }

  $variants = New-Object 'System.Collections.Generic.List[string]'

  $trimmed = $Name.Trim()
  $variants.Add($trimmed)

  $withoutShared = $trimmed
  if ($withoutShared.StartsWith('shared_')) {
    $withoutShared = $withoutShared.Substring(7)
  }

  $variants.Add($withoutShared)
  $variants.Add(($withoutShared -replace '-', '_'))

  $hyphenated = $withoutShared -replace '_', '-'
  $variants.Add($hyphenated)
  $variants.Add("shared_$hyphenated")

  $seen = @{}
  $deduped = New-Object 'System.Collections.Generic.List[string]'
  foreach ($value in $variants) {
    if ([string]::IsNullOrWhiteSpace($value)) {
      continue
    }

    $key = $value.ToLowerInvariant()
    if (-not $seen.ContainsKey($key)) {
      $seen[$key] = $true
      $deduped.Add($value)
    }
  }

  return @($deduped)
}

function Patch-UserqueriesSharingApis {
  <#
  .SYNOPSIS
    Re-injects the GrantAccess/RevokeAccess/RetrieveSharedPrincipalsAndAccess API
    definitions into the userqueries entry of dataSourcesInfo after pac regenerates it.
  #>
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath
  )

  if (-not (Test-Path -LiteralPath $FilePath)) {
    Write-Host "  Skipping patch - file not found: $FilePath" -ForegroundColor Yellow
    return
  }

  $content = [System.IO.File]::ReadAllText($FilePath)

  # Already patched - nothing to do
  if ($content -match '"GrantAccess"') {
    Write-Host "  Already patched: $FilePath" -ForegroundColor DarkGray
    return
  }

  $sharingApis = @'
{
      "GrantAccess": {
        "path": "api/data/v9.2/GrantAccess",
        "method": "POST",
        "parameters": [
          { "name": "Target", "in": "body", "required": true, "type": "object" },
          { "name": "PrincipalAccess", "in": "body", "required": true, "type": "object" }
        ]
      },
      "RevokeAccess": {
        "path": "api/data/v9.2/RevokeAccess",
        "method": "POST",
        "parameters": [
          { "name": "Target", "in": "body", "required": true, "type": "object" },
          { "name": "Revokee", "in": "body", "required": true, "type": "object" }
        ]
      },
      "RetrieveSharedPrincipalsAndAccess": {
        "path": "api/data/v9.2/RetrieveSharedPrincipalsAndAccess(Target=@p1)?@p1={Target}",
        "method": "GET",
        "parameters": [
          { "name": "Target", "in": "path", "required": true, "type": "string" }
        ]
      }
    }
'@

  # Replace "apis": {} inside the userqueries block using string index to avoid
  # scriptblock delegate issues in PowerShell 5.1
  $userqueriesIdx = $content.IndexOf('"userqueries"')
  if ($userqueriesIdx -lt 0) {
    Write-Host "  Warning: 'userqueries' entry not found in $FilePath - manual patch may be needed." -ForegroundColor Yellow
    return
  }

  $emptyApisMarker = '"apis": {}'
  $emptyApisIdx = $content.IndexOf($emptyApisMarker, $userqueriesIdx)
  if ($emptyApisIdx -lt 0) {
    # Also try with a space inside braces in case pac formats it differently
    $emptyApisMarker = '"apis": { }'
    $emptyApisIdx = $content.IndexOf($emptyApisMarker, $userqueriesIdx)
  }
  if ($emptyApisIdx -lt 0) {
    Write-Host "  Warning: userqueries 'apis' pattern not found in $FilePath - manual patch may be needed." -ForegroundColor Yellow
    return
  }
  Write-Host "  Found empty apis at index $emptyApisIdx, injecting..." -ForegroundColor DarkGray

  $patched = $content.Substring(0, $emptyApisIdx) + '"apis": ' + $sharingApis + $content.Substring($emptyApisIdx + $emptyApisMarker.Length)

  [System.IO.File]::WriteAllText($FilePath, $patched, [System.Text.Encoding]::UTF8)
  Write-Host "  Patched: $FilePath" -ForegroundColor Green
}


$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$powerConfigPath = Join-Path $repoRoot 'power.config.json'

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

$dataverseInstanceUrl = $null
if (Test-HasProperty -Object $target -PropertyName 'dataverseInstanceUrl') {
  $dataverseInstanceUrl = [string]$target.dataverseInstanceUrl
  if (-not [string]::IsNullOrWhiteSpace($dataverseInstanceUrl) -and $dataverseInstanceUrl -match '^replace-with-') {
    Assert-NotPlaceholder -Value $dataverseInstanceUrl -Name "$Stage.dataverseInstanceUrl"
  }
}

$targetAppId = $null
if ((Test-HasProperty -Object $target -PropertyName 'appId') -and -not [string]::IsNullOrWhiteSpace([string]$target.appId)) {
  $targetAppId = [string]$target.appId
  Assert-NotPlaceholder -Value $targetAppId -Name "$Stage.appId"
}

if ($null -eq $target.dataSources -or $target.dataSources.Count -eq 0) {
  throw "No dataSources configured for '$Stage' in '$ConfigPath'."
}

Write-Host "Starting post-deploy setup for stage '$Stage'." -ForegroundColor Green
Write-Host "App Name: $appName" -ForegroundColor Green
Write-Host "Environment: $environmentId" -ForegroundColor Green

if ($Stage -eq 'prod' -and $SkipBuild.IsPresent) {
  throw "-SkipBuild is not allowed for prod deployments. Run without -SkipBuild to ensure the pushed bundle is rebuilt against the current normalized power.config.json."
}

if ($PreserveSchemas) {
  Write-Host "  Mode: Update existing environment (preserving local schemas)" -ForegroundColor Yellow
} else {
  Write-Host "  Mode: Initialize new environment (full setup with pac code init)" -ForegroundColor Yellow
}

if ($PreserveSchemas) {
  if (Test-Path -LiteralPath $powerConfigPath) {
    $existingPowerConfig = Get-Content -LiteralPath $powerConfigPath -Raw | ConvertFrom-Json
    if (-not [string]::IsNullOrWhiteSpace([string]$existingPowerConfig.environmentId) -and [string]$existingPowerConfig.environmentId -ne $environmentId) {
      throw "PreserveSchemas mode keeps the current bound environment. Current power.config.json environmentId is '$($existingPowerConfig.environmentId)', but stage '$Stage' expects '$environmentId'. Run without -PreserveSchemas to switch environments."
    }
  }
}

Invoke-CheckedCommand -FilePath 'pac' -Arguments @('org', 'select', '--environment', $environmentId) -Description 'Select target environment in PAC auth context'

if (-not $PreserveSchemas) {
  if (Test-Path -LiteralPath $powerConfigPath) {
    Write-Host "Existing power.config.json detected. Removing it before pac code init..." -ForegroundColor Yellow
    Remove-Item -LiteralPath $powerConfigPath -Force
  }

  Invoke-CheckedCommand -FilePath 'pac' -Arguments @('code', 'init', '-n', $appName, '-env', $environmentId) -Description 'Initialize app for target environment'
  
  if ($null -ne $targetAppId) {
    if (Test-Path -LiteralPath $powerConfigPath) {
      $powerConfig = Get-Content -LiteralPath $powerConfigPath -Raw | ConvertFrom-Json
      $powerConfig.appId = $targetAppId
      $powerConfig | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $powerConfigPath
      Write-Host "Configured power.config.json to push to existing app '$targetAppId'." -ForegroundColor Green
    }
  }
  
  Write-Host "`nRestoring schema files from git..." -ForegroundColor Cyan
  & git checkout -- .power/schemas 2>$null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Schema files restored from git." -ForegroundColor Green
  } else {
    Write-Host "  (Note: If schemas are missing, run 'git checkout -- .power/schemas' manually)" -ForegroundColor Yellow
  }
}

foreach ($dataSource in $target.dataSources) {
  $apiId = Get-RequiredProperty -Object $dataSource -Name 'apiId'
  $connectionId = Get-RequiredProperty -Object $dataSource -Name 'connectionId'

  if ($connectionId -match '^replace-with-') {
    if ($PreserveSchemas) {
      Write-Host "Skipping data source '$apiId' because connectionId is still a placeholder in preserve mode." -ForegroundColor Yellow
      continue
    }

    Assert-NotPlaceholder -Value $connectionId -Name "$Stage.$apiId.connectionId"
  }

  $args = @('code', 'add-data-source', '-a', $apiId, '-c', $connectionId)

  if ((Test-HasProperty -Object $dataSource -PropertyName 'table') -and -not [string]::IsNullOrWhiteSpace([string]$dataSource.table)) {
    $args += @('-t', [string]$dataSource.table)
  }

  if ((Test-HasProperty -Object $dataSource -PropertyName 'dataset') -and -not [string]::IsNullOrWhiteSpace([string]$dataSource.dataset)) {
    $args += @('-d', [string]$dataSource.dataset)
  }

  Invoke-CheckedCommand -FilePath 'pac' -Arguments $args -Description "Add data source '$apiId'"
}

# Patch dataSourcesInfo files to restore sharing APIs wiped by pac regeneration
Write-Host "`n==> Patch userqueries sharing APIs in dataSourcesInfo" -ForegroundColor Cyan
$dataSourcesInfoDir = Join-Path $repoRoot '.power\schemas\appschemas'
Patch-UserqueriesSharingApis -FilePath (Join-Path $dataSourcesInfoDir 'dataSourcesInfo.ts')
Patch-UserqueriesSharingApis -FilePath (Join-Path $dataSourcesInfoDir 'dataSourcesInfo.js')

# Inject Dataverse table mappings into databaseReferences after PAC creates default.cds
if ($null -ne $config.dataverseTableMappings -and (Test-Path -LiteralPath $powerConfigPath)) {
  $powerConfig = Get-Content -LiteralPath $powerConfigPath -Raw | ConvertFrom-Json
  $hasDbRefs = Test-HasProperty -Object $powerConfig -PropertyName 'databaseReferences'
  if (-not $hasDbRefs -or $null -eq $powerConfig.databaseReferences) {
    $powerConfig | Add-Member -NotePropertyName 'databaseReferences' -NotePropertyValue ([PSCustomObject]@{}) -Force
  }

  $hasDefaultCds = Test-HasProperty -Object $powerConfig.databaseReferences -PropertyName 'default.cds'
  if (-not $hasDefaultCds -or $null -eq $powerConfig.databaseReferences.'default.cds') {
    $instanceUrlValue = ''
    if (-not [string]::IsNullOrWhiteSpace($dataverseInstanceUrl)) {
      $instanceUrlValue = $dataverseInstanceUrl
    }

    $defaultCds = [PSCustomObject]@{
      state                   = 'Configured'
      instanceUrl             = $instanceUrlValue
      webApiVersion           = 'v9.0'
      dataSources             = [PSCustomObject]@{}
      version                 = 'v9.0'
      environmentVariableName = ''
    }
    $powerConfig.databaseReferences | Add-Member -NotePropertyName 'default.cds' -NotePropertyValue $defaultCds -Force
  }

  $cds = $powerConfig.databaseReferences.'default.cds'
  if (-not (Test-HasProperty -Object $cds -PropertyName 'dataSources') -or $null -eq $cds.dataSources) {
    $cds | Add-Member -NotePropertyName 'dataSources' -NotePropertyValue ([PSCustomObject]@{}) -Force
  }

  if ((-not (Test-HasProperty -Object $cds -PropertyName 'instanceUrl')) -or [string]::IsNullOrWhiteSpace([string]$cds.instanceUrl)) {
    if (-not [string]::IsNullOrWhiteSpace($dataverseInstanceUrl)) {
      $cds.instanceUrl = $dataverseInstanceUrl
    }
  }

  $mappingNames = @($config.dataverseTableMappings | Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name)
  foreach ($mappingName in $mappingNames) {
    $mappingValue = $config.dataverseTableMappings.$mappingName
    $cds.dataSources | Add-Member -NotePropertyName $mappingName -NotePropertyValue $mappingValue -Force
  }

  $powerConfig | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $powerConfigPath
  Write-Host "Injected $($mappingNames.Count) Dataverse table mapping(s) into power.config.json." -ForegroundColor Green
}

# Normalize FARMS connection-reference datasource keys so runtime lookups succeed across naming variants.
if (Test-Path -LiteralPath $powerConfigPath) {
  $powerConfig = Get-Content -LiteralPath $powerConfigPath -Raw | ConvertFrom-Json

  if ((Test-HasProperty -Object $powerConfig -PropertyName 'connectionReferences') -and $null -ne $powerConfig.connectionReferences) {
    $updatedFarmsRefs = 0
    $connectionRefNames = @($powerConfig.connectionReferences | Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name)

    foreach ($refName in $connectionRefNames) {
      $ref = $powerConfig.connectionReferences.$refName
      if ($null -eq $ref) {
        continue
      }

      $idValue = ''
      if (Test-HasProperty -Object $ref -PropertyName 'id') {
        $idValue = [string]$ref.id
      }

      if (-not $idValue.ToLowerInvariant().Contains('farms')) {
        continue
      }

      $allNames = New-Object 'System.Collections.Generic.List[string]'

      if ((Test-HasProperty -Object $ref -PropertyName 'dataSources') -and $null -ne $ref.dataSources) {
        foreach ($dataSourceName in @($ref.dataSources)) {
          foreach ($variant in (Get-DataSourceNameVariants -Name ([string]$dataSourceName))) {
            $allNames.Add($variant)
          }
        }
      }

      if (-not [string]::IsNullOrWhiteSpace($idValue)) {
        $apiName = $idValue.Split('/')[-1]
        foreach ($variant in (Get-DataSourceNameVariants -Name $apiName)) {
          $allNames.Add($variant)
        }
      }

      $seen = @{}
      $dedupedNames = New-Object 'System.Collections.Generic.List[string]'
      foreach ($name in $allNames) {
        if ([string]::IsNullOrWhiteSpace($name)) {
          continue
        }

        $key = $name.ToLowerInvariant()
        if (-not $seen.ContainsKey($key)) {
          $seen[$key] = $true
          $dedupedNames.Add($name)
        }
      }

      if ($dedupedNames.Count -gt 0) {
        $ref.dataSources = @($dedupedNames)
        $updatedFarmsRefs++
      }
    }

    if ($updatedFarmsRefs -gt 0) {
      $powerConfig | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $powerConfigPath
      Write-Host "Normalized FARMS datasource keys on $updatedFarmsRefs connection reference(s)." -ForegroundColor Green
    }
  }
}

# Add flow connection references using the current environment's workflow IDs.
if ($null -ne $config.flowReferences -and $config.flowReferences.Count -gt 0) {
  $flowListTempPath = [System.IO.Path]::GetTempFileName()
  try {
    Write-Host "`n==> List invokable flows in current environment" -ForegroundColor Cyan
    Write-Host "    npx.cmd power-apps list-flows --json --no-color" -ForegroundColor DarkGray
    $previousErrorActionPreference = $ErrorActionPreference
    try {
      # npm can emit harmless warnings on stderr; do not let those abort the deploy before exit code handling.
      $ErrorActionPreference = 'Continue'
      & 'npx.cmd' @('power-apps', 'list-flows', '--json', '--no-color') *> $flowListTempPath
      $flowListExitCode = $LASTEXITCODE
    }
    finally {
      $ErrorActionPreference = $previousErrorActionPreference
    }

    if ($flowListExitCode -ne 0) {
      throw "Command failed with exit code ${flowListExitCode}: npx.cmd power-apps list-flows --json --no-color"
    }

    $flowListText = Get-Content -LiteralPath $flowListTempPath -Raw
    # Strip ANSI/VT escape sequences emitted by the spinner (ESC[?25l, ESC[2K, ESC[1G, etc.)
    # so that IndexOf('[') finds the JSON array bracket and not an ANSI CSI bracket.
    $flowListText = $flowListText -replace '\x1b\[[0-9;?]*[a-zA-Z]', ''
  }
  finally {
    if (Test-Path -LiteralPath $flowListTempPath) {
      Remove-Item -LiteralPath $flowListTempPath -Force
    }
  }

  $jsonStart = $flowListText.IndexOf('[')
  $jsonEnd = $flowListText.LastIndexOf(']')
  if ($jsonStart -lt 0 -or $jsonEnd -lt $jsonStart) {
    throw "Could not parse the flow list returned for the '$Stage' environment. Deployment stopped before push."
  }

  $availableFlows = @(foreach ($f in ($flowListText.Substring($jsonStart, $jsonEnd - $jsonStart + 1) | ConvertFrom-Json)) { $f })

  foreach ($flowRef in $config.flowReferences) {
    if (-not (Test-HasProperty -Object $flowRef -PropertyName 'workflowDisplayName')) {
      throw "Flow reference '$($flowRef.dataSources[0])' is missing workflowDisplayName in '$ConfigPath'."
    }

    $workflowDisplayName = [string]$flowRef.workflowDisplayName
    $flowMatches = @($availableFlows | Where-Object { [string]$_.name -eq $workflowDisplayName })

    if ($flowMatches.Count -ne 1) {
      throw "Required flow '$workflowDisplayName' was not found exactly once in the '$Stage' environment. Deployment stopped before push."
    }

    $flow = $flowMatches[0]
    if ([string]::IsNullOrWhiteSpace([string]$flow.workflowId)) {
      throw "Required flow '$workflowDisplayName' has no workflowId in the '$Stage' environment. Deployment stopped before push."
    }

    if ([int]$flow.statecode -ne 1) {
      throw "Required flow '$workflowDisplayName' is not active in the '$Stage' environment (statecode: $($flow.statecode)). Deployment stopped before push."
    }

    Invoke-CheckedCommand -FilePath 'npx.cmd' -Arguments @('power-apps', 'add-flow', '-f', [string]$flow.workflowId) -Description "Add flow '$workflowDisplayName'"
  }

  $boundPowerConfig = Get-Content -LiteralPath $powerConfigPath -Raw | ConvertFrom-Json
  $boundFlowNames = @(
    $boundPowerConfig.connectionReferences.PSObject.Properties |
      ForEach-Object {
        $wd = $_.Value.PSObject.Properties['workflowDetails']
        if ($null -ne $wd) { [string]$wd.Value.workflowDisplayName }
      } |
      Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  )

  foreach ($flowRef in $config.flowReferences) {
    $requiredFlowName = [string]$flowRef.workflowDisplayName
    if ($boundFlowNames -notcontains $requiredFlowName) {
      throw "Required flow '$requiredFlowName' was not written to power.config.json. Deployment stopped before build and push."
    }
  }

  Write-Host "Verified all $($config.flowReferences.Count) required flow connection references in power.config.json." -ForegroundColor Green
}

if (-not $SkipBuild.IsPresent) {
  # Re-patch here in case add-flow or any earlier step wiped the schemas
  Write-Host "`n==> Re-patch userqueries sharing APIs (pre-build safety check)" -ForegroundColor Cyan
  Patch-UserqueriesSharingApis -FilePath (Join-Path $dataSourcesInfoDir 'dataSourcesInfo.ts')
  Patch-UserqueriesSharingApis -FilePath (Join-Path $dataSourcesInfoDir 'dataSourcesInfo.js')

  Invoke-CheckedCommand -FilePath 'npm.cmd' -Arguments @('run', 'build') -Description 'Build app'
}

Invoke-CheckedCommand -FilePath 'npx.cmd' -Arguments @('power-apps', 'push') -Description 'Push app with Power Apps CLI wrapper'

Write-Host "`nPost-deploy setup completed successfully for '$Stage'." -ForegroundColor Green

