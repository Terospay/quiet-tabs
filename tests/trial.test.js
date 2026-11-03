import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, DAY, TRIAL_LIMIT } from '../core.js';
import { TabManager } from '../engine.js';
import { fakeChrome, makeTab } from './fake-chrome.js';

function setup(tabs = [makeTab()]) {
  const env = fakeChrome(0, tabs);
  let time = 3 * DAY;
  const manager = new TabManager(env.api, () => time);
  return { ...env, manager, setTime: value => { time = value; } };
}

test('new installations default to trial and no time limit changes that mode', async () => {
  assert.equal(createState(0).settings.mode, 'trial');
  const { manager, tabs, db, setTime } = setup();
  await manager.check(true);
  setTime(100 * DAY);
  const result = await manager.check(true);
  assert.equal(db.local.state.settings.mode, 'trial');
  assert.equal(tabs.size, 1);
  assert.equal(result.trial.entries.length, 1);
  assert.equal(result.archive.length, 0);
});

test('trial rejects closing at the worker boundary, even an explicit close request', async () => {
  const { manager, tabs, calls, db } = setup();
  await assert.rejects(manager.handle({ type: 'close', id: 1, url: makeTab().url }), /Trial mode/);
  await assert.rejects(manager.close(db.local.state, 1, makeTab().url, true), /Trial mode/);
  assert.equal(calls.filter(call => call.type === 'remove').length, 0);
  assert.equal(tabs.size, 1);
});

test('journal deduplicates an episode across checks and worker recreation', async () => {
  const { manager, api } = setup();
  const first = await manager.check(true);
  await manager.check();
  const second = await new TabManager(api, () => 4 * DAY).check(true);
  assert.equal(first.trial.entries.length, 1);
  assert.equal(second.trial.entries.length, 1);
  assert.equal(second.trial.entries[0].id, first.trial.entries[0].id);
  assert.equal(second.trial.entries[0].suggestedAt, 3 * DAY);
});

test('agree only records feedback; needed protects the live tab; later snoozes it', async () => {
  for (const decision of ['agree', 'keep', 'later']) {
    const { manager, tabs, calls } = setup();
    const snapshot = await manager.handle({ type: 'snapshot' });
    const result = await manager.handle({ type: 'feedback', id: snapshot.trial.entries[0].id, decision });
    assert.equal(result.trial.entries[0].decision, decision);
    assert.equal(tabs.size, 1);
    assert.equal(calls.filter(call => call.type === 'remove').length, 0);
    if (decision === 'keep') assert.equal(result.tabs[0].keep, true);
    if (decision === 'later') assert.equal(result.tabs[0].snoozeUntil, 4 * DAY);
  }
});

test('history feedback cannot protect a different page reusing the same tab ID', async () => {
  const { manager, tabs } = setup();
  const first = await manager.check();
  tabs.get(1).url = 'https://other.example';
  const result = await manager.handle({ type: 'feedback', id: first.trial.entries[0].id, decision: 'keep' });
  assert.equal(result.tabs[0].keep, false);
  assert.equal(result.trial.entries[0].decision, 'keep');
});

test('new meaningful attention allows a new episode after the next stale interval', async () => {
  const { manager, tabs, setTime } = setup();
  await manager.check();
  tabs.get(1).active = true;
  await manager.check(false, 3 * DAY);
  setTime(3 * DAY + 20_000);
  await manager.check();
  tabs.get(1).active = false;
  await manager.check(false, 3 * DAY + 20_000);
  setTime(5 * DAY);
  const result = await manager.check();
  assert.equal(result.trial.entries.length, 2);
  assert.equal(result.trial.entries[0].activeMs, 20_000);
  assert.equal(result.trial.entries[1].activeMs, 0);
});

test('bounded journal does not endlessly re-add evicted proposals', async () => {
  const { manager } = setup(Array.from({ length: TRIAL_LIMIT + 2 }, (_, i) => makeTab(i + 1)));
  const first = await manager.check();
  assert.equal(first.trial.entries.length, TRIAL_LIMIT);
  assert.equal(first.trial.trimmed, 2);
  const second = await manager.check();
  assert.equal(second.trial.trimmed, 2);
  assert.deepEqual(second.trial.entries.map(entry => entry.id), first.trial.entries.map(entry => entry.id));
});

test('auto mode cannot be enabled without explicit acknowledgement', async () => {
  const { manager, db } = setup();
  await assert.rejects(manager.handle({ type: 'settings', settings: { ...db.local.state.settings, mode: 'auto' } }));
  assert.equal(db.local.state.settings.mode, 'trial');
});
