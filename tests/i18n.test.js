import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { createState, loadState } from '../core.js';
import { TabManager } from '../engine.js';
import { bindDocumentTranslations, translate } from '../i18n.js';
import { fakeChrome, makeTab } from './fake-chrome.js';

test('language persists across worker recreation without resetting attention or enabling closing', async () => {
  let now = 0;
  const env = fakeChrome(now, [makeTab(1, { active: true })]);
  let manager = new TabManager(env.api, () => now);
  await manager.handle({ type: 'snapshot' });
  const before = structuredClone(env.db.local.state.settings);
  now = 10_000;
  await manager.handle({ type: 'language', language: 'ru' });
  assert.deepEqual(env.db.local.state.settings, { ...before, language: 'ru' });
  assert.equal(env.db.local.state.focus.observedMs, 10_000);
  manager = new TabManager(env.api, () => now);
  now = 20_000;
  const snapshot = await manager.handle({ type: 'snapshot' });
  assert.equal(snapshot.settings.language, 'ru');
  assert.equal(snapshot.settings.mode, 'trial');
  assert.equal(snapshot.tabs[0].activeMs, 20_000);
  assert.equal(snapshot.tabs[0].meaningfulVisits, 1);
  assert.equal(env.tabs.size, 1);
  await assert.rejects(manager.handle({ type: 'language', language: 'de' }), /English or Russian/);
  assert.equal(env.db.local.state.settings.language, 'ru');
  await manager.handle({ type: 'settings', settings: { ...snapshot.settings, language: 'en' } });
  assert.equal(env.db.local.state.settings.language, 'ru', 'Settings from another panel must not overwrite the language');
});

test('existing state without a language defaults to English and keeps trial history', () => {
  const state = createState(0);
  delete state.settings.language;
  state.trial.trimmed = 3;
  assert.equal(loadState(state, 100).settings.language, 'en');
  assert.equal(state.trial.trimmed, 3);
});

test('Russian covers static UI, preserves controls and switches back without touching user data', async () => {
  const { document } = parseHTML(await readFile(new URL('../panel.html', import.meta.url), 'utf8'));
  const update = bindDocumentTranslations(document);
  const count = document.querySelector('#nav-count');
  const threshold = document.querySelector('#min-visit');
  threshold.value = '27';
  const userTitle = document.createElement('div');
  userTitle.textContent = 'Settings';
  document.querySelector('#list').append(userTitle);
  update('ru');
  assert.equal(document.documentElement.lang, 'ru');
  assert.match(document.querySelector('h1').textContent, /Меньше вкладок/);
  assert.equal(document.querySelector('#settings-toggle').getAttribute('aria-label'), 'Настройки');
  assert.equal(document.querySelector('#search').placeholder, 'Найти вкладку или сайт');
  assert.equal(document.querySelector('#nav-count'), count, 'Keep the nested count element');
  assert.equal(threshold.value, '27', 'Preserve unsaved form input');
  assert.equal(userTitle.textContent, 'Settings', 'Never translate user-provided page titles');
  const walker = document.createTreeWalker(document.documentElement, 4);
  let node;
  while ((node = walker.nextNode())) {
    const value = node.textContent.trim();
    if (!/[A-Za-z]/.test(value) || node === userTitle.firstChild || /Quiet Tabs|quiet tabs|Chrome|https:\/\/|^EN$|^RU$/.test(value)) continue;
    assert.fail('Untranslated static UI text: ' + value);
  }
  update('en');
  assert.equal(document.documentElement.lang, 'en');
  assert.match(document.querySelector('h1').textContent, /Fewer tabs/);
  assert.equal(document.querySelector('#settings-toggle').getAttribute('aria-label'), 'Settings');
  assert.equal(threshold.value, '27');
});

test('formatting translates templates, errors and protection without altering unknown messages', () => {
  assert.equal(translate('ru', 'Trial mode: tab closing is disabled.'), 'Пробный режим: закрытие вкладок отключено.');
  assert.equal(translate('ru', 'Pinned in Chrome'), 'Закреплена в Chrome');
  assert.equal(translate('ru', 'No qualified visit for {age}', { age: '3 дн' }), 'Без долгого просмотра 3 дн');
  assert.equal(translate('en', 'No qualified visit for {age}', { age: '3 d' }), 'No qualified visit for 3 d');
  assert.equal(translate('ru', 'Browser diagnostic 123'), 'Browser diagnostic 123');
});
