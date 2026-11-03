import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, reconcile, settleFocus, beginFocus, assess, DAY, MINUTE, loadState, validateSettings } from '../core.js';
import { makeTab, fakeChrome } from './fake-chrome.js';
import { TabManager } from '../engine.js';

test('20 half-second visits show ten seconds total but no meaningful attention', () => {
  const state = createState(0);
  const tab = makeTab();
  reconcile(state, [tab], 0);
  let time = 2 * DAY;
  for (let i = 0; i < 20; i++) {
    beginFocus(state, tab, time);
    settleFocus(state, time + 500);
    beginFocus(state, undefined, time + 500);
    time += 1000;
  }
  const record = state.records[1];
  assert.equal(record.visibleMs, 10_000);
  assert.equal(record.activeMs, 0);
  assert.equal(record.meaningfulVisits, 0);
  assert.equal(record.lastMeaningfulAt, null);
  assert.equal(assess(tab, record, state.settings, time).candidate, true);
});

test('qualification threshold is continuous and includes the first seconds exactly once', () => {
  const state = createState(0);
  const tab = makeTab();
  reconcile(state, [tab], 0);
  beginFocus(state, tab, 0);
  settleFocus(state, 14_999);
  assert.equal(state.records[1].activeMs, 0);
  assert.equal(state.records[1].lastMeaningfulAt, null);
  beginFocus(state, tab, 14_999);
  settleFocus(state, 15_000);
  assert.equal(state.records[1].activeMs, 15_000);
  assert.equal(state.records[1].meaningfulVisits, 1);
  settleFocus(state, 60_000);
  assert.equal(state.records[1].activeMs, 60_000);
  assert.equal(state.records[1].visibleMs, 60_000);
  assert.equal(state.records[1].meaningfulVisits, 1);
});

test('many glances cannot combine into a qualified visit even if total exceeds a minute', () => {
  const state = createState(0);
  const tab = makeTab();
  reconcile(state, [tab], 0);
  for (let i = 0; i < 10; i++) {
    beginFocus(state, tab, i * MINUTE);
    settleFocus(state, i * MINUTE + 10_000);
    beginFocus(state, undefined, i * MINUTE + 10_000);
  }
  assert.equal(state.records[1].visibleMs, 100_000);
  assert.equal(state.records[1].activeMs, 0);
});

test('a quick revisit cannot refresh a previously meaningful visit', () => {
  const state = createState(0);
  const tab = makeTab();
  reconcile(state, [tab], 0);
  beginFocus(state, tab, 0);
  settleFocus(state, 20_000);
  beginFocus(state, undefined, 20_000);
  beginFocus(state, tab, 2 * DAY);
  settleFocus(state, 2 * DAY + 500);
  beginFocus(state, undefined, 2 * DAY + 500);
  assert.equal(state.records[1].lastMeaningfulAt, 20_000);
  assert.equal(state.records[1].activeMs, 20_000);
  assert.equal(assess(tab, state.records[1], state.settings, 2 * DAY).candidate, true);
});

test('qualified attention survives a normal worker suspension; sleep starts a new visit', () => {
  const state = createState(0);
  const tab = makeTab();
  reconcile(state, [tab], 0);
  beginFocus(state, tab, 0);
  settleFocus(state, 10_000);
  const resumed = structuredClone(state);
  settleFocus(resumed, 20_000);
  assert.equal(resumed.records[1].activeMs, 20_000);
  settleFocus(resumed, DAY);
  beginFocus(resumed, tab, DAY);
  settleFocus(resumed, DAY + 1000);
  assert.equal(resumed.records[1].activeMs, 20_000);
  assert.equal(resumed.records[1].lastMeaningfulAt, 20_000);
});

test('migration from the draft preserves saved links and protection but always starts a trial', () => {
  const state = loadState({ version: 1, sessionId: 'old', settings: { mode: 'auto', hours: [24, 72, 168], excludedDomains: ['example.org'] },
    archive: [{ id: 'saved', url: 'https://example.com' }],
    records: { 1: { url: 'https://example.com', title: 'Old', activeMs: 600_000, keep: true, snoozeUntil: 0 } },
  }, DAY);
  assert.equal(state.version, 2);
  assert.equal(state.settings.mode, 'trial');
  assert.equal(state.records[1].activeMs, 0);
  assert.equal(state.records[1].visibleMs, 600_000);
  assert.equal(state.records[1].keep, true);
  assert.equal(state.records[1].lastMeaningfulAt, null);
  assert.equal(state.archive[0].id, 'saved');
  assert.throws(() => loadState({ version: 99 }, DAY), /version/);
});

test('attention threshold is configurable and validated', () => {
  const state = createState(0);
  for (const value of [0, 4, 121, 15.5, NaN, '15']) {
    assert.throws(() => validateSettings({ ...state.settings, minVisitSeconds: value }, state.settings, 0));
  }
  state.settings = validateSettings({ ...state.settings, minVisitSeconds: 30 }, state.settings, 0);
  const tab = makeTab();
  reconcile(state, [tab], 0);
  beginFocus(state, tab, 0);
  settleFocus(state, 20_000);
  assert.equal(state.records[1].activeMs, 0);
  settleFocus(state, 30_000);
  assert.equal(state.records[1].activeMs, 30_000);
});

test('manager counts rapid visits separately and a long visit resets the stale clock', async () => {
  const env = fakeChrome(0, [makeTab(1, { active: true }), makeTab(2)]);
  let now = 2 * DAY;
  const manager = new TabManager(env.api, () => now);
  await manager.check();
  for (let i = 0; i < 20; i++) {
    now += 500;
    env.tabs.get(1).active = false;
    env.tabs.get(2).active = true;
    await manager.check(false, now);
    now += 500;
    env.tabs.get(2).active = false;
    env.tabs.get(1).active = true;
    await manager.check(false, now);
  }
  assert.equal(env.db.local.state.records[1].visibleMs, 10_000);
  assert.equal(env.db.local.state.records[1].activeMs, 0);
  assert.equal(env.db.local.state.records[1].lastMeaningfulAt, null);
  now += 20_000;
  await manager.check();
  assert.equal(env.db.local.state.records[1].activeMs, 20_000);
  assert.equal(env.db.local.state.records[1].lastMeaningfulAt, now);
});

test('queued activation events break a visit even when queries already see the original tab', async () => {
  const env = fakeChrome(0, [makeTab(1, { active: true })]);
  let now = 2 * DAY;
  const manager = new TabManager(env.api, () => now);
  await manager.check();
  now += 20_000;
  // Both rapid switches are delivered late; the first really happened half a second after the previous sample.
  await manager.check(false, 2 * DAY + 500);
  await manager.check(false, 2 * DAY + 1000);
  assert.equal(env.db.local.state.records[1].activeMs, 0);
  assert.equal(env.db.local.state.records[1].lastMeaningfulAt, null);
});
