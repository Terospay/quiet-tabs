import { TabManager } from '../engine.js';
import { fakeChrome, makeTab } from './fake-chrome.js';
import { DAY, MINUTE } from '../core.js';

const now = Date.now();
const samples = [
  ['https://www.youtube.com/watch?v=demo', 'A practical guide to focused work', 5, 25_000],
  ['https://developer.chrome.com/docs/extensions', 'Chrome Extensions documentation', 4, 4 * MINUTE],
  ['https://example.com/desk-lamps', 'Desk lamps for a home office', 3, 40_000],
  ['https://docs.google.com/document/demo', 'Weekly plan', 0, 25 * MINUTE],
  ['https://github.com/example/project', 'Project workspace', 1, 18 * MINUTE],
  ['https://example.org/focus-playlist', 'Focus playlist', 8, 0],
  ['https://notion.so/demo', 'Notes and ideas', 1, 3 * MINUTE],
];
const tabs = samples.map(([url, title], i) => makeTab(i + 1, {
  url, title, active: i === 3, pinned: i === 4, audible: i === 5,
}));
const fake = fakeChrome(now - 10 * DAY, tabs);
samples.forEach(([, , days, activeMs], i) => {
  const record = fake.db.local.state.records[i + 1];
  record.lastMeaningfulAt = now - days * DAY;
  record.activeMs = activeMs;
  record.visibleMs = activeMs + 10_000;
});
const manager = new TabManager(fake.api, Date.now);
globalThis.chrome = { runtime: { sendMessage: async message => {
  try { return { ok: true, data: await manager.handle(message) }; }
  catch (error) { return { ok: false, error: error.message }; }
} } };
document.body.dataset.demo = 'true';
await import('../panel.js');
