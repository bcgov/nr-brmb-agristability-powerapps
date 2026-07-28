import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ENROLMENT_LIST_SELECT,
  ENROLMENT_PRIMARY_KEY,
  buildEnrolmentDirectSearchFilter,
  buildEnrolmentOrderBy,
  escapeODataString,
  fetchEnrolmentPage,
  type EnrolmentGetAllOptions,
} from '../src/data/enrolmentPaging.ts';

test('requests one selected, filtered, deterministically ordered page', async () => {
  let actual: EnrolmentGetAllOptions | undefined;
  const response = await fetchEnrolmentPage(
    async (options) => {
      actual = options;
      return { success: true, data: [{ id: 'one' }], skipToken: 'cookie-2' };
    },
    {
      pageSize: 50,
      filter: "contains(vsi_name, 'O''Brien')",
      orderBy: buildEnrolmentOrderBy('modifiedOn', 'desc'),
    },
  );

  assert.equal(actual?.maxPageSize, 50);
  assert.deepEqual(actual?.select, [...ENROLMENT_LIST_SELECT]);
  assert.equal(actual?.filter, "contains(vsi_name, 'O''Brien')");
  assert.deepEqual(actual?.orderBy, ['modifiedon desc', `${ENROLMENT_PRIMARY_KEY} asc`]);
  assert.equal('skipToken' in (actual ?? {}), false);
  assert.deepEqual(response, {
    rows: [{ id: 'one' }],
    nextPageToken: 'cookie-2',
    hasNextPage: true,
  });
});

test('uses the generated result skipToken for the next page', async () => {
  let actual: EnrolmentGetAllOptions | undefined;
  const response = await fetchEnrolmentPage(
    async (options) => {
      actual = options;
      return { success: true, data: [], skipToken: undefined };
    },
    {
      pageSize: 25,
      filter: 'statecode eq 0',
      orderBy: buildEnrolmentOrderBy('pin', 'asc'),
      pageToken: 'cookie-2',
    },
  );

  assert.equal(actual?.skipToken, 'cookie-2');
  assert.equal(response.hasNextPage, false);
});

test('sorting is allowlisted and always includes the primary key tie-breaker', () => {
  assert.deepEqual(buildEnrolmentOrderBy('owner', 'asc'), [
    '_ownerid_value asc',
    `${ENROLMENT_PRIMARY_KEY} asc`,
  ]);
});

test('escapes apostrophes in OData string literals', () => {
  assert.equal(escapeODataString("O'Brien"), "O''Brien");
});

test('direct search covers PIN, farm/corporation, and partnership names', () => {
  assert.equal(
    buildEnrolmentDirectSearchFilter("O'Brien"),
    "contains(vsi_name, 'O''Brien') or contains(new_combinedfarmname, 'O''Brien') or contains(vsi_partnershipnames, 'O''Brien')",
  );
});

test('surfaces generated service errors', async () => {
  await assert.rejects(
    fetchEnrolmentPage(
      async () => ({
        success: false,
        data: [],
        error: { message: 'Dataverse unavailable' },
      }),
      {
        pageSize: 10,
        filter: 'statecode eq 0',
        orderBy: buildEnrolmentOrderBy(null, 'desc'),
      },
    ),
    /Dataverse unavailable/,
  );
});
