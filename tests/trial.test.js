import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, loadState, DAY, HOUR, TRIAL_LIMIT, ARCHIVE_LIMIT } from '../core.js';
import { TabManager } from '../engine.js';
import { fakeChrome, makeTab } from './fake-chrome.js';

function setup(tabs = [makeTab()]) {
  const env = fakeChrome(0, tabs);
  let time = 3 * DAY;
  const manager = new TabManager(env.api, () => time);
  return { ...env, manager, setTime: value => { time = value; } };
}

test('new installations default to recommendations and no time limit changes that mode', async () => {
  assert.equal(createState(0).settings.mode, 'suggest');
  const { manager, tabs, db, setTime } = setup();
  await manager.check(true);
  setTime(100 * DAY);
  const result = await manager.check(true);
  assert.equal(db.local.state.settings.mode, 'suggest');
  assert.equal(tabs.size, 1);
  assert.equal(result.trial.entries.length, 1);
  assert.equal(result.archive.length, 0);
});

test('recommendations reject automatic closing at the worker boundary but allow explicit close requests', async () => {
  const { manager, tabs, calls, db } = setup();
  await assert.rejects(manager.close(db.local.state, 1, makeTab().url, true), /Automatic closing is not enabled/);
  assert.equal(calls.filter(call => call.type === 'remove').length, 0);
  assert.equal(tabs.size, 1);
  const result = await manager.handle({ type: 'close', id: 1, url: makeTab().url });
  assert.equal(tabs.size, 0);
  assert.equal(result.archive[0].closed, true);
  assert.equal(result.archive[0].automatic, false);
  assert.equal(result.settings.mode, 'suggest');
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

test('agree saves a recovery link before closing and restore protects the new tab', async () => {
  const { manager, tabs, db, hooks, calls } = setup();
  const snapshot = await manager.check();
  const id = snapshot.trial.entries[0].id;
  hooks.beforeRemove = async () => {
    assert.equal(db.local.state.archive[0].url, makeTab().url);
    assert.equal(db.local.state.archive[0].closed, false);
  };
  const result = await manager.handle({ type: 'feedback', id, decision: 'agree' });
  assert.equal(tabs.size, 0);
  assert.equal(result.trial.entries[0].decision, 'agree');
  assert.equal(result.trial.entries[0].reviewedAt, 3 * DAY);
  assert.equal(result.archive[0].closed, true);
  assert.equal(result.archive[0].automatic, false);
  assert.equal(result.settings.mode, 'suggest');
  const restored = await manager.handle({ type: 'restore', id: result.archive[0].id });
  assert.equal(restored.archive.length, 0);
  assert.equal(restored.tabs[0].snoozeUntil, 4 * DAY);
  await assert.rejects(manager.handle({ type: 'feedback', id, decision: 'agree' }), /no longer matches/);
  assert.equal(tabs.size, 1);
  assert.equal(calls.filter(call => call.type === 'remove').length, 1);
});

test('needed protects the live tab; later snoozes it without closing', async () => {
  for (const decision of ['keep', 'later']) {
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

test('agree leaves tabs open when archiving or removal fails and does not record success', async () => {
  for (const failure of ['write', 'capacity', 'remove']) {
    const { manager, tabs, db, hooks } = setup();
    const snapshot = await manager.check();
    if (failure === 'write') hooks.beforeSave = async (_area, values) => {
      if (values.state?.archive.length) throw new Error('disk full');
    };
    if (failure === 'capacity') db.local.state.archive = Array.from({ length: ARCHIVE_LIMIT }, (_, i) => ({ id: String(i) }));
    if (failure === 'remove') hooks.beforeRemove = async () => { throw new Error('remove blocked'); };
    const error = failure === 'write' ? /disk full/ : failure === 'capacity' ? /500/ : /remove blocked/;
    await assert.rejects(manager.handle({ type: 'feedback', id: snapshot.trial.entries[0].id, decision: 'agree' }), error);
    assert.equal(tabs.size, 1, failure);
    assert.equal(db.local.state.trial.entries[0].decision, 'pending', failure);
    assert.equal(db.local.state.trial.entries[0].reviewedAt, null, failure);
    if (failure === 'remove') assert.equal(db.local.state.archive[0].closed, false);
  }
});

test('agree rechecks browser protection after saving the recovery link', async () => {
  for (const change of [{ active: true }, { pinned: true }, { audible: true }, { incognito: true },
    { autoDiscardable: false }, { splitViewId: 1 }, { status: 'loading' },
    { url: 'https://new.example' }, { lastAccessed: 3 * DAY }, { pendingUrl: 'https://next.example' }]) {
    const { manager, tabs, db, hooks } = setup();
    const snapshot = await manager.check();
    hooks.beforeSave = async (_area, values) => {
      if (values.state?.archive.length) Object.assign(tabs.get(1), change);
    };
    await assert.rejects(manager.handle({ type: 'feedback', id: snapshot.trial.entries[0].id, decision: 'agree' }), /left open/);
    assert.equal(tabs.size, 1, JSON.stringify(change));
    assert.equal(db.local.state.archive[0].closed, false);
    assert.equal(db.local.state.trial.entries[0].decision, 'pending');
  }
});

test('agree cannot act on a missing, changed, protected or outdated suggestion', async () => {
  for (const change of ['closed', 'navigated', 'active', 'kept', 'excluded', 'visited', 'settings']) {
    const { manager, tabs, db, setTime } = setup();
    const snapshot = await manager.check();
    const record = db.local.state.records[1];
    if (change === 'closed') tabs.delete(1);
    if (change === 'navigated') tabs.get(1).url = 'https://other.example';
    if (change === 'active') tabs.get(1).active = true;
    if (change === 'kept') record.keep = true;
    if (change === 'excluded') db.local.state.settings.excludedDomains = ['example.com'];
    if (change === 'visited') { record.lastMeaningfulAt = 3 * DAY; setTime(5 * DAY); }
    if (change === 'settings') db.local.state.settings.hours = [1, 48, 120];
    await assert.rejects(manager.handle({ type: 'feedback', id: snapshot.trial.entries[0].id, decision: 'agree' }), /no longer matches|protected/);
    assert.equal(tabs.size, change === 'closed' ? 0 : 1, change);
    assert.equal(db.local.state.archive.length, 0, change);
    assert.equal(db.local.state.trial.entries.find(entry => entry.id === snapshot.trial.entries[0].id).decision, 'pending');
  }
});

test('saved agree ratings from earlier versions never trigger closing on refresh', async () => {
  const { manager, db, tabs } = setup();
  await manager.check();
  db.local.state.trial.entries[0].decision = 'agree';
  await manager.check(true);
  assert.equal(tabs.size, 1);
  assert.equal(db.local.state.archive.length, 0);
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
  assert.equal(db.local.state.settings.mode, 'suggest');
});

test('saved trial and suggest modes merge without losing data or triggering closing', async () => {
  for (const mode of ['trial', 'suggest']) {
    const { manager, db, tabs } = setup([makeTab(1), makeTab(2), makeTab(3)]);
    db.local.state.settings = { ...db.local.state.settings, language: 'ru', hours: [12, 36, 96],
      minVisitSeconds: 20, excludedDomains: ['protected.example'], autoStartsAt: HOUR };
    await manager.check();
    db.local.state.settings.mode = mode;
    db.local.state.records[2].keep = true;
    db.local.state.records[3].snoozeUntil = 4 * DAY;
    db.local.state.records[1].visibleMs = 12_000;
    db.local.state.trial.entries.find(entry => entry.tabId === 1).decision = 'agree';
    db.local.state.archive.push({ id: 'saved', url: 'https://saved.example', title: 'Saved link', savedAt: 0, automatic: false, closed: true });
    const before = structuredClone(db.local.state);
    const result = await manager.check(true);
    assert.equal(tabs.size, 3, mode);
    assert.deepEqual(result.settings, { ...before.settings, mode: 'suggest' });
    assert.deepEqual(result.trial, before.trial);
    assert.deepEqual(result.archive, before.archive);
    assert.deepEqual(db.local.state.records, before.records);
    assert.deepEqual(loadState(structuredClone(db.local.state), 3 * DAY), db.local.state, 'Migration is idempotent');
    const entry = result.trial.entries.find(item => item.tabId === 1);
    await manager.handle({ type: 'feedback', id: entry.id, decision: 'agree' });
    assert.equal(tabs.has(1), false, 'Migrated suggestions still support explicit closing');
  }
});

test('existing automatic settings survive loading and switching back stops automatic closing', async () => {
  const { manager, db, tabs, setTime } = setup();
  db.local.state.settings = { ...db.local.state.settings, mode: 'auto', autoStartsAt: 4 * DAY };
  db.local.state.nextAutoAt = 4 * DAY + HOUR;
  const before = structuredClone(db.local.state);
  assert.deepEqual(loadState(structuredClone(before), 3 * DAY), before);
  const automatic = await manager.check(true);
  assert.equal(automatic.settings.mode, 'auto');
  assert.equal(automatic.settings.autoStartsAt, 4 * DAY);
  const manual = await manager.handle({ type: 'settings', settings: { ...automatic.settings, mode: 'suggest' } });
  assert.equal(manual.trial.entries.length, 1);
  setTime(10 * DAY);
  await manager.check(true);
  assert.equal(tabs.size, 1);
  await assert.rejects(manager.handle({ type: 'settings', settings: { ...manual.settings, mode: 'auto' } }), /Confirm/);
  assert.equal(db.local.state.settings.mode, 'suggest');
});
