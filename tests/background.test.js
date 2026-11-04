import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeChrome, makeTab } from './fake-chrome.js';
import { DAY } from '../core.js';

function event() {
  const listeners = [];
  return { addListener: listener => listeners.push(listener), emit: (...args) => listeners.map(listener => listener(...args)) };
}

test('worker closes recommended tabs only on request, serializes requests and rejects external senders', async context => {
  const env = fakeChrome(0, [makeTab(1, { active: true }), makeTab(2), makeTab(3)]);
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
  globalThis.chrome = api;
  context.after(() => { delete globalThis.chrome; });
  const sender = { id: api.runtime.id, url: api.runtime.getURL('panel.html') };
  const request = message => new Promise(resolve => api.runtime.onMessage.emit(message, sender, resolve));
  await import('../background.js?worker-integration');
  let reply = await request({ type: 'snapshot' });
  assert.equal(reply.ok, true);
  assert.equal(reply.data.settings.mode, 'suggest');
  const proposal = reply.data.trial.entries.find(entry => entry.tabId === 3);
  api.alarms.onAlarm.emit({ name: 'quiet-tabs-tick' });
  await request({ type: 'snapshot' });
  assert.equal(env.tabs.size, 3);
  assert.equal(env.calls.some(call => call.type === 'remove'), false);
  const [agree, repeated] = await Promise.all([
    request({ type: 'feedback', id: proposal.id, decision: 'agree' }),
    request({ type: 'feedback', id: proposal.id, decision: 'agree' }),
  ]);
  assert.equal(agree.ok, true);
  assert.equal(repeated.ok, false);
  assert.match(repeated.error, /no longer matches/);
  reply = await request({ type: 'snapshot' });
  assert.equal(reply.data.trial.entries.find(entry => entry.id === proposal.id).decision, 'agree');
  assert.equal(env.tabs.size, 2);
  assert.equal(env.calls.filter(call => call.type === 'remove').length, 1);
  assert.equal(reply.data.archive.length, 1);

  // A rapid switch event must end continuity even if both queries see tab 1 again.
  now += 500;
  api.tabs.onActivated.emit({ tabId: 2, windowId: 1 });
  await request({ type: 'snapshot' });
  now += 500;
  api.tabs.onActivated.emit({ tabId: 1, windowId: 1 });
  reply = await request({ type: 'snapshot' });
  assert.equal(reply.data.tabs.find(tab => tab.id === 1).activeMs, 0);

  const close = await request({ type: 'close', id: 1, url: makeTab(1).url });
  assert.equal(close.ok, false);
  assert.match(close.error, /protected/);
  // A rejected job must not poison subsequent queued events.
  assert.equal((await request({ type: 'snapshot' })).ok, true);
  let responded = false;
  const accepted = api.runtime.onMessage.emit({ type: 'settings', settings: {} },
    { id: api.runtime.id, url: 'https://example.com' }, () => { responded = true; });
  assert.deepEqual(accepted, [false]);
  assert.equal(responded, false);
});
