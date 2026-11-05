// @ts-check
import { normalizeLanguage } from './i18n.js';
export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const ARCHIVE_LIMIT = 500;
export const TRIAL_LIMIT = 500;

/** @typedef {import('./models.js').Tab} Tab */
/** @typedef {import('./models.js').TabRecord} TabRecord */
/** @typedef {import('./models.js').State} State */
/** @typedef {import('./models.js').Settings} Settings */

/** @param {number} now @returns {State} */
export function createState(now) {
  return {
    version: 2, sessionId: '', installedAt: now, records: {}, pending: [], pendingUntil: 0,
    focus: null, settings: { language: 'en', attentionSort: 'asc', mode: 'suggest', hours: [24, 48, 120], minVisitSeconds: 15, excludedDomains: [], autoStartsAt: 0 },
    archive: [], trial: { startedAt: now, entries: [], trimmed: 0 }, nextAutoAt: 0, error: '',
  };
}

/** @param {string|undefined} url */
export function isWebUrl(url) {
  if (!url) return false;
  try { return ['http:', 'https:'].includes(new URL(url).protocol); }
  catch { return false; }
}

/** @param {Tab} tab @param {number} now @returns {TabRecord} */
export function createRecord(tab, now) {
  return { uid: crypto.randomUUID(), url: tab.url || '', title: tab.title || tab.url || '',
    firstSeenAt: now, lastMeaningfulAt: null, visibleMs: 0, activeMs: 0, meaningfulVisits: 0,
    keep: false, snoozeUntil: 0, graceUntil: 0 };
}

/** The earlier draft counted every glance. Do not treat that as qualified attention. */
/** @param {import('./models.js').StoredState|import('./models.js').LegacyState|undefined} stored @param {number} now @returns {State} */
export function loadState(stored, now) {
  if (!stored) return createState(now);
  if (stored.version === 2) {
    return { ...stored, settings: { ...stored.settings,
      language: normalizeLanguage(stored.settings.language),
      attentionSort: stored.settings.attentionSort === 'desc' ? 'desc' : 'asc',
      mode: stored.settings.mode === 'trial' ? 'suggest' : stored.settings.mode,
    } };
  }
  if (stored.version !== 1) throw new Error('Unknown data version. Tab closing has been stopped.');
  const state = createState(now);
  state.sessionId = stored.sessionId;
  state.archive = stored.archive;
  state.settings.hours = stored.settings.hours;
  state.settings.excludedDomains = stored.settings.excludedDomains;
  for (const [key, old] of Object.entries(stored.records)) {
    const previous = old;
    if (!isWebUrl(previous.url)) continue;
    state.records[key] = { uid: crypto.randomUUID(), url: previous.url, title: previous.title,
      firstSeenAt: now, lastMeaningfulAt: null, visibleMs: previous.activeMs, activeMs: 0,
      meaningfulVisits: 0, keep: previous.keep, snoozeUntil: previous.snoozeUntil, graceUntil: now + DAY };
  }
  return state;
}

/** Tab IDs are session-local. Rematch restored pages once, including duplicate URLs. */
/** @param {State} state @param {string} sessionId @param {number} now */
export function startSession(state, sessionId, now) {
  if (state.sessionId === sessionId) return;
  state.pending = [...Object.values(state.records), ...state.pending];
  state.pendingUntil = now + 5 * MINUTE;
  state.records = {};
  state.focus = null;
  state.sessionId = sessionId;
  state.nextAutoAt = now + HOUR;
}

/** @param {State} state @param {Tab[]} tabs @param {number} now */
export function reconcile(state, tabs, now) {
  if (now > state.pendingUntil) state.pending = [];
  const live = new Set();
  for (const tab of tabs) {
    if (tab.id === undefined || tab.incognito || !isWebUrl(tab.url)) continue;
    const key = String(tab.id);
    live.add(key);
    let record = state.records[key];
    if (!record || record.url !== tab.url) {
      const index = state.pending.findIndex(item => item.url === tab.url);
      record = index >= 0 ? state.pending.splice(index, 1)[0] : createRecord(tab, now);
      if (index >= 0) record.graceUntil = now + HOUR;
      state.records[key] = record;
    }
    record.title = tab.title || record.title;
  }
  for (const key of Object.keys(state.records)) {
    if (!live.has(key)) delete state.records[key];
  }
}

/** Accumulate a continuous visit across heartbeats and worker suspension. */
/** @param {State} state @param {number} now */
export function settleFocus(state, now) {
  const focus = state.focus;
  if (!focus) return;
  const record = state.records[String(focus.id)];
  const elapsed = now - focus.at;
  // Sleep, clock rollback, or missing heartbeats break continuity; gaps count as no attention.
  if (!record || record.url !== focus.url || elapsed < 0 || elapsed > 90_000) {
    state.focus = null;
    return;
  }
  const delta = Math.min(elapsed, MINUTE);
  record.visibleMs += delta;
  focus.observedMs += delta;
  focus.at = now;
  if (focus.qualified) {
    record.activeMs += delta;
  } else if (focus.observedMs >= state.settings.minVisitSeconds * 1000) {
    focus.qualified = true;
    record.activeMs += focus.observedMs;
    record.meaningfulVisits += 1;
  }
  if (focus.qualified && delta > 0) record.lastMeaningfulAt = now;
}

/** Merely opening a tab never resets its inactivity clock. */
/** @param {State} state @param {Tab|undefined} tab @param {number} now */
export function beginFocus(state, tab, now) {
  const record = tab?.id === undefined ? undefined : state.records[String(tab.id)];
  if (!record || !tab || tab.id === undefined || record.url !== tab.url) {
    state.focus = null;
    return;
  }
  if (state.focus?.id === tab.id && state.focus.url === tab.url) return;
  state.focus = { id: tab.id, url: record.url, at: now, observedMs: 0, qualified: false };
}

/** @param {TabRecord} record @param {Settings} settings */
export function retentionMs(record, settings) {
  const tier = record.activeMs < MINUTE ? 0 : record.activeMs < 10 * MINUTE ? 1 : 2;
  return settings.hours[tier] * HOUR;
}

/** @param {Tab} tab @param {TabRecord} record @param {Settings} settings @param {number} now */
export function assess(tab, record, settings, now) {
  const age = Math.max(0, now - (record.lastMeaningfulAt ?? record.firstSeenAt));
  const retention = retentionMs(record, settings);
  const host = new URL(record.url).hostname;
  const excluded = settings.excludedDomains.some(domain => host === domain || host.endsWith('.' + domain));
  let protection = '';
  if (tab.active) protection = 'Currently selected';
  else if (tab.pinned) protection = 'Pinned in Chrome';
  else if (tab.audible) protection = 'Playing audio';
  else if (tab.autoDiscardable === false) protection = 'Protected by Chrome';
  else if (tab.splitViewId !== undefined && tab.splitViewId !== -1) protection = 'Split view';
  else if (tab.pendingUrl || tab.status === 'loading') protection = 'Page is loading';
  else if (record.keep) protection = 'You chose to keep this tab';
  else if (excluded) protection = 'Excluded site';
  else if (record.snoozeUntil > now) protection = 'Snoozed';
  else if (record.graceUntil > now) protection = 'Grace period after restart';
  return { candidate: !protection && age >= retention, protection, age, retention };
}

/** @param {TabRecord} record @param {Settings} settings */
export function trialEpisode(record, settings) {
  return JSON.stringify([record.uid, record.lastMeaningfulAt, record.snoozeUntil, settings.hours, settings.minVisitSeconds]);
}

/** Capture each stale episode once in Recommendations mode. Keep the existing journal storage keys. */
/** @param {State} state @param {Tab[]} tabs @param {number} now @param {()=>string} uuid */
export function recordTrial(state, tabs, now, uuid) {
  if (state.settings.mode !== 'suggest') return;
  const known = new Set(state.trial.entries.map(entry => entry.episode));
  for (const tab of tabs) {
    if (tab.id === undefined) continue;
    const record = state.records[String(tab.id)];
    if (!record || record.url !== tab.url) continue;
    const result = assess(tab, record, state.settings, now);
    const episode = trialEpisode(record, state.settings);
    if (!result.candidate || known.has(episode) || record.lastTrialEpisode === episode) continue;
    state.trial.entries.unshift({
      id: uuid(), episode, recordUid: record.uid, tabId: tab.id, url: record.url, title: record.title,
      suggestedAt: now, age: result.age, retention: result.retention,
      activeMs: record.activeMs, visibleMs: record.visibleMs,
      minVisitSeconds: state.settings.minVisitSeconds, decision: 'pending', reviewedAt: null,
    });
    known.add(episode);
    record.lastTrialEpisode = episode;
  }
  // Keep a bounded journal. Its UI explicitly describes these as the latest entries.
  if (state.trial.entries.length > TRIAL_LIMIT) {
    state.trial.trimmed += state.trial.entries.length - TRIAL_LIMIT;
    state.trial.entries.length = TRIAL_LIMIT;
  }
}

/** Validate at the worker boundary, not only in the settings form. */
/** @param {Settings & {acknowledged?: boolean}} input @param {Settings} previous @param {number} now @returns {Settings} */
export function validateSettings(input, previous, now) {
  if (!input || !['suggest', 'auto'].includes(input.mode)) throw new Error('Choose a mode.');
  if (!Array.isArray(input.hours) || input.hours.length !== 3 ||
      input.hours.some(value => !Number.isFinite(value) || value < 1 || value > 2160) ||
      input.hours[0] > input.hours[1] || input.hours[1] > input.hours[2]) {
    throw new Error('Enter retention periods from 1 to 2160 hours, in ascending order.');
  }
  if (!Number.isInteger(input.minVisitSeconds) || input.minVisitSeconds < 5 || input.minVisitSeconds > 120) {
    throw new Error('The visit threshold must be a whole number from 5 to 120 seconds.');
  }
  if (!Array.isArray(input.excludedDomains) || input.excludedDomains.length > 100 ||
      input.excludedDomains.some(domain => typeof domain !== 'string' ||
        !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(domain))) {
    throw new Error('Enter up to 100 domains without https:// or paths, such as docs.google.com.');
  }
  if (input.mode === 'auto' && previous.mode !== 'auto' && input.acknowledged !== true) {
    throw new Error('Confirm that the archive saves links, not unsaved form content.');
  }
  return { language: previous.language, attentionSort: previous.attentionSort,
    mode: input.mode, hours: [...input.hours], minVisitSeconds: input.minVisitSeconds,
    excludedDomains: [...new Set(input.excludedDomains)],
    autoStartsAt: input.mode === 'auto' && previous.mode !== 'auto' ? now + HOUR : previous.autoStartsAt };
}
