import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import { parseHTML } from 'linkedom';
import { TabManager } from '../engine.js';
import { fakeChrome, makeTab } from './fake-chrome.js';
import { DAY } from '../core.js';

test('panel offers two modes, closes and restores recommendations and keeps journal actions in sync', async context => {
  const html = await readFile(new URL('../panel.html', import.meta.url), 'utf8');
  const { window } = parseHTML(html);
  const env = fakeChrome(0, [makeTab(1, { title: '<img src=x onerror=alert(1)> Test page' }), makeTab(2), makeTab(3)]);
  env.db.local.state.settings.mode = 'trial'; // Existing installations migrate before rendering.
  const manager = new TabManager(env.api, () => 3 * DAY);
  const globals = ['document', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLDialogElement', 'window', 'chrome'];
  const previous = new Map(globals.map(key => [key, globalThis[key]]));
  globalThis.document = window.document;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.HTMLInputElement = window.HTMLInputElement;
  globalThis.HTMLTextAreaElement = window.HTMLTextAreaElement;
  globalThis.HTMLDialogElement = window.HTMLElement;
  globalThis.window = window;
  window.scrollTo = () => {};
  const requests = [];
  globalThis.chrome = { runtime: { sendMessage: async message => {
    requests.push(message);
    try { return { ok: true, data: await manager.handle(message) }; }
    catch (error) { return { ok: false, error: error.message }; }
  } } };
  context.mock.method(globalThis, 'setInterval', () => 0);
  context.mock.method(globalThis, 'setTimeout', () => 0);
  context.after(() => {
    for (const key of globals) {
      if (previous.get(key) === undefined) delete globalThis[key];
      else globalThis[key] = previous.get(key);
    }
  });
  const flush = async () => { await setImmediate(); await setImmediate(); };
  await import('../panel.js?ui-integration');
  await flush();
  const doc = window.document;
  assert.equal(doc.querySelector('#mode-label').textContent, 'Recommendations · you choose what to close');
  assert.deepEqual([...doc.querySelectorAll('input[name=mode]')].map(control => control.value), ['suggest', 'auto']);
  assert.doesNotMatch(doc.body.textContent, /Trial|Пробный/);
  assert.equal(doc.querySelector('#candidate-count').textContent, '3');
  assert.equal(doc.querySelectorAll('#list .close').length, 0);
  assert.equal(doc.querySelectorAll('#list img').length, 0);
  assert.match(doc.querySelector('#list').textContent, /<img src=x/);
  const clickText = (selector, text) => {
    const control = [...doc.querySelectorAll(selector)].find(element => element.textContent === text);
    assert.ok(control, 'Missing control: ' + text);
    control.click();
  };
  env.hooks.beforeSave = async (_area, values) => {
    if (values.state?.archive.length) throw new Error('disk full');
  };
  clickText('#list button', 'Agree & close');
  await flush();
  assert.equal(env.tabs.size, 3);
  assert.equal(env.db.local.state.trial.entries.filter(entry => entry.decision === 'agree').length, 0);
  assert.equal(doc.querySelector('#toast').textContent, 'disk full');
  assert.equal(doc.querySelector('#toast').dataset.error, 'true');
  delete env.hooks.beforeSave;
  clickText('#list button', 'Agree & close');
  await flush();
  assert.equal(env.tabs.size, 2);
  assert.equal(env.db.local.state.archive[0].closed, true);
  assert.equal(env.db.local.state.trial.entries.filter(entry => entry.decision === 'agree').length, 1);
  assert.match(doc.querySelector('#toast').textContent, /Tab closed/);
  assert.equal(doc.querySelector('#candidate-count').textContent, '2');
  assert.equal(requests.some(message => message.type === 'close'), false);
  clickText('#list button', 'Needed');
  await flush();
  assert.equal(env.tabs.size, 2);
  assert.equal(doc.querySelector('#candidate-count').textContent, '1');
  doc.querySelector('[data-view=trial]').click();
  assert.match(doc.querySelector('#list').textContent, /You marked this tab as needed/);
  assert.equal(doc.querySelectorAll('#list .close').length, 0);
  assert.equal(doc.querySelectorAll('#list .agree').length, 1, 'Only the current unprotected suggestion can close');
  clickText('#list button', 'Agree & close');
  await flush();
  assert.equal(env.tabs.size, 1);
  assert.equal(doc.querySelector('#candidate-count').textContent, '0');
  assert.equal(doc.querySelectorAll('#list .agree').length, 0, 'Closed and protected journal entries cannot be closed');
  doc.querySelector('[data-view=archive]').click();
  clickText('#list button', '↗ Restore');
  await flush();
  assert.equal(env.tabs.size, 2);
  clickText('#list button', '↗ Restore');
  await flush();
  assert.equal(env.tabs.size, 3);
  assert.equal(env.db.local.state.archive.length, 0);
  assert.match(doc.querySelector('#empty-text').textContent, /Links saved before closing/);
  doc.querySelector('[data-view=trial]').click();
  assert.equal(doc.querySelectorAll('#list .agree').length, 0, 'Restoring a link does not reactivate an old suggestion');
  const search = doc.querySelector('#search');
  search.value = 'does-not-exist';
  search.dispatchEvent(new window.Event('input'));
  assert.equal(doc.querySelectorAll('#list .card').length, 0);
  assert.equal(doc.querySelector('#empty-title').textContent, 'No results');
  doc.querySelector('#settings-toggle').click();
  assert.equal(doc.querySelector('#settings').hidden, false);
  assert.equal(doc.querySelector('input[name=mode][value=suggest]').checked, true);
  assert.equal(doc.querySelector('#auto-consent').hidden, true);
  assert.equal(doc.querySelector('#min-visit').value, '15');
  assert.deepEqual([0, 1, 2].map(index => doc.querySelector('#hours-' + index).value), ['24', '48', '120']);
  doc.querySelector('#min-visit').value = '27';
  doc.querySelector('#language-toggle').click();
  await flush();
  assert.equal(doc.documentElement.lang, 'ru');
  assert.equal(env.db.local.state.settings.language, 'ru');
  assert.equal(env.db.local.state.settings.mode, 'suggest');
  assert.equal(doc.querySelector('#min-visit').value, '27');
  assert.equal(doc.querySelector('#mode-label').textContent, 'Рекомендации · закрытие по вашему решению');
  assert.deepEqual([...doc.querySelectorAll('.mode-option strong')].map(element => element.textContent), ['Рекомендации', 'Закрывать автоматически']);
  assert.equal(doc.querySelector('#empty-title').textContent, 'Ничего не найдено');
  assert.equal(doc.querySelector('#settings-toggle').getAttribute('aria-label'), 'Настройки');
  doc.querySelector('#language-toggle').click();
  await flush();
  assert.equal(doc.documentElement.lang, 'en');
  assert.equal(doc.querySelector('#empty-title').textContent, 'No results');
  assert.equal(env.tabs.size, 3);
  const selectMode = mode => {
    for (const control of doc.querySelectorAll('input[name=mode]')) {
      control.checked = control.value === mode;
      // LinkeDOM uses the attribute for :checked instead of the native radio state.
      control.toggleAttribute('checked', control.checked);
    }
    doc.querySelector('input[name=mode]:checked').dispatchEvent(new window.Event('change'));
  };
  const saveSettings = async () => {
    doc.querySelector('#settings-form').dispatchEvent(new window.Event('submit', { cancelable: true }));
    await flush();
  };
  selectMode('auto');
  assert.equal(doc.querySelector('#auto-consent').hidden, false);
  await saveSettings();
  assert.equal(env.db.local.state.settings.mode, 'suggest');
  assert.equal(doc.querySelector('#toast').dataset.error, 'true');
  doc.querySelector('#acknowledged').checked = true;
  await saveSettings();
  assert.equal(env.db.local.state.settings.mode, 'auto');
  assert.equal(doc.querySelector('#mode-label').textContent, 'Automatic cleanup');
  assert.equal(doc.querySelector('#trial-summary').hidden, true);
  selectMode('suggest');
  assert.equal(doc.querySelector('#auto-consent').hidden, true);
  await saveSettings();
  assert.equal(env.db.local.state.settings.mode, 'suggest');
  assert.equal(doc.querySelector('#trial-summary').hidden, false);
});
