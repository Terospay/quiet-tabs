import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import { parseHTML } from 'linkedom';
import { TabManager } from '../engine.js';
import { fakeChrome, makeTab } from './fake-chrome.js';
import { DAY } from '../core.js';

let importId = 0;
const flush = async () => { await setImmediate(); await setImmediate(); };

async function mountPanel(context, mode = 'suggest', initialTabs = [makeTab(1), makeTab(2), makeTab(3, { active: true })]) {
  const { window } = parseHTML(await readFile(new URL('../panel.html', import.meta.url), 'utf8'));
  const env = fakeChrome(0, initialTabs);
  env.db.local.state.settings.mode = mode;
  let now = 3 * DAY;
  const manager = new TabManager(env.api, () => now);
  const globals = { document: window.document, HTMLElement: window.HTMLElement, window,
    chrome: { runtime: { sendMessage: async message => {
      try { return { ok: true, data: await manager.handle(message) }; }
      catch (error) { return { ok: false, error: error.message }; }
    } } } };
  const previous = new Map(Object.keys(globals).map(key => [key, globalThis[key]]));
  Object.assign(globalThis, globals);
  window.scrollTo = () => {};
  let tick;
  context.mock.method(globalThis, 'setInterval', callback => { tick = callback; return 0; });
  context.mock.method(globalThis, 'setTimeout', () => 0);
  context.after(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  });
  await import('../panel.js?focus-regression=' + ++importId);
  await flush();
  const doc = window.document;
  return { ...env, doc, window, manager, setTime: value => { now = value; },
    refresh: async () => { tick(); await flush(); },
    cards: () => [...doc.querySelectorAll('#list .card')],
    titles: () => [...doc.querySelectorAll('#list .tab-title')].map(element => element.textContent),
  };
}

for (const mode of ['suggest', 'auto']) {
  for (const view of ['candidates', 'all']) {
    test(`${mode}/${view}: opening a tab cannot replace its card with another tab's close button`, async context => {
      const env = await mountPanel(context, mode);
      env.doc.querySelector(`[data-view=${view}]`).click();
      const originalTitles = env.titles();
      env.cards()[0].querySelector('.tab-title').click();
      await flush();
      assert.equal(env.tabs.get(1).active, true);
      assert.deepEqual(env.titles(), originalTitles, 'Opening a page must preserve the displayed card order');
      const closeSelector = mode === 'suggest' ? '.agree' : '.close';
      const close = env.cards()[0].querySelector(closeSelector);
      assert.ok(close, 'Keep the close control in place so a different action cannot replace it');
      assert.equal(close.disabled, true, 'The selected tab remains protected');
      close.click();
      await flush();
      assert.deepEqual([...env.tabs.keys()], [1, 2, 3]);
      assert.match(env.cards()[0].textContent, /Currently selected/);
      assert.equal(env.doc.querySelector('#candidate-count').textContent, '2');
      await env.refresh();
      assert.deepEqual(env.titles(), originalTitles, 'Polling must not discard the reviewed card');
      assert.equal(env.cards()[0].querySelector(closeSelector).disabled, true);

      // A brief inspection does not renew attention. Once the user switches away,
      // only this same current suggestion can be explicitly closed.
      await env.api.tabs.update(3, { active: true });
      await env.refresh();
      assert.equal(env.cards()[0].querySelector(closeSelector).disabled, false);
      env.cards()[0].querySelector(closeSelector).click();
      await flush();
      assert.deepEqual([...env.tabs.keys()], [2, 3]);
      assert.deepEqual(env.calls.filter(call => call.type === 'remove').map(call => call.id), [1]);
      assert.equal(env.db.local.state.archive[0].url, makeTab(1).url);
      assert.equal(env.db.local.state.archive[0].closed, true);
    });
  }
}

test('inspection survives qualified attention and language changes until the user changes the list', async context => {
  const env = await mountPanel(context);
  env.doc.querySelector('[data-view=all]').click();
  env.cards()[0].querySelector('.tab-title').click();
  await flush();
  await env.refresh(); // Begin observing the newly selected page.
  env.setTime(3 * DAY + 20_000);
  await env.refresh();
  assert.deepEqual(env.titles(), ['Page 1', 'Page 2', 'Page 3'], 'Qualified time must not move the inspected card');
  assert.equal(env.cards()[0].querySelector('.agree').disabled, true);
  env.doc.querySelector('#language-toggle').click();
  await flush();
  assert.match(env.cards()[0].textContent, /Сейчас открыта перед вами/);
  assert.equal(env.cards()[0].querySelector('.agree').disabled, true, 'Finishing another action must not enable an unavailable close');
  await env.api.tabs.update(3, { active: true });
  await env.refresh();
  assert.equal(env.cards()[0].querySelector('.agree').disabled, true, 'A qualified visit invalidates the original suggestion');
  assert.deepEqual(env.titles(), ['Page 1', 'Page 2', 'Page 3']);
  env.doc.querySelector('#sort-toggle').click();
  await flush();
  assert.deepEqual(env.titles(), ['Page 1', 'Page 2', 'Page 3']);
  env.doc.querySelector('#sort-toggle').click();
  await flush();
  assert.deepEqual(env.titles(), ['Page 2', 'Page 3', 'Page 1'], 'Explicit sorting uses current attention');

  env.doc.querySelector('[data-view=candidates]').click();
  env.cards()[0].querySelector('.tab-title').click();
  await flush();
  assert.deepEqual(env.titles(), ['Page 2']);
  const search = env.doc.querySelector('#search');
  search.value = 'Page 2';
  search.dispatchEvent(new env.window.Event('input'));
  assert.deepEqual(env.titles(), [], 'Explicit search refreshes candidate membership');
  assert.deepEqual([...env.tabs.keys()], [1, 2, 3]);
});

for (const change of ['navigate', 'close', 'replace']) {
  test(`a reviewed page that changes (${change}) cannot transfer its actions to a different tab`, async context => {
    // Duplicate addresses must not be used to choose the target of an action.
    const env = await mountPanel(context, 'suggest', [makeTab(1), makeTab(2, { url: makeTab(1).url }), makeTab(3, { active: true })]);
    env.cards()[0].querySelector('.tab-title').click();
    await flush();
    if (change === 'navigate') env.tabs.get(1).url = 'https://example.com/new-page';
    else env.tabs.delete(1);
    await env.refresh();
    if (change === 'replace') {
      env.tabs.set(1, makeTab(1));
      await env.refresh();
    }
    assert.deepEqual(env.titles(), ['Page 1', 'Page 2']);
    assert.match(env.cards()[0].textContent, /no longer open/);
    assert.ok([...env.cards()[0].querySelectorAll('button')].every(button => button.disabled));
    for (const button of env.cards()[0].querySelectorAll('button')) button.click();
    await flush();
    assert.equal(env.calls.some(call => call.type === 'remove'), false);
    env.doc.querySelector('[data-view=candidates]').click();
    assert.deepEqual(env.titles(), ['Page 2', 'Page 3'], 'Reopening the list removes the obsolete card');
  });
}

test('controls rendered during a pending focus stay disabled until the operation finishes', async context => {
  const env = await mountPanel(context);
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const update = env.api.tabs.update;
  env.api.tabs.update = async (...args) => { await pending; return update(...args); };
  env.cards()[0].querySelector('.tab-title').click();
  env.doc.querySelector('[data-view=all]').click();
  assert.ok([...env.doc.querySelectorAll('#list button')].every(button => button.disabled));
  env.cards()[1].querySelector('.agree').click();
  release();
  await flush();
  assert.deepEqual([...env.tabs.keys()], [1, 2, 3]);
  assert.equal(env.calls.some(call => call.type === 'remove'), false);
  assert.equal(env.cards()[0].querySelector('.agree').disabled, false);
});

test('opening a journal entry cannot insert a different suggestion over its controls', async context => {
  const env = await mountPanel(context);
  env.doc.querySelector('[data-view=trial]').click();
  const titles = env.titles();
  assert.deepEqual(titles, ['Page 2', 'Page 1']);
  env.cards()[0].querySelector('.tab-title').click();
  await flush();
  assert.equal(env.tabs.get(2).active, true);
  assert.deepEqual(env.titles(), titles, 'A newly eligible tab must not displace the inspected journal entry');
  assert.equal(env.db.local.state.trial.entries.length, 3, 'New suggestions are still recorded');
  assert.equal(env.cards()[0].querySelector('.agree').disabled, true);
  assert.match(env.cards()[0].textContent, /Currently selected/);
  await env.refresh();
  assert.deepEqual(env.titles(), titles);
  await env.api.tabs.update(3, { active: true });
  await env.refresh();
  assert.equal(env.cards()[0].querySelector('.agree').disabled, false);
  env.cards()[0].querySelector('.agree').click();
  await flush();
  assert.deepEqual(env.calls.filter(call => call.type === 'remove').map(call => call.id), [2]);
  assert.deepEqual(env.titles(), titles);
  assert.equal(env.cards()[0].querySelector('.agree').disabled, true, 'Another feedback choice must not replace the close button');
  env.doc.querySelector('[data-view=trial]').click();
  assert.deepEqual(env.titles(), ['Page 3', 'Page 2', 'Page 1']);
});

for (const mode of ['suggest', 'auto']) {
  test(`${mode}: closing directly leaves an inactive card instead of another close target`, async context => {
    const env = await mountPanel(context, mode);
    const selector = mode === 'suggest' ? '.agree' : '.close';
    env.cards()[0].querySelector(selector).click();
    await flush();
    assert.deepEqual(env.titles(), ['Page 1', 'Page 2']);
    assert.ok([...env.cards()[0].querySelectorAll('button')].every(button => button.disabled));
    env.cards()[0].querySelector(selector).click();
    await flush();
    await env.refresh();
    assert.deepEqual(env.titles(), ['Page 1', 'Page 2']);
    assert.deepEqual(env.calls.filter(call => call.type === 'remove').map(call => call.id), [1]);
    assert.equal(env.cards()[1].querySelector(selector).disabled, false, 'The user may still explicitly choose another card');
    env.doc.querySelector('[data-view=candidates]').click();
    assert.deepEqual(env.titles(), ['Page 2']);
  });
}
