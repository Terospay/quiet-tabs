import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, createRecord, assess, startSession, reconcile, settleFocus, beginFocus,
  validateSettings, MINUTE, HOUR, DAY } from '../core.js';
import { makeTab } from './fake-chrome.js';

const now = 20 * DAY;

test('retention increases with time spent, and recent use resets eligibility', () => {
  const state = createState(0);
  const tab = makeTab();
  for (const [activeMs, hours] of [[0, 24], [MINUTE, 72], [10 * MINUTE, 168]]) {
    const record = { ...createRecord(tab, 0), activeMs };
    assert.equal(assess(tab, record, state.settings, hours * HOUR - 1).candidate, false);
    assert.equal(assess(tab, record, state.settings, hours * HOUR).candidate, true);
    record.lastMeaningfulAt = hours * HOUR;
    assert.equal(assess(tab, record, state.settings, hours * HOUR + MINUTE).candidate, false);
  }
});

test('all browser protection signals override stale status', () => {
  const state = createState(0);
  for (const flags of [{ active: true }, { pinned: true }, { audible: true }, { autoDiscardable: false },
    { status: 'loading' }, { pendingUrl: 'https://next.example' }, { splitViewId: 2 }]) {
    const tab = makeTab(1, flags);
    const result = assess(tab, createRecord(tab, 0), state.settings, now);
    assert.equal(result.candidate, false, JSON.stringify(flags));
    assert.ok(result.protection);
  }
});

test('keep, snooze and domain exceptions protect pages with exact hostname boundaries', () => {
  const state = createState(0);
  const tab = makeTab(1, { url: 'https://sub.example.com/path' });
  const record = createRecord(tab, 0);
  state.settings.excludedDomains = ['example.com'];
  assert.equal(assess(tab, record, state.settings, now).candidate, false);
  record.url = 'https://notexample.com';
  assert.equal(assess(tab, record, state.settings, now).candidate, true);
  for (const flag of [{ keep: true }, { snoozeUntil: now + 1 }, { graceUntil: now + 1 }]) {
    assert.equal(assess(tab, { ...record, ...flag }, state.settings, now).candidate, false);
  }
});

test('time tracking survives worker restarts but never credits a sleep gap', () => {
  const state = createState(0);
  const tab = makeTab();
  reconcile(state, [tab], 0);
  beginFocus(state, tab, 0);
  const reloaded = structuredClone(state);
  settleFocus(reloaded, 30_000);
  assert.equal(reloaded.records[1].activeMs, 30_000);
  beginFocus(reloaded, tab, 30_000);
  settleFocus(reloaded, DAY);
  assert.equal(reloaded.records[1].activeMs, 30_000);
  assert.equal(reloaded.records[1].lastMeaningfulAt, 30_000);
});

test('startup rematches duplicate URLs without reusing a record or trusting changed tab IDs', () => {
  const state = createState(0);
  state.sessionId = 'old';
  const one = makeTab(1);
  const two = makeTab(2, { url: one.url });
  reconcile(state, [one, two], 0);
  state.records[1].activeMs = 42;
  state.records[2].activeMs = 84;
  startSession(state, 'new', now);
  reconcile(state, [{ ...one, id: 200 }], now);
  reconcile(state, [{ ...one, id: 200 }, { ...two, id: 300 }], now + MINUTE);
  assert.equal(state.records[200].activeMs, 42);
  assert.equal(state.records[300].activeMs, 84);
  assert.equal(state.pending.length, 0);
  assert.ok(state.records[200].graceUntil > now);
  assert.equal(state.records[200].lastMeaningfulAt, null);
});

test('navigation resets attention, while service pages and incognito are excluded', () => {
  const state = createState(0);
  reconcile(state, [makeTab()], 0);
  state.records[1].keep = true;
  reconcile(state, [makeTab(1, { url: 'https://other.example' }), makeTab(2, { url: 'chrome://settings' }),
    makeTab(3, { incognito: true })], now);
  assert.deepEqual(Object.keys(state.records), ['1']);
  assert.equal(state.records[1].keep, false);
  assert.equal(state.records[1].lastMeaningfulAt, null);
  assert.equal(state.records[1].firstSeenAt, now);
});

test('settings reject malformed thresholds, hostnames and unacknowledged auto mode', () => {
  const previous = createState(0).settings;
  for (const hours of [[0, 72, 168], [24, 1, 168], [24, NaN, 168], [24, 72]]) {
    assert.throws(() => validateSettings({ ...previous, hours }, previous, now));
  }
  assert.throws(() => validateSettings({ ...previous, excludedDomains: ['https://example.com'] }, previous, now));
  assert.throws(() => validateSettings({ ...previous, mode: 'auto' }, previous, now));
  const next = validateSettings({ ...previous, mode: 'auto', acknowledged: true }, previous, now);
  assert.equal(next.autoStartsAt, now + HOUR);
});
