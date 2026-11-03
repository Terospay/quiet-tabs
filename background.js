// @ts-check
import { TabManager } from './engine.js';

const manager = new TabManager(chrome);
// Chrome can deliver events while asynchronous storage writes are in flight.
// Serialize read/modify/write operations to avoid losing activity or saved links.
/** @type {Promise<unknown>} */
let queue = Promise.resolve();
/** @template T @param {()=>Promise<T>} work @returns {Promise<T>} */
function enqueue(work) {
  const result = queue.then(work);
  queue = result.catch(async () => {
    await Promise.allSettled([
      chrome.action.setBadgeText({ text: '!' }),
      chrome.action.setTitle({ title: 'Quiet Tabs — open the panel: the last action failed' }),
    ]);
  });
  return result;
}
function refresh() { void enqueue(() => manager.check()).catch(() => {}); }
function breakFocus() {
  const occurredAt = Date.now();
  void enqueue(() => manager.check(false, occurredAt)).catch(() => {});
}

chrome.tabs.onActivated.addListener(breakFocus);
chrome.tabs.onCreated.addListener(refresh);
chrome.tabs.onRemoved.addListener(refresh);
chrome.tabs.onReplaced.addListener(refresh);
chrome.tabs.onAttached.addListener(refresh);
chrome.tabs.onUpdated.addListener((_id, change) => {
  if (['url', 'status', 'pinned', 'audible', 'autoDiscardable', 'title'].some(key => key in change)) refresh();
});
chrome.windows.onFocusChanged.addListener(breakFocus);
chrome.idle.onStateChanged.addListener(breakFocus);
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'quiet-tabs-tick') void enqueue(() => manager.check(true)).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('panel.html')) return false;
  enqueue(() => manager.handle(message))
    .then(data => respond({ ok: true, data }))
    .catch(error => respond({ ok: false, error: error.message || 'The action could not be completed.' }));
  return true;
});

async function setup() {
  chrome.idle.setDetectionInterval(60);
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  if (!await chrome.alarms.get('quiet-tabs-tick')) {
    await chrome.alarms.create('quiet-tabs-tick', { periodInMinutes: 1 });
  }
  await manager.check();
}
chrome.runtime.onInstalled.addListener(() => void enqueue(setup).catch(() => {}));
chrome.runtime.onStartup.addListener(() => void enqueue(setup).catch(() => {}));
// Also restore missing alarms when a dormant worker wakes up.
void enqueue(setup).catch(() => {});
