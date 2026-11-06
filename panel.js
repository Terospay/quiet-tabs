// @ts-check
import { translate, bindDocumentTranslations } from './i18n.js';

/** @type {import('./models.js').Language} */
let language = 'en';
const translateStatic = bindDocumentTranslations(document);
/** @param {string} source @param {Record<string, string|number>} [values] */
const t = (source, values) => translate(language, source, values);
let toastSource = '';
/** @typedef {import('./models.js').Snapshot} Snapshot */
/** @typedef {import('./models.js').Message} Message */
/** @typedef {import('./models.js').TabView} TabView */
/** @typedef {import('./models.js').ArchiveEntry} ArchiveEntry */
/** @typedef {import('./models.js').TrialEntry} TrialEntry */

/** @param {string} selector @returns {HTMLElement} */
function $(selector) {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLElement)) throw new Error('Missing element: ' + selector);
  return element;
}
/** @param {string} selector @returns {HTMLInputElement} */
const input = selector => /** @type {HTMLInputElement} */ ($(selector));
/** @type {Snapshot|undefined} */
let data;
/** @type {'candidates'|'all'|'trial'|'archive'} */
let view = 'candidates';
/** @type {ReturnType<typeof setTimeout>|undefined} */
let toastTimer;
let busy = false;
let requestSequence = 0;
/** Hold the displayed identities while inspecting pages; snapshots still update their status. */
/** @type {TabView[]|undefined} */
let reviewTabs;
/** @type {TabView[]} */
let visibleTabs = [];
/** @type {Array<{entry: TrialEntry, canClose: boolean}>|undefined} */
let reviewEntries;
/** @type {TrialEntry[]} */
let visibleEntries = [];
let pendingDelete = '';
const dialog = /** @type {HTMLDialogElement} */ ($('#confirm-dialog'));

/** @param {number} ms */
function duration(ms) {
  if (ms < 1000) return '0 ' + t('s');
  if (ms < 60_000) return Math.floor(ms / 1000) + ' ' + t('s');
  if (ms < 3_600_000) return Math.floor(ms / 60_000) + ' ' + t('min');
  if (ms < 86_400_000) return Math.floor(ms / 3_600_000) + ' ' + t('h');
  return Math.floor(ms / 86_400_000) + ' ' + t('d');
}

/** Sort display copies only: never change the engine's closing order or journal history. */
/** @template {{activeMs?: number}} T @param {T[]} items @returns {T[]} */
function sortByAttention(items) {
  const direction = data?.settings.attentionSort === 'desc' ? -1 : 1;
  return [...items].sort((a, b) => {
    // Older archive entries have no measurement. Keep them last in either direction.
    if (a.activeMs === undefined) return b.activeMs === undefined ? 0 : 1;
    if (b.activeMs === undefined) return -1;
    return direction * (a.activeMs - b.activeMs);
  });
}

/** @param {string} text @param {boolean} error */
function toast(text, error = false) {
  toastSource = text;
  $('#toast').textContent = t(text);
  $('#toast').dataset.error = String(error);
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, error ? 12000 : 5000);
}

/** @param {Message} message */
async function request(message) {
  const sequence = ++requestSequence;
  /** @type {import('./models.js').Reply|undefined} */
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || 'Cannot reach the extension. Reload it at chrome://extensions.');
  if (sequence !== requestSequence) return;
  data = response.data;
  const preservesReview = ['snapshot', 'focus', 'language', 'close'].includes(message.type)
    || (message.type === 'feedback' && message.decision === 'agree');
  if (!preservesReview) resetReview();
  render();
}

function updateControls() {
  document.querySelectorAll('#list button, .save, #language-toggle, #sort-toggle').forEach(element => {
    /** @type {HTMLButtonElement} */ (element).disabled = busy || /** @type {HTMLElement} */ (element).dataset.unavailable === 'true';
  });
}

/** @param {Message} message @param {string|undefined} success */
async function action(message, success = undefined) {
  if (busy) return;
  if (message.type === 'focus' || message.type === 'close' || (message.type === 'feedback' && message.decision === 'agree')) startReview();
  busy = true;
  updateControls();
  try {
    await request(message);
    if (success) toast(success);
  } catch (error) { toast(error instanceof Error ? error.message : 'The action could not be completed.', true); }
  finally {
    busy = false;
    updateControls();
  }
}

/** @template {keyof HTMLElementTagNameMap} K @param {K} tag @param {string} className @param {string|undefined} text */
function node(tag, className, text = undefined) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
/** @param {string} label @param {string} className @param {()=>void} handler @param {boolean} [unavailable] */
function button(label, className, handler, unavailable = false) {
  const element = node('button', className, label);
  element.type = 'button';
  element.dataset.unavailable = String(unavailable);
  element.disabled = busy || unavailable;
  element.addEventListener('click', () => { if (!element.disabled) handler(); });
  return element;
}

function startReview() {
  if (view === 'candidates' || view === 'all') reviewTabs ??= visibleTabs;
  if (view === 'trial') reviewEntries ??= visibleEntries.map(entry => ({ entry,
    canClose: Boolean(data?.tabs.some(tab => tab.uid === entry.recordUid && tab.trialId === entry.id && tab.candidate)),
  }));
}

function resetReview() {
  reviewTabs = undefined;
  reviewEntries = undefined;
}

/** @param {{url: string, title: string}} tab @param {(()=>void)|undefined} focus */
function cardShell(tab, focus = undefined) {
  const card = node('article', 'card');
  const top = node('div', 'card-top');
  const host = new URL(tab.url).hostname;
  top.append(node('span', 'site-icon', host.replace(/^www\./, '').slice(0, 1).toUpperCase()));
  const content = node('div', 'card-content');
  content.append(focus ? button(tab.title || host, 'tab-title', focus) : node('div', 'tab-title', tab.title || host));
  content.append(node('div', 'domain', host));
  top.append(content);
  card.append(top);
  return card;
}

/** @param {HTMLElement} card @param {TrialEntry} entry @param {boolean} [preserveClose] */
function addFeedback(card, entry, preserveClose = false) {
  if (!data?.trial.entries.some(item => item.id === entry.id)) {
    card.append(node('p', 'reason', t('This suggestion is no longer in the journal.')));
    return;
  }
  const current = data?.tabs.find(tab => tab.uid === entry.recordUid && tab.trialId === entry.id && tab.candidate);
  const labels = { pending: '', agree: 'You agreed: this tab could be closed', keep: 'You marked this tab as needed', later: 'You postponed this decision' };
  if (entry.decision !== 'pending') card.append(node('p', 'decision', t(labels[entry.decision])));
  const actions = node('div', 'card-actions');
  /** @type {Array<[Exclude<import('./models.js').Feedback,'pending'>,string,string]>} */
  const choices = [
    ['agree', 'Agree & close', 'Tab closed. Its link was saved to the archive.'],
    ['keep', 'Needed', 'Feedback saved. The matching open tab is now protected.'],
    ['later', 'Tomorrow', 'Feedback saved. Snoozed for one day.'],
  ];
  for (const [decision, label, success] of choices) {
    if (decision === 'agree' && !current && !preserveClose) continue;
    const control = button(t(label), decision === 'agree' ? 'agree' : '', () => {
      void action({ type: 'feedback', id: entry.id, decision }, success);
    }, decision === 'agree' && !current);
    control.setAttribute('aria-pressed', String(entry.decision === decision));
    actions.append(control);
  }
  card.append(actions);
}

/** @param {TabView} tab @param {TabView} [previous] */
function makeTabCard(tab, previous = tab) {
  const preserveClose = reviewTabs !== undefined && previous.candidate;
  const card = cardShell(tab, () => { void action({ type: 'focus', id: tab.id, url: tab.url }); });
  card.append(node('p', 'meta', t('Total visible {visible} · qualified {qualified}', { visible: duration(tab.visibleMs), qualified: duration(tab.activeMs) })));
  card.append(node('p', 'reason', tab.protection === 'Currently selected' && preserveClose
    ? t('Currently selected. Switch to another tab before closing it here.')
    : tab.protection ? t(tab.protection) : (tab.candidate
    ? t('No qualified visit for {age}', { age: duration(tab.age) })
    : t('Retain for {retention} without a qualified visit', { retention: duration(tab.retention) }))));
  const trialEntry = data?.trial.entries.find(entry => entry.id === previous.trialId);
  if (data?.settings.mode === 'suggest' && (tab.candidate || preserveClose) && trialEntry) {
    addFeedback(card, trialEntry, preserveClose);
  } else {
    const actions = node('div', 'card-actions');
    actions.append(button(t(tab.keep ? 'Unprotect' : 'Keep'), '', () => {
      void action({ type: 'keep', id: tab.id, url: tab.url }, tab.keep ? 'Protection removed.' : 'This tab is now protected from suggestions.');
    }));
    if (tab.candidate || preserveClose) {
      actions.append(button(t('Tomorrow'), '', () => { void action({ type: 'snooze', id: tab.id, url: tab.url }, 'Snoozed for one day.'); }));
      actions.append(button(t('Close ↘'), 'close', () => { void action({ type: 'close', id: tab.id, url: tab.url }, 'Tab closed. Its link was saved to the archive.'); },
        !tab.candidate || (preserveClose && data?.settings.mode === 'suggest')));
    }
    card.append(actions);
  }
  return card;
}

/** Keep a closed or navigated page's place without transferring its actions to another page. */
/** @param {TabView} previous */
function makeReviewCard(previous) {
  const current = data?.tabs.find(tab => tab.uid === previous.uid && tab.id === previous.id && tab.url === previous.url);
  if (current) return makeTabCard(current, previous);
  const card = makeTabCard(previous, previous);
  // Preserve the controls' space, but never let a stale card issue an action.
  card.querySelectorAll('button').forEach(control => {
    control.dataset.unavailable = 'true';
    control.disabled = true;
  });
  const reason = card.querySelector('.reason');
  if (reason) reason.textContent = t('This page is no longer open in that tab. Reopen this list to refresh it.');
  return card;
}

/** @param {TrialEntry} entry @param {boolean} [preserveClose] */
function makeTrialCard(entry, preserveClose = false) {
  const current = data?.tabs.find(tab => tab.uid === entry.recordUid);
  const card = cardShell(entry, current ? () => { void action({ type: 'focus', id: current.id, url: current.url }); } : undefined);
  card.append(node('p', 'meta', new Date(entry.suggestedAt).toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })));
  card.append(node('p', 'reason', t('Suggested after {age} without a visit of at least {seconds} s', { age: duration(entry.age), seconds: entry.minVisitSeconds })));
  card.append(node('p', 'meta', t('At the time: visible {visible}, qualified {qualified}', { visible: duration(entry.visibleMs), qualified: duration(entry.activeMs) })));
  if (preserveClose && current?.protection) card.append(node('p', 'reason', t(current.protection === 'Currently selected'
    ? 'Currently selected. Switch to another tab before closing it here.' : current.protection)));
  addFeedback(card, entry, preserveClose);
  return card;
}

/** @param {ArchiveEntry} tab */
function makeArchiveCard(tab) {
  const card = cardShell(tab);
  card.append(node('p', 'meta', new Date(tab.savedAt).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short' }) + ' · ' + t(tab.automatic ? 'automatically' : 'manually')));
  card.append(node('p', 'meta', tab.activeMs === undefined ? t('Qualified time was not recorded')
    : t('Qualified when archived: {qualified}', { qualified: duration(tab.activeMs) })));
  if (!tab.closed) card.append(node('p', 'reason', t('Link saved; closing was not confirmed')));
  const actions = node('div', 'card-actions');
  actions.append(button(t('↗ Restore'), 'restore', () => { void action({ type: 'restore', id: tab.id }, 'Tab restored in the background and protected for one day.'); }));
  actions.append(button(t('Delete link'), 'delete', () => { pendingDelete = tab.id; dialog.showModal(); }));
  card.append(actions);
  return card;
}

function render() {
  if (!data) return;
  language = data.settings.language;
  translateStatic(language);
  const toggle = $('#language-toggle');
  const switchLabel = t(language === 'en' ? 'Switch to Russian' : 'Switch to English');
  toggle.setAttribute('aria-label', switchLabel);
  toggle.title = switchLabel;
  const ascending = data.settings.attentionSort === 'asc';
  const sort = /** @type {HTMLButtonElement} */ ($('#sort-toggle'));
  const sortLabel = t(ascending ? 'Qualified time: low to high. Click to show high to low.'
    : 'Qualified time: high to low. Click to show low to high.');
  sort.setAttribute('aria-label', sortLabel);
  sort.title = sortLabel;
  sort.disabled = busy;
  $('#sort-arrow').textContent = ascending ? '↑' : '↓';
  $('#toast').textContent = t(toastSource);
  const candidates = data.tabs.filter(tab => tab.candidate);
  const recommendations = data.settings.mode === 'suggest';
  $('#candidate-count').textContent = String(candidates.length);
  $('#nav-count').textContent = String(candidates.length);
  $('#candidate-label').textContent = t(recommendations ? 'suggestions' : 'to review');
  $('#total-count').textContent = String(data.tabs.length);
  $('#protected-count').textContent = String(data.tabs.filter(tab => tab.protection).length);
  $('#mode-label').textContent = t(recommendations ? 'Recommendations · you choose what to close' : 'Automatic cleanup');
  $('#trial-summary').hidden = !recommendations;
  const entries = data.trial.entries;
  const agree = entries.filter(entry => entry.decision === 'agree').length;
  const keep = entries.filter(entry => entry.decision === 'keep').length;
  $('#trial-stats').textContent = t('Journal: {count} · agreed: {agree} · needed: {keep}', { count: entries.length, agree, keep });
  $('#attention-note').textContent = t('Visits qualify after {seconds} continuous seconds. Quick scans do not reset the clock.', { seconds: data.settings.minVisitSeconds });
  $('#learning').hidden = data.now - data.installedAt >= 86_400_000;
  $('#worker-error').hidden = !data.error;
  $('#worker-error').textContent = t(data.error);
  $('#auto-note').hidden = data.settings.mode !== 'auto';
  $('#auto-note').textContent = data.settings.autoStartsAt > data.now
    ? t('Automatic closing starts in about {time}. You can configure exclusions in the meantime.', { time: duration(data.settings.autoStartsAt - data.now) })
    : t('Automatic cleanup is on: up to 5 stale tabs every 15 minutes. Links are saved to the archive.');
  document.querySelectorAll('[data-view]').forEach(element => {
    element.setAttribute('aria-pressed', String(/** @type {HTMLElement} */ (element).dataset.view === view));
  });
  $('#list-caption').textContent = view === 'archive' ? t('Saved links · {count} / {limit}', { count: data.archive.length, limit: data.archiveLimit })
    : view === 'trial' ? t('Suggestion history · latest {limit}', { limit: data.trialLimit })
    : view === 'all' ? t('All standard web pages') : t('Tabs suggested for review');
  const query = input('#search').value.toLocaleLowerCase().trim();
  /** @param {{title: string, url: string}} tab */
  const matches = tab => (tab.title + ' ' + tab.url).toLocaleLowerCase().includes(query);
  visibleTabs = reviewTabs ?? sortByAttention((view === 'all' ? data.tabs : candidates).filter(matches));
  visibleEntries = sortByAttention(entries.filter(matches));
  if (reviewTabs || reviewEntries) $('#list-caption').textContent = t('Reviewing tabs · reopen this list to refresh its order');
  const cards = view === 'archive' ? sortByAttention(data.archive.filter(matches)).map(makeArchiveCard)
    : view === 'trial' ? (reviewEntries
      ? reviewEntries.map(({ entry, canClose }) => makeTrialCard(entries.find(item => item.id === entry.id) ?? entry, canClose))
      : visibleEntries.map(entry => makeTrialCard(entry)))
    : visibleTabs.map(tab => reviewTabs ? makeReviewCard(tab) : makeTabCard(tab));
  $('#list').replaceChildren(...cards);
  $('#empty').hidden = cards.length > 0;
  $('#empty-title').textContent = t(query ? 'No results' : view === 'trial' ? 'Let us observe first'
    : view === 'archive' ? 'The archive is empty' : view === 'all' ? 'No tabs to track yet' : 'Everything has its place');
  $('#empty-text').textContent = t(query ? 'Try a different title or address.'
    : view === 'trial' ? 'Recommendations and your feedback will appear here.'
    : view === 'archive' ? 'Links saved before closing tabs appear here. Restore them at any time.'
    : view === 'all' ? 'Open a standard web page. Chrome internal pages and incognito tabs are excluded.'
    : 'No stale tabs yet. With default settings, suggestions begin after one day of observation.');
  $('#footnote').textContent = t('Links are archived before closing. Your data stays in this browser.');
  updateControls();
}

/** @param {boolean} show */
function showSettings(show) {
  $('#settings').hidden = !show;
  $('#home').hidden = show;
  $('#settings-toggle').setAttribute('aria-expanded', String(show));
  if (show && data) {
    input('input[name=mode][value=' + data.settings.mode + ']').checked = true;
    data.settings.hours.forEach((hours, index) => { input('#hours-' + index).value = String(hours); });
    input('#min-visit').value = String(data.settings.minVisitSeconds);
    /** @type {HTMLTextAreaElement} */ ($('#excluded-domains')).value = data.settings.excludedDomains.join('\n');
    input('#acknowledged').checked = data.settings.mode === 'auto';
    updateConsent();
  }
  window.scrollTo({ top: 0 });
}

function updateConsent() {
  $('#auto-consent').hidden = input('input[name=mode]:checked').value !== 'auto';
}

document.querySelectorAll('[data-view]').forEach(element => element.addEventListener('click', () => {
  resetReview();
  view = /** @type {typeof view} */ (/** @type {HTMLElement} */ (element).dataset.view);
  input('#search').value = '';
  render();
}));
$('#search').addEventListener('input', () => { resetReview(); render(); });
$('#sort-toggle').addEventListener('click', () => {
  if (data) void action({ type: 'sort', direction: data.settings.attentionSort === 'asc' ? 'desc' : 'asc' });
});
$('#language-toggle').addEventListener('click', () => {
  void action({ type: 'language', language: language === 'en' ? 'ru' : 'en' });
});
$('#settings-toggle').addEventListener('click', () => showSettings($('#settings').hidden !== false));
$('#settings-back').addEventListener('click', () => showSettings(false));
$('.brand').addEventListener('click', event => { event.preventDefault(); showSettings(false); });
document.querySelectorAll('input[name=mode]').forEach(element => element.addEventListener('change', updateConsent));
$('#settings-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!data) return;
  const settings = {
    ...data.settings,
    mode: /** @type {import('./models.js').Settings['mode']} */ (input('input[name=mode]:checked').value),
    hours: [0, 1, 2].map(index => Number(input('#hours-' + index).value)),
    minVisitSeconds: Number(input('#min-visit').value),
    excludedDomains: /** @type {HTMLTextAreaElement} */ ($('#excluded-domains')).value.split(/\s+/).map(value => value.trim().toLowerCase()).filter(Boolean),
    acknowledged: input('#acknowledged').checked,
  };
  await action({ type: 'settings', settings }, 'Settings saved.');
});
$('#confirm-cancel').addEventListener('click', () => dialog.close());
$('#confirm-delete').addEventListener('click', () => {
  dialog.close();
  void action({ type: 'forget', id: pendingDelete }, 'Link removed from the archive.');
});

request({ type: 'snapshot' }).catch(error => toast(error.message, true));
setInterval(() => {
  if (!busy && !document.hidden && $('#settings').hidden && !dialog.open) {
    void request({ type: 'snapshot' }).catch(error => toast(error.message, true));
  }
}, 15_000);
