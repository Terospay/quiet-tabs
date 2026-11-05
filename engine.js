// @ts-check
import { translate } from './i18n.js';
import { loadState, createRecord, startSession, settleFocus, reconcile, beginFocus, assess,
  recordTrial, trialEpisode, validateSettings, ARCHIVE_LIMIT, TRIAL_LIMIT, MINUTE, DAY, isWebUrl } from './core.js';

/** @typedef {import('./models.js').State} State */
/** @typedef {import('./models.js').Tab} Tab */
/** @typedef {import('./models.js').Snapshot} Snapshot */

/** Chrome I/O is injected so complete close/restore flows can be tested without personal tabs. */
export class TabManager {
  /** @param {typeof chrome} api @param {()=>number} now @param {()=>string} uuid */
  constructor(api, now = Date.now, uuid = () => crypto.randomUUID()) {
    this.api = api;
    this.now = now;
    this.uuid = uuid;
  }

  /** @param {State} state */
  async save(state) { await this.api.storage.local.set({ state }); }

  /** @param {number|undefined} cutFocusAt */
  async refresh(cutFocusAt = undefined) {
    const api = this.api;
    const [stored, session, tabs, windows, idle] = await Promise.all([
      api.storage.local.get('state'), api.storage.session.get('sessionId'),
      api.tabs.query({}), api.windows.getAll({ windowTypes: ['normal'] }), api.idle.queryState(60),
    ]);
    const now = this.now();
    const state = loadState(/** @type {import('./models.js').StoredState|import('./models.js').LegacyState|undefined} */ (stored.state), now);
    const sessionId = typeof session.sessionId === 'string' ? session.sessionId : this.uuid();
    if (session.sessionId !== sessionId) await api.storage.session.set({ sessionId });
    startSession(state, sessionId, now);
    settleFocus(state, cutFocusAt === undefined ? now : Math.min(now, cutFocusAt));
    // Event timestamps break even a return to the same tab when rapid switches were queued.
    if (cutFocusAt !== undefined) state.focus = null;
    reconcile(state, tabs, now);
    const focusedWindow = windows.find(window => window.focused);
    const focusedTab = idle === 'active' && focusedWindow
      ? tabs.find(tab => tab.active && tab.windowId === focusedWindow.id) : undefined;
    beginFocus(state, focusedTab, now);
    recordTrial(state, tabs, now, this.uuid);
    await this.save(state);
    return { state, tabs };
  }

  /** @param {State} state @param {Tab[]} tabs @returns {Snapshot} */
  snapshot(state, tabs) {
    const now = this.now();
    return {
      now, installedAt: state.installedAt, settings: state.settings, archive: state.archive,
      trial: state.trial, error: state.error, archiveLimit: ARCHIVE_LIMIT, trialLimit: TRIAL_LIMIT,
      tabs: tabs.filter(tab => tab.id !== undefined && state.records[String(tab.id)]?.url === tab.url).map(tab => {
        const record = state.records[String(tab.id)];
        return { id: /** @type {number} */ (tab.id), windowId: tab.windowId, ...record,
          trialId: state.trial.entries.find(entry => entry.episode === trialEpisode(record, state.settings))?.id,
          ...assess(tab, record, state.settings, now) };
      }).sort((a, b) => Number(b.candidate) - Number(a.candidate) || b.age - a.age),
    };
  }

  /** @param {State} state @param {Tab[]} tabs */
  async updateBadge(state, tabs) {
    const count = this.snapshot(state, tabs).tabs.filter(tab => tab.candidate).length;
    const text = state.error ? '!' : count ? String(count) : '';
    await this.api.action.setBadgeText({ text });
    await this.api.action.setBadgeBackgroundColor({ color: state.error ? '#B34832' : '#496352' });
    await this.api.action.setTitle({ title: translate(state.settings.language, state.settings.mode === 'suggest'
      ? 'Quiet Tabs · {count} recommendations, close only with your approval' : 'Quiet Tabs · {count} suggestions', { count }) });
  }

  /** @param {boolean} automatic @param {number|undefined} cutFocusAt */
  async check(automatic = false, cutFocusAt = undefined) {
    const { state, tabs } = await this.refresh(cutFocusAt);
    const now = this.now();
    if (automatic && state.settings.mode === 'auto' && now >= state.settings.autoStartsAt && now >= state.nextAutoAt) {
      state.nextAutoAt = now + 15 * MINUTE;
      await this.save(state);
      const candidates = this.snapshot(state, tabs).tabs.filter(tab => tab.candidate).slice(0, 5);
      for (const tab of candidates) {
        try { await this.close(state, tab.id, tab.url, true); }
        catch (error) {
          state.error = error instanceof Error ? error.message : 'The tab could not be closed.';
          await this.save(state);
          break;
        }
      }
    }
    await this.updateBadge(state, await this.api.tabs.query({}));
    return this.snapshot(state, await this.api.tabs.query({}));
  }

  /** Persist recovery information before asking Chrome to remove anything. */
  /** @param {State} state @param {number} id @param {string} expectedUrl @param {boolean} automatic */
  async close(state, id, expectedUrl, automatic) {
    if (automatic && state.settings.mode !== 'auto') throw new Error('Automatic closing is not enabled.');
    const tab = await this.api.tabs.get(id);
    const record = state.records[String(id)];
    if (!record || record.url !== expectedUrl || tab.url !== expectedUrl || tab.incognito ||
        !assess(tab, record, state.settings, this.now()).candidate) {
      throw new Error('The tab has changed or is protected. Refresh the list.');
    }
    if (state.archive.length >= ARCHIVE_LIMIT) {
      throw new Error('The archive contains 500 links. Remove unused entries before closing more tabs.');
    }
    const entry = { id: this.uuid(), url: record.url, title: record.title,
      savedAt: this.now(), automatic, closed: false, activeMs: record.activeMs };
    state.archive.unshift(entry);
    await this.save(state);
    // Recheck after the storage write: the user may have activated or navigated the tab.
    const current = await this.api.tabs.get(id);
    if (current.url !== expectedUrl || current.incognito ||
        (current.lastAccessed || 0) > (tab.lastAccessed || 0) ||
        !assess(current, record, state.settings, this.now()).candidate) {
      throw new Error('The tab changed and was left open. Its link was saved to the archive.');
    }
    await this.api.tabs.remove(id);
    entry.closed = true;
    delete state.records[String(id)];
    state.error = '';
    await this.save(state);
  }

  /** @param {import('./models.js').Message} message */
  async handle(message) {
    const { state, tabs } = await this.refresh();
    const now = this.now();
    switch (message.type) {
      case 'snapshot': break;
      case 'language':
        if (!['en', 'ru'].includes(message.language)) throw new Error('Choose English or Russian.');
        state.settings.language = message.language;
        break;
      case 'sort':
        if (!['asc', 'desc'].includes(message.direction)) throw new Error('Choose ascending or descending order.');
        state.settings.attentionSort = message.direction;
        break;
      case 'settings':
        state.settings = validateSettings(message.settings, state.settings, now);
        state.focus = null;
        state.error = '';
        break;
      case 'feedback': {
        if (!['agree', 'keep', 'later'].includes(message.decision)) throw new Error('Unknown feedback value.');
        const entry = state.trial.entries.find(item => item.id === message.id);
        if (!entry) throw new Error('This suggestion is no longer in the journal.');
        const match = Object.entries(state.records).find(([, item]) => item.uid === entry.recordUid);
        const record = match?.[1];
        if (message.decision === 'agree') {
          if (!match || !record || record.url !== entry.url || trialEpisode(record, state.settings) !== entry.episode) {
            throw new Error('This suggestion no longer matches a tab ready to close. Refresh the list.');
          }
          await this.close(state, Number(match[0]), entry.url, false);
        }
        entry.decision = message.decision;
        entry.reviewedAt = now;
        if (record && message.decision === 'keep') record.keep = true;
        if (record && message.decision === 'later') record.snoozeUntil = now + DAY;
        break;
      }
      case 'close':
        await this.close(state, message.id, message.url, false);
        break;
      case 'keep':
      case 'snooze': {
        const record = state.records[String(message.id)];
        if (!record || record.url !== message.url) throw new Error('This tab has changed.');
        if (message.type === 'keep') record.keep = !record.keep;
        else record.snoozeUntil = now + DAY;
        break;
      }
      case 'focus': {
        const tab = await this.api.tabs.get(message.id);
        if (tab.url !== message.url) throw new Error('This tab has changed.');
        await this.api.windows.update(tab.windowId, { focused: true });
        await this.api.tabs.update(message.id, { active: true });
        break;
      }
      case 'restore': {
        const entry = state.archive.find(item => item.id === message.id);
        if (!entry || !isWebUrl(entry.url)) throw new Error('Link not found.');
        const restored = await this.api.tabs.create({ url: entry.url, active: false });
        if (restored.id === undefined) throw new Error('Chrome did not confirm that the tab was restored.');
        state.records[String(restored.id)] = createRecord(restored, now);
        // Restored tabs get a fresh clock and at least a day to be revisited.
        state.records[String(restored.id)].snoozeUntil = now + DAY;
        state.archive = state.archive.filter(item => item.id !== entry.id);
        break;
      }
      case 'forget':
        state.archive = state.archive.filter(item => item.id !== message.id);
        if (state.archive.length < ARCHIVE_LIMIT) state.error = '';
        break;
      default: throw new Error('Unknown action.');
    }
    const currentTabs = await this.api.tabs.query({});
    recordTrial(state, currentTabs, now, this.uuid);
    await this.save(state);
    await this.updateBadge(state, currentTabs);
    return this.snapshot(state, currentTabs);
  }
}
