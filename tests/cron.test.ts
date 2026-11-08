import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cronMatches } from '../src/server/cron.js';

const at = (h: number, m: number, day = 1, month = 1) =>
  new Date(2026, month - 1, day, h, m, 0);

test('every minute', () => {
  assert.ok(cronMatches('* * * * *', at(3, 17)));
});

test('fixed hour and minute', () => {
  assert.ok(cronMatches('0 6 * * *', at(6, 0)));
  assert.ok(!cronMatches('0 6 * * *', at(6, 1)));
  assert.ok(!cronMatches('0 6 * * *', at(7, 0)));
});

test('step hours', () => {
  assert.ok(cronMatches('0 */4 * * *', at(0, 0)));
  assert.ok(cronMatches('0 */4 * * *', at(8, 0)));
  assert.ok(!cronMatches('0 */4 * * *', at(9, 0)));
});

test('step minutes', () => {
  assert.ok(cronMatches('*/30 * * * *', at(5, 0)));
  assert.ok(cronMatches('*/30 * * * *', at(5, 30)));
  assert.ok(!cronMatches('*/30 * * * *', at(5, 31)));
});

test('comma list of hours', () => {
  assert.ok(cronMatches('0 9,14,19 * * *', at(14, 0)));
  assert.ok(!cronMatches('0 9,14,19 * * *', at(15, 0)));
});

test('day of week — 2026-01-05 is a Monday', () => {
  assert.equal(at(11, 0, 5).getDay(), 1);
  assert.ok(cronMatches('0 11 * * 1', at(11, 0, 5)));
  assert.ok(!cronMatches('0 11 * * 1', at(11, 0, 6)));
});

test('minute offset', () => {
  assert.ok(cronMatches('15 * * * *', at(2, 15)));
  assert.ok(!cronMatches('15 * * * *', at(2, 16)));
});

test('malformed expression never fires', () => {
  assert.ok(!cronMatches('nonsense', at(1, 1)));
  assert.ok(!cronMatches('0 6 * *', at(6, 0)));
});
