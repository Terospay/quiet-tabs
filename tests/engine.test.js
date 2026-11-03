import test from 'node:test';
import assert from 'node:assert/strict';
import { TabManager } from '../engine.js';
import { DAY, HOUR, MINUTE, ARCHIVE_LIMIT } from '../core.js';
import { fakeChrome, makeTab } from './fake-chrome.js';

const now = 10 * DAY;
function setup(tabs = [makeTab()]) {
  const env = fakeChrome(0, tabs);
  env.db.local.state.settings.mode = 'suggest';
  let clock = now;
  let id = 0;
  const manager = new TabManager(env.api, () => clock, () => `entry-${++id}`);
  return { ...env, manager, setClock: value => { clock = value; } };
}

test('suggestion mode never closes tabs during periodic checks', async () => {
  const { manager, tabs, api } = setup();
  const result = await manager.check(true);
  assert.equal(result.tabs[0].candidate, true);
  assert.equal(tabs.size, 1);
  assert.equal(api.badge, '1');
});

test('manual close persists a recovery link before removal and restore gets a fresh day', async () => {
  const { manager, tabs, db, hooks } = setup();
  hooks.beforeRemove = async () => {
    assert.equal(db.local.state.archive[0].url, makeTab().url);
  };
  const closed = await manager.handle({ type: 'close', id: 1, url: makeTab().url });
  assert.equal(tabs.size, 0);
  assert.equal(closed.archive[0].closed, true);
  const restored = await manager.handle({ type: 'restore', id: closed.archive[0].id });
  assert.equal(tabs.size, 1);
  assert.equal(restored.archive.length, 0);
  assert.equal(restored.tabs[0].candidate, false);
  assert.equal(restored.tabs[0].snoozeUntil, now + DAY);
  assert.equal(restored.tabs[0].lastMeaningfulAt, null);
  assert.equal(restored.tabs[0].firstSeenAt, now);
});

test('a failed archive write never closes the tab', async () => {
  const { manager, tabs, hooks } = setup();
  hooks.beforeSave = async (_area, values) => {
    if (values.state?.archive.length) throw new Error('disk full');
  };
  await assert.rejects(manager.handle({ type: 'close', id: 1, url: makeTab().url }), /disk full/);
  assert.equal(tabs.size, 1);
});

test('protection changes during archive write abort closure', async () => {
  for (const change of [{ active: true }, { pinned: true }, { url: 'https://new.example' },
    { lastAccessed: now }, { audible: true }, { pendingUrl: 'https://next.example' }]) {
    const { manager, tabs, hooks, db } = setup();
    hooks.beforeSave = async (_area, values) => {
      if (values.state?.archive.length) Object.assign(tabs.get(1), change);
    };
    await assert.rejects(manager.handle({ type: 'close', id: 1, url: makeTab().url }));
    assert.equal(tabs.size, 1, JSON.stringify(change));
    assert.equal(db.local.state.archive[0].closed, false);
  }
});

test('removal failure keeps recovery link, and restore failure keeps archive entry', async () => {
  const { manager, tabs, hooks, db } = setup();
  hooks.beforeRemove = async () => { throw new Error('remove blocked'); };
  await assert.rejects(manager.handle({ type: 'close', id: 1, url: makeTab().url }), /remove blocked/);
  assert.equal(tabs.size, 1);
  assert.equal(db.local.state.archive.length, 1);
  hooks.beforeCreate = async () => { throw new Error('create blocked'); };
  await assert.rejects(manager.handle({ type: 'restore', id: db.local.state.archive[0].id }), /create blocked/);
  assert.equal(db.local.state.archive.length, 1);
});

test('automatic mode honors startup delay, batch limit, cooldown and manual snapshots', async () => {
  const { manager, tabs, db, setClock } = setup(Array.from({ length: 12 }, (_, i) => makeTab(i + 1)));
  await manager.handle({ type: 'settings', settings: { ...db.local.state.settings, mode: 'auto', acknowledged: true } });
  await manager.check(true);
  assert.equal(tabs.size, 12);
  setClock(now + HOUR);
  await manager.handle({ type: 'snapshot' });
  assert.equal(tabs.size, 12);
  await manager.check(true);
  assert.equal(tabs.size, 7);
  await manager.check(true);
  assert.equal(tabs.size, 7);
  setClock(now + HOUR + 15 * MINUTE);
  await manager.check(true);
  assert.equal(tabs.size, 2);
});

test('active tabs in background windows, kept pages and excluded sites stay open', async () => {
  const { manager, tabs, db } = setup([
    makeTab(1, { active: true, windowId: 2 }), makeTab(2), makeTab(3, { url: 'https://docs.example.org' }),
  ]);
  db.local.state.records[2].keep = true;
  db.local.state.settings = { ...db.local.state.settings, mode: 'auto', excludedDomains: ['example.org'] };
  const result = await manager.check(true);
  assert.equal(tabs.size, 3);
  assert.equal(result.tabs.filter(tab => tab.candidate).length, 0);
});

test('idle time and unfocused windows are not continuously counted', async () => {
  const { manager, api, db, setClock } = setup([makeTab(1, { active: true })]);
  await manager.check();
  setClock(now + 30_000);
  await manager.check();
  assert.equal(db.local.state.records[1].activeMs, 30_000);
  api.focused = false;
  await manager.check();
  setClock(now + 60_000);
  await manager.check();
  assert.equal(db.local.state.records[1].activeMs, 30_000);
  api.focused = true;
  api.idleState = 'idle';
  await manager.check();
  setClock(now + 90_000);
  await manager.check();
  assert.equal(db.local.state.records[1].activeMs, 30_000);
});

test('archive capacity stops automatic closing without dropping existing links', async () => {
  const { manager, tabs, db, api } = setup();
  db.local.state.settings.mode = 'auto';
  db.local.state.archive = Array.from({ length: ARCHIVE_LIMIT }, (_, i) => ({ id: String(i), url: makeTab().url }));
  const result = await manager.check(true);
  assert.equal(tabs.size, 1);
  assert.equal(result.archive.length, ARCHIVE_LIMIT);
  assert.match(result.error, /500/);
  assert.equal(api.badge, '!');
});

test('a browser restart restores history by URL and pauses automatic closing', async () => {
  const { manager, db, tabs } = setup();
  db.local.state.settings.mode = 'auto';
  db.local.state.records[1].activeMs = 300_000;
  db.session = {};
  tabs.delete(1);
  tabs.set(2, makeTab(2, { url: makeTab().url }));
  const result = await manager.check(true);
  assert.equal(tabs.size, 1);
  assert.equal(result.tabs[0].activeMs, 300_000);
  assert.equal(result.tabs[0].lastMeaningfulAt, null);
  assert.equal(result.tabs[0].candidate, false);
});

test('request to close a stale UI entry cannot close a newly navigated tab', async () => {
  const { manager, tabs } = setup();
  tabs.get(1).url = 'https://changed.example';
  await assert.rejects(manager.handle({ type: 'close', id: 1, url: makeTab().url }));
  assert.equal(tabs.size, 1);
});
