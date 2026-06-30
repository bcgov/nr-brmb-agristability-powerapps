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
  $previousNpmLogLevel = $env:npm_config_loglevel
  try {
    Write-Host "`n==> List invokable flows in current environment" -ForegroundColor Cyan
    Write-Host "    npx.cmd power-apps list-flows --json --no-color" -ForegroundColor DarkGray
    $env:npm_config_loglevel = 'error'
    & 'npx.cmd' @('power-apps', 'list-flows', '--json', '--no-color') *> $flowListTempPath
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed with exit code ${LASTEXITCODE}: npx.cmd power-apps list-flows --json --no-color"
    }

    $flowListText = Get-Content -LiteralPath $flowListTempPath -Raw
  }
  finally {
    if ($null -eq $previousNpmLogLevel) {
      Remove-Item Env:\npm_config_loglevel -ErrorAction SilentlyContinue
    } else {
      $env:npm_config_loglevel = $previousNpmLogLevel
    }
    if (Test-Path -LiteralPath $flowListTempPath) {
      Remove-Item -LiteralPath $flowListTempPath -Force
    }
  }

  foreach ($flowRef in $config.flowReferences) {
    if (-not (Test-HasProperty -Object $flowRef -PropertyName 'workflowDisplayName')) {
      throw "Flow reference '$($flowRef.dataSources[0])' is missing workflowDisplayName in '$ConfigPath'."
    }

    $workflowDisplayName = [string]$flowRef.workflowDisplayName
    $flowMatch = [regex]::Match($flowListText, '(?s)"name"\s*:\s*"' + [regex]::Escape($workflowDisplayName) + '".*?"workflowId"\s*:\s*"(?<workflowId>[^"]+)"')

    if (-not $flowMatch.Success -or [string]::IsNullOrWhiteSpace($flowMatch.Groups['workflowId'].Value)) {
      Write-Host "Skipping flow '$workflowDisplayName' because it was not found in the '$Stage' environment." -ForegroundColor Yellow
      continue
    }

    Invoke-CheckedCommand -FilePath 'npx.cmd' -Arguments @('power-apps', 'add-flow', '-f', [string]$flowMatch.Groups['workflowId'].Value) -Description "Add flow '$workflowDisplayName'"
  }
}

if (-not $SkipBuild.IsPresent) {
  Invoke-CheckedCommand -FilePath 'npm.cmd' -Arguments @('run', 'build') -Description 'Build app'
}

Invoke-CheckedCommand -FilePath 'npx.cmd' -Arguments @('power-apps', 'push') -Description 'Push app with Power Apps CLI wrapper'

Write-Host "`nPost-deploy setup completed successfully for '$Stage'." -ForegroundColor Green
