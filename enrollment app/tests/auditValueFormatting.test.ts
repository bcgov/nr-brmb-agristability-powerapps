import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractSystemUserGuids,
  formatAuditValueForDisplay,
} from '../src/utils/auditValueFormatting.ts';

test('extracts system user GUIDs from audit reference strings', () => {
  assert.deepEqual(
    extractSystemUserGuids('systemuser,7c961a24-605b-f011-877a-000d3ae8704b'),
    ['7c961a24-605b-f011-877a-000d3ae8704b'],
  );

  assert.deepEqual(
    extractSystemUserGuids('systemuser,{7c961a24-605b-f011-877a-000d3ae8704b};systemuser,2d11f0b2-1a2a-4c4a-9f64-9d8d7c6b2d2f'),
    ['7c961a24-605b-f011-877a-000d3ae8704b', '2d11f0b2-1a2a-4c4a-9f64-9d8d7c6b2d2f'],
  );

  assert.deepEqual(
    extractSystemUserGuids('systemuser,7c961a24-605b-f011-877a-000d3ae8704b and another'),
    ['7c961a24-605b-f011-877a-000d3ae8704b'],
  );
});

test('formats system-user GUIDs using a friendly display-name map', () => {
  const map = new Map<string, string>([
    ['7c961a24-605b-f011-877a-000d3ae8704b', 'System User'],
  ]);

  assert.equal(
    formatAuditValueForDisplay('systemuser,7c961a24-605b-f011-877a-000d3ae8704b', map),
    'System User',
  );

  assert.equal(
    formatAuditValueForDisplay('plain text', map),
    'plain text',
  );
});

test('resolves bare businessunit GUIDs using the field name as context', () => {
  const map = new Map<string, string>([
    ['businessunit:7c961a24-605b-f011-877a-000d3ae8704b', 'Agri Business Unit'],
  ]);

  assert.equal(
    formatAuditValueForDisplay('{7c961a24-605b-f011-877a-000d3ae8704b}', map, 'owningbusinessunit'),
    'Agri Business Unit',
  );
});
