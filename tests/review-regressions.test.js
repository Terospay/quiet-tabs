import test from 'node:test';
import assert from 'node:assert/strict';
import { TabManager } from '../engine.js';
import { DAY, HOUR } from '../core.js';
import { fakeChrome, makeTab } from './fake-chrome.js';

for (const initialUrl of ['', undefined, 'about:blank']) {
  test(`restoring before the first navigation commits preserves a full day of protection (${initialUrl})`, async () => {
    const env = fakeChrome(0, [makeTab(1, { active: true })]);
    let now = 3 * DAY;
    const manager = new TabManager(env.api, () => now);
    env.db.local.state.settings.hours = [1, 1, 1];
    env.db.local.state.archive = [{ id: 'saved', url: 'https://saved.example/page', title: 'Saved page',
      savedAt: 0, automatic: false, closed: true }];
    const create = env.api.tabs.create;
    env.api.tabs.create = async input => create({ ...input, url: initialUrl, pendingUrl: input.url, status: 'loading' });

    const result = await manager.handle({ type: 'restore', id: 'saved' });
    assert.equal(result.archive.length, 0);
    const restored = [...env.tabs.values()].find(tab => tab.id !== 1);
    await manager.check(); // A loading event can arrive before the URL commits.
    Object.assign(restored, { url: 'https://saved.example/page', pendingUrl: undefined, status: 'complete' });
    await manager.check();
    assert.equal(env.db.local.state.records[restored.id].snoozeUntil, 4 * DAY);

    now += 2 * HOUR;
    const later = await manager.check();
    assert.equal(later.tabs.find(tab => tab.id === restored.id).candidate, false);
    assert.equal(later.tabs.find(tab => tab.id === restored.id).protection, 'Snoozed');
  });
}

test('a restore that commits between create and query still keeps its protection', async () => {
  const env = fakeChrome(0);
  const manager = new TabManager(env.api, () => 3 * DAY);
  env.db.local.state.archive = [{ id: 'saved', url: 'https://saved.example/page', title: 'Saved page',
    savedAt: 0, automatic: false, closed: true }];
  const create = env.api.tabs.create;
  env.api.tabs.create = async input => {
    const tab = await create(input);
    return { ...tab, url: '', pendingUrl: input.url, status: 'loading' };
  };
  await manager.handle({ type: 'restore', id: 'saved' });
  const result = await manager.check();
  assert.equal(result.tabs.find(tab => tab.id === 1000).snoozeUntil, 4 * DAY);
});

test('an ordinary new tab without a committed URL cannot break snapshots', async () => {
  const env = fakeChrome(0, [makeTab(1, { active: true }), makeTab(2, { url: undefined, status: 'loading' })]);
  const manager = new TabManager(env.api, () => 3 * DAY);
  const result = await manager.handle({ type: 'snapshot' });
  assert.deepEqual(result.tabs.map(tab => tab.id), [1]);
  assert.equal(env.db.local.state.records[2], undefined);
});

test('a restored link keeps protection through its first redirect but not a later navigation', async () => {
  const env = fakeChrome(0, [makeTab(1, { active: true })]);
  const manager = new TabManager(env.api, () => 3 * DAY);
  env.db.local.state.archive = [{ id: 'saved', url: 'https://saved.example/page', title: 'Saved page',
    savedAt: 0, automatic: false, closed: true }];
  const create = env.api.tabs.create;
  env.api.tabs.create = async input => create({ ...input, url: '', pendingUrl: input.url, status: 'loading' });
  await manager.handle({ type: 'restore', id: 'saved' });
  // The worker may suspend before Chrome finishes the initial navigation.
  const resumed = new TabManager(env.api, () => 3 * DAY + 1000);
  await resumed.check();
  Object.assign(env.tabs.get(1000), { url: 'https://saved.example/redirected', pendingUrl: undefined, status: 'complete' });
  await resumed.check();
  assert.equal(env.db.local.state.records[1000].snoozeUntil, 4 * DAY);
  env.tabs.get(1000).url = 'https://different.example/';
  await resumed.check();
  assert.equal(env.db.local.state.records[1000].snoozeUntil, 0);
});

test('saving settings immediately starts a visit under the new threshold', async () => {
  const env = fakeChrome(0, [makeTab(1, { active: true })]);
  let now = 3 * DAY;
  const manager = new TabManager(env.api, () => now);
  await manager.check();
  now += 500;
  await manager.handle({ type: 'settings', settings: { ...env.db.local.state.settings, minVisitSeconds: 20 } });
  now += 20_000;
  await manager.check();
  const record = env.db.local.state.records[1];
  assert.equal(record.activeMs, 20_000);
  assert.equal(record.meaningfulVisits, 1);
  assert.equal(record.lastMeaningfulAt, now);
});

test('a failed save cannot discard a pending visit boundary', async () => {
  const env = fakeChrome(0, [makeTab(1, { active: true }), makeTab(2)]);
  let now = 3 * DAY;
  const manager = new TabManager(env.api, () => now);
  await manager.check();
  now += 500;
  await env.api.tabs.update(2, { active: true });
  manager.noteFocusBreak(now);
  env.hooks.beforeSave = async () => { throw new Error('temporary storage failure'); };
  await assert.rejects(manager.check(), /temporary storage failure/);
  delete env.hooks.beforeSave;
  now += 20_000;
  const result = await manager.check();
  const brieflyViewed = result.tabs.find(tab => tab.id === 1);
  assert.equal(brieflyViewed.visibleMs, 500);
  assert.equal(brieflyViewed.activeMs, 0);
});

function event() {
  const listeners = [];
  return { addListener: listener => listeners.push(listener), emit: (...args) => listeners.map(listener => listener(...args)) };
}

test('a switch during an in-flight snapshot cannot qualify the tab that was briefly viewed', async context => {
  const env = fakeChrome(0, [makeTab(1, { active: true }), makeTab(2)]);
  let now = 3 * DAY;
  context.mock.method(Date, 'now', () => now);
  const api = env.api;
  for (const name of ['onActivated', 'onCreated', 'onRemoved', 'onReplaced', 'onAttached', 'onUpdated']) api.tabs[name] = event();
  api.windows.onFocusChanged = event();
  api.idle.onStateChanged = event();
  api.idle.setDetectionInterval = () => {};
  api.sidePanel = { setPanelBehavior: async () => {} };
  api.alarms = { onAlarm: event(), get: async () => ({}), create: async () => {} };
  api.runtime = { id: 'test-extension', getURL: path => 'chrome-extension://test-extension/' + path,
    onMessage: event(), onStartup: event(), onInstalled: event() };
  const previous = globalThis.chrome;
  globalThis.chrome = api;
  context.after(() => {
    if (previous === undefined) delete globalThis.chrome;
    else globalThis.chrome = previous;
  });
  const sender = { id: api.runtime.id, url: api.runtime.getURL('panel.html') };
  const request = message => new Promise(resolve => api.runtime.onMessage.emit(message, sender, resolve));
  await import('../background.js?in-flight-focus-review');
  await request({ type: 'snapshot' });

  let release;
  let entered;
  const blocked = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  const get = api.storage.local.get;
  api.storage.local.get = async key => {
    const value = await get(key);
    entered();
    await blocked;
    return value;
  };
  const inFlight = request({ type: 'snapshot' });
  await started;
  now += 500;
  await api.tabs.update(2, { active: true });
  api.tabs.onActivated.emit({ tabId: 2, windowId: 1 });
  now += 20_000;
  release();
  await inFlight;
  const result = await request({ type: 'snapshot' });
  assert.equal(result.ok, true);
  const brieflyViewed = result.data.tabs.find(tab => tab.id === 1);
  assert.equal(brieflyViewed.visibleMs, 500);
  assert.equal(brieflyViewed.activeMs, 0);
  assert.equal(brieflyViewed.meaningfulVisits, 0);
  assert.equal(brieflyViewed.lastMeaningfulAt, null);

  now += 20_000;
  const continued = await request({ type: 'snapshot' });
  assert.equal(continued.data.tabs.find(tab => tab.id === 2).activeMs, 20_000);
  assert.equal(continued.data.tabs.find(tab => tab.id === 1).activeMs, 0);
});
