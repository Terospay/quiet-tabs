import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import { parseHTML } from 'linkedom';
import { TabManager } from '../engine.js';
import { fakeChrome, makeTab } from './fake-chrome.js';
import { DAY } from '../core.js';

test('panel presents trial feedback without close controls and persists user ratings', async context => {
  const html = await readFile(new URL('../panel.html', import.meta.url), 'utf8');
  const { window } = parseHTML(html);
  const env = fakeChrome(0, [makeTab(1, { title: '<img src=x onerror=alert(1)> Test page' }), makeTab(2)]);
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
  assert.equal(doc.querySelector('#mode-label').textContent, 'Observing · no tabs will close');
  assert.equal(doc.querySelector('#candidate-count').textContent, '2');
  assert.equal(doc.querySelectorAll('#list .close').length, 0);
  assert.equal(doc.querySelectorAll('#list img').length, 0);
  assert.match(doc.querySelector('#list').textContent, /<img src=x/);
  const clickText = (selector, text) => {
    const control = [...doc.querySelectorAll(selector)].find(element => element.textContent === text);
    assert.ok(control, 'Missing control: ' + text);
    control.click();
  };
  clickText('#list button', 'Agree');
  await flush();
  assert.equal(env.tabs.size, 2);
  assert.equal(env.db.local.state.trial.entries.filter(entry => entry.decision === 'agree').length, 1);
  assert.match(doc.querySelector('#toast').textContent, /stays open/);
  assert.equal(requests.some(message => message.type === 'close'), false);
  clickText('#list button', 'Needed');
  await flush();
  assert.equal(env.tabs.size, 2);
  assert.equal(doc.querySelector('#candidate-count').textContent, '1');
  doc.querySelector('[data-view=trial]').click();
  assert.match(doc.querySelector('#list').textContent, /You marked this tab as needed/);
  assert.equal(doc.querySelectorAll('#list .close').length, 0);
  const search = doc.querySelector('#search');
  search.value = 'does-not-exist';
  search.dispatchEvent(new window.Event('input'));
  assert.equal(doc.querySelectorAll('#list .card').length, 0);
  assert.equal(doc.querySelector('#empty-title').textContent, 'No results');
  doc.querySelector('#settings-toggle').click();
  assert.equal(doc.querySelector('#settings').hidden, false);
  assert.equal(doc.querySelector('#min-visit').value, '15');
  doc.querySelector('#min-visit').value = '27';
  doc.querySelector('#language-toggle').click();
  await flush();
  assert.equal(doc.documentElement.lang, 'ru');
  assert.equal(env.db.local.state.settings.language, 'ru');
  assert.equal(env.db.local.state.settings.mode, 'trial');
  assert.equal(doc.querySelector('#min-visit').value, '27');
  assert.equal(doc.querySelector('#mode-label').textContent, 'Наблюдаем · ничего не закрываем');
  assert.equal(doc.querySelector('#empty-title').textContent, 'Ничего не нашлось');
  assert.equal(doc.querySelector('#settings-toggle').getAttribute('aria-label'), 'Настройки');
  doc.querySelector('#language-toggle').click();
  await flush();
  assert.equal(doc.documentElement.lang, 'en');
  assert.equal(doc.querySelector('#empty-title').textContent, 'No results');
  assert.equal(env.tabs.size, 2);
});
