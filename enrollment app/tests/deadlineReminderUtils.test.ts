import assert from 'node:assert/strict';
import test from 'node:test';

import { getDaysUntilDate } from '../src/utils/date.ts';
import { getReminderRemainingDays, hasEnrolmentNoticeSentDate, isDueWithinFiveDays, resolveReminderKind, shouldIncludeReminderRow } from '../src/pages/deadlineReminderUtils.ts';

test('prefers the late reminder path for allowed late statuses when late notice date is set', () => {
  assert.equal(resolveReminderKind(865520008, true), 'lateFinalDeadline');
  assert.equal(resolveReminderKind(865520007, true), 'lateFinalDeadline');
  assert.equal(resolveReminderKind(865520007, false), 'nonPenalty');
  assert.equal(resolveReminderKind(865520008, false), 'finalDeadline');
  assert.equal(resolveReminderKind(865520002, true), null);
  assert.equal(resolveReminderKind(865520005, true), null);
  assert.equal(resolveReminderKind(865520005, false), null);
});

test('uses the remaining-days field that matches the reminder status', () => {
  assert.equal(getReminderRemainingDays('nonPenalty', 4, 9, 12), 4);
  assert.equal(getReminderRemainingDays('finalDeadline', 4, 9, 12), 9);
  assert.equal(getReminderRemainingDays('lateFinalDeadline', 4, 9, 12), 12);
  assert.equal(getReminderRemainingDays('nonPenalty', null, 9, 12), null);
  assert.equal(getReminderRemainingDays('lateFinalDeadline', 4, 9, undefined), null);
});

test('computes days until a date from today when needed', () => {
  const now = new Date('2026-08-13T12:00:00Z');

  assert.equal(getDaysUntilDate('2026-08-18T00:00:00Z', now), 5);
  assert.equal(getDaysUntilDate('2026-08-11T00:00:00Z', now), -2);
  assert.equal(getDaysUntilDate(undefined, now), null);
});

test('requires a real enrolment notice sent date', () => {
  assert.equal(hasEnrolmentNoticeSentDate('2026-08-13T00:00:00Z'), true);
  assert.equal(hasEnrolmentNoticeSentDate('  '), false);
  assert.equal(hasEnrolmentNoticeSentDate(undefined), false);
});

test('includes only unsent reminders due one through five days out', () => {
  assert.equal(isDueWithinFiveDays({ remainingDays: 0 }), false);
  assert.equal(isDueWithinFiveDays({ remainingDays: 1 }), true);
  assert.equal(isDueWithinFiveDays({ remainingDays: 5 }), true);
});

test('excludes overdue reminders even if another view displays them near zero', () => {
  assert.equal(isDueWithinFiveDays({ remainingDays: -1 }), false);
  assert.equal(isDueWithinFiveDays({ remainingDays: -5 }), false);
});

test('includes due items regardless of reminder-sent state and excludes values outside the window', () => {
  assert.equal(isDueWithinFiveDays({ remainingDays: 3 }), true);
  assert.equal(isDueWithinFiveDays({ remainingDays: 6 }), false);
  assert.equal(isDueWithinFiveDays({ remainingDays: null }), false);
});

test('excludes zero-day rows only when reminder sent is no', () => {
  assert.equal(shouldIncludeReminderRow({ remainingDays: 0, reminderSent: false }), false);
  assert.equal(shouldIncludeReminderRow({ remainingDays: 0, reminderSent: true }), true);
  assert.equal(shouldIncludeReminderRow({ remainingDays: 0, reminderSent: null }), true);
  assert.equal(shouldIncludeReminderRow({ remainingDays: 1, reminderSent: false }), true);
});