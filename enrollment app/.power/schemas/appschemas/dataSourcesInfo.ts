/*!
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * This file is auto-generated. Do not modify it manually.
 * Changes to this file may be overwritten.
 */

export const dataSourcesInfo = {
  "vsi_participantprogramyears": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsi_participantprogramyearid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "farms_20api_5fe39d1efd21a19d13_5f571039b465579741": {
    "tableId": "",
    "version": "",
    "primaryKey": "",
    "dataSourceType": "Connector",
    "apis": {
      "GetAllCodetables": {
        "path": "/{connectionId}/codeTables",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "effectiveAsOfDate",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "codeTableName",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "GetOneCodetable": {
        "path": "/{connectionId}/codeTables/{codeTableName}",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "codeTableName",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "GetOneCode": {
        "path": "/{connectionId}/codeTables/{codeTableName}/codes/{codeName}",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "codeTableName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "codeName",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "DeleteOneCode": {
        "path": "/{connectionId}/codeTables/{codeTableName}/codes/{codeName}",
        "method": "DELETE",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "codeTableName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "codeName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "Content-Type",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": true,
            "type": "object"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "UpdateOneCode": {
        "path": "/{connectionId}/codeTables/{codeTableName}/codes/{codeName}",
        "method": "PUT",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "codeTableName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "codeName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": true,
            "type": "object"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "CreateOneCode": {
        "path": "/{connectionId}/codeTables/{codeTableName}/codes",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "codeTableName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": true,
            "type": "object"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "GetRoot": {
        "path": "/{connectionId}/",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "GetCheckhealth": {
        "path": "/{connectionId}/checkHealth",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "callstack",
            "in": "query",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "GetBenchmarkPerUnitsByProgramYear": {
        "path": "/{connectionId}/benchmarkPerUnits",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "programYear",
            "in": "query",
            "required": false,
            "type": "integer"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "CreateOneBenchmarkPerUnit": {
        "path": "/{connectionId}/benchmarkPerUnits",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": false,
            "type": "object"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "DeleteOneBenchmarkPerUnit": {
        "path": "/{connectionId}/benchmarkPerUnits/{benchmarkPerUnitId}",
        "method": "DELETE",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "benchmarkPerUnitId",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "UpdateOneBenchmarkPerUnit": {
        "path": "/{connectionId}/benchmarkPerUnits/{benchmarkPerUnitId}",
        "method": "PUT",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "benchmarkPerUnitId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": false,
            "type": "object"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "GetFairMarketValuesByProgramYear": {
        "path": "/{connectionId}/fairMarketValues",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "programYear",
            "in": "query",
            "required": false,
            "type": "integer"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "CreateOneFairMarketValue": {
        "path": "/{connectionId}/fairMarketValues",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": false,
            "type": "object"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "GetOneFairMarketValue": {
        "path": "/{connectionId}/fairMarketValues/{fairMarketValueId}",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "fairMarketValueId",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "DeleteOneFairMarketValue": {
        "path": "/{connectionId}/fairMarketValues/{fairMarketValueId}",
        "method": "DELETE",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "fairMarketValueId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": false,
            "type": "object"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "UpdateOneFairMarketValue": {
        "path": "/{connectionId}/fairMarketValues/{fairMarketValueId}",
        "method": "PUT",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "fairMarketValueId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": false,
            "type": "object"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "ImportBPU": {
        "path": "/{connectionId}/import/bpu/{fileName}",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "fileName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "Content-Type",
            "in": "header",
            "required": false,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": false,
            "type": "object"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "ImportIVPR": {
        "path": "/{connectionId}/import/ivpr/{fileName}",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "fileName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "Content-Type",
            "in": "header",
            "required": false,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": false,
            "type": "object"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "ImportCRA": {
        "path": "/{connectionId}/import/cra/{fileName}",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "fileName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "Content-Type",
            "in": "header",
            "required": false,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": false,
            "type": "object"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "GetInventoryItemDetailsByInventoryItemCode": {
        "path": "/{connectionId}/inventoryItemDetails",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "inventoryItemCode",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "CreateOneInventoryItemDetail": {
        "path": "/{connectionId}/inventoryItemDetails",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": false,
            "type": "object"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "ImportFMV": {
        "path": "/{connectionId}/import/fmv/{fileName}",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "fileName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "Content-Type",
            "in": "header",
            "required": false,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": false,
            "type": "object"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "DeleteOneInventoryItemDetail": {
        "path": "/{connectionId}/inventoryItemDetails/{inventoryItemDetailId}",
        "method": "DELETE",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "inventoryItemDetailId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "Content-Type",
            "in": "header",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "UpdateOneInventoryItemDetail": {
        "path": "/{connectionId}/inventoryItemDetails/{inventoryItemDetailId}",
        "method": "PUT",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "inventoryItemDetailId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "Content-Type",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": true,
            "type": "object"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "GetInventoryTypeXrefsByInventoryClassCode": {
        "path": "/{connectionId}/inventoryTypeXrefs",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "inventoryClassCode",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "CreateOneInventoryTypeXref": {
        "path": "/{connectionId}/inventoryTypeXrefs",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": false,
            "type": "object"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "DeleteOneInventoryTypeXref": {
        "path": "/{connectionId}/inventoryTypeXrefs/{agristabilityCommodityXrefId}",
        "method": "DELETE",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "agristabilityCommodityXrefId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "Content-Type",
            "in": "header",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "UpdateOneInventoryTypeXref": {
        "path": "/{connectionId}/inventoryTypeXrefs/{agristabilityCommodityXrefId}",
        "method": "PUT",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "agristabilityCommodityXrefId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "Content-Type",
            "in": "header",
            "required": false,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": false,
            "type": "object"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "GetInventoryItemAttributesByInventoryItemCode": {
        "path": "/{connectionId}/inventoryItemAttributes",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "inventoryItemCode",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "Content-Type",
            "in": "header",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "CreateOneInventoryItemAttribute": {
        "path": "/{connectionId}/inventoryItemAttributes",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "Content-Type",
            "in": "header",
            "required": false,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": false,
            "type": "object"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "DeleteOneInventoryItemAttribute": {
        "path": "/{connectionId}/inventoryItemAttributes/{inventoryItemAttributeId}",
        "method": "DELETE",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "inventoryItemAttributeId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "Content-Type",
            "in": "header",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "UpdateOneInventoryItemAttribute": {
        "path": "/{connectionId}/inventoryItemAttributes/{inventoryItemAttributeId}",
        "method": "PUT",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "inventoryItemAttributeId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "Content-Type",
            "in": "header",
            "required": false,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": false,
            "type": "object"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "GetStructureGroupAttributesByStructureGroupCode": {
        "path": "/{connectionId}/structureGroupAttributes",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "structureGroupCode",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "CreateOneStructureGroupAttribute": {
        "path": "/{connectionId}/structureGroupAttributes",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "Content-Type",
            "in": "header",
            "required": false,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": false,
            "type": "object"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "DeleteOneStructureGroupAttribute": {
        "path": "/{connectionId}/structureGroupAttributes/{structureGroupAttributeId}",
        "method": "DELETE",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "structureGroupAttributeId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "Content-Type",
            "in": "header",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "UpdateOneStructureGroupAttribute": {
        "path": "/{connectionId}/structureGroupAttributes/{structureGroupAttributeId}",
        "method": "PUT",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "structureGroupAttributeId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "Content-Type",
            "in": "header",
            "required": false,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": false,
            "type": "object"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "GetAllConfigurationParameters": {
        "path": "/{connectionId}/configurationParameters",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "nameStartsWith",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "CreateOneConfigurationParameter": {
        "path": "/{connectionId}/configurationParameters",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "Content-Type",
            "in": "header",
            "required": false,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": false,
            "type": "object"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "DeleteOneConfigurationParameter": {
        "path": "/{connectionId}/configurationParameters/{configurationParameterId}",
        "method": "DELETE",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "configurationParameterId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "Content-Type",
            "in": "header",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "UpdateOneConfigurationParameter": {
        "path": "/{connectionId}/configurationParameters/{configurationParameterId}",
        "method": "PUT",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "configurationParameterId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": false,
            "type": "object"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "GetLineItemsByProgramYear": {
        "path": "/{connectionId}/lineItems",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "programYear",
            "in": "query",
            "required": false,
            "type": "integer"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "CreateOneLineItem": {
        "path": "/{connectionId}/lineItems",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": false,
            "type": "object"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "DeleteOneLineItem": {
        "path": "/{connectionId}/lineItems/{lineItemId}",
        "method": "DELETE",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "lineItemId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "Content-Type",
            "in": "header",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "UpdateOneLineItem": {
        "path": "/{connectionId}/lineItems/{lineItemId}",
        "method": "PUT",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "lineItemId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": false,
            "type": "object"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "CopyLineItems": {
        "path": "/{connectionId}/lineItems/copy/{currentYear}",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "currentYear",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "GetAllMarketRatePremiums": {
        "path": "/{connectionId}/marketRatePremiums",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "CreateOneMarketRatePremium": {
        "path": "/{connectionId}/marketRatePremiums",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": false,
            "type": "object"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "DeleteOneMarketRatePremium": {
        "path": "/{connectionId}/marketRatePremiums/{marketRatePremiumId}",
        "method": "DELETE",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "marketRatePremiumId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "Content-Type",
            "in": "header",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "UpdateOneMarketRatePremium": {
        "path": "/{connectionId}/marketRatePremiums/{marketRatePremiumId}",
        "method": "PUT",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "marketRatePremiumId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "Content-Type",
            "in": "header",
            "required": false,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": false,
            "type": "object"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "GetCropUnitConversionsByInventoryItemCode": {
        "path": "/{connectionId}/cropUnitConversions",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "inventoryItemCode",
            "in": "query",
            "required": false,
            "type": "integer"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "CreateOneCropUnitConversion": {
        "path": "/{connectionId}/cropUnitConversions",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": false,
            "type": "object"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "GetAllFruitVegTypeDetails": {
        "path": "/{connectionId}/fruitVegTypeDetails",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "CreateOneFruitVegTypeDetail": {
        "path": "/{connectionId}/fruitVegTypeDetails",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": false,
            "type": "object"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "GetAllExpectedProductions": {
        "path": "/{connectionId}/expectedProductions",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "inventoryItemCode",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "CreateOneExpectedProduction": {
        "path": "/{connectionId}/expectedProductions",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": false,
            "type": "object"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "DeleteOneFruitVegTypeDetail": {
        "path": "/{connectionId}/fruitVegTypeDetails/{fruitVegTypeCode}",
        "method": "DELETE",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "fruitVegTypeCode",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "UpdateOneFruitVegTypeDetail": {
        "path": "/{connectionId}/fruitVegTypeDetails/{fruitVegTypeCode}",
        "method": "PUT",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "fruitVegTypeCode",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": false,
            "type": "object"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "DeleteOneExpectedProduction": {
        "path": "/{connectionId}/expectedProductions/{expectedProductionId}",
        "method": "DELETE",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "expectedProductionId",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "UpdateOneExpectedProduction": {
        "path": "/{connectionId}/expectedProductions/{expectedProductionId}",
        "method": "PUT",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "expectedProductionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": false,
            "type": "object"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "DeleteOneCropUnitConversion": {
        "path": "/{connectionId}/cropUnitConversions/{cropUnitDefaultId}",
        "method": "DELETE",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "cropUnitDefaultId",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "UpdateOneCropUnitConversion": {
        "path": "/{connectionId}/cropUnitConversions/{cropUnitDefaultId}",
        "method": "PUT",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "cropUnitDefaultId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": false,
            "type": "object"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "GetAllYearConfigurationParameters": {
        "path": "/{connectionId}/yearConfigurationParameters",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "CreateOneYearConfigurationParameter": {
        "path": "/{connectionId}/yearConfigurationParameters",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": false,
            "type": "object"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "DeleteOneYearConfigurationParameter": {
        "path": "/{connectionId}/yearConfigurationParameters/{yearConfigurationParameterId}",
        "method": "DELETE",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "yearConfigurationParameterId",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "UpdateOneYearConfigurationParameter": {
        "path": "/{connectionId}/yearConfigurationParameters/{yearConfigurationParameterId}",
        "method": "PUT",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "yearConfigurationParameterId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": false,
            "type": "object"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      },
      "GetAllProductiveUnitCodes": {
        "path": "/{connectionId}/productiveUnitCodes",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "default": {
            "type": "object"
          }
        }
      }
    }
  }
};
