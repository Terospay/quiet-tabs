import { createState, createRecord } from '../core.js';

export function makeTab(id = 1, extra = {}) {
  return { id, windowId: 1, url: `https://example.com/page/${id}`, title: `Page ${id}`,
    active: false, pinned: false, audible: false, incognito: false, autoDiscardable: true,
    status: 'complete', ...extra };
}

export function fakeChrome(now, initialTabs = [makeTab()]) {
  const state = createState(now);
  state.sessionId = 'session-1';
  for (const tab of initialTabs) state.records[String(tab.id)] = createRecord(tab, now);
  const db = { local: { state }, session: { sessionId: 'session-1' } };
  const tabs = new Map(initialTabs.map(tab => [tab.id, structuredClone(tab)]));
  const calls = [];
  let nextId = 1000;
  const hooks = {};
  const storage = Object.fromEntries(['local', 'session'].map(area => [area, {
    get: async key => structuredClone({ [key]: db[area][key] }),
    set: async values => {
      if (hooks.beforeSave) await hooks.beforeSave(area, values);
      calls.push({ type: 'save', area });
      Object.assign(db[area], structuredClone(values));
    },
  }]));
  const api = {
    storage,
    tabs: {
      query: async () => structuredClone([...tabs.values()]),
      get: async id => {
        if (hooks.beforeGet) await hooks.beforeGet(id);
        if (!tabs.has(id)) throw new Error('No tab with id');
        return structuredClone(tabs.get(id));
      },
      remove: async id => {
        if (hooks.beforeRemove) await hooks.beforeRemove(id);
        calls.push({ type: 'remove', id });
        tabs.delete(id);
      },
      create: async input => {
        if (hooks.beforeCreate) await hooks.beforeCreate(input);
        const tab = makeTab(nextId++, input);
        tabs.set(tab.id, tab);
        calls.push({ type: 'create', id: tab.id });
        return structuredClone(tab);
      },
      update: async (id, input) => {
        if (input.active) for (const tab of tabs.values()) {
          if (tab.windowId === tabs.get(id).windowId) tab.active = false;
        }
        Object.assign(tabs.get(id), input);
        return structuredClone(tabs.get(id));
      },
    },
    windows: {
      getAll: async () => [{ id: 1, focused: api.focused }],
      update: async () => {},
    },
    idle: { queryState: async () => api.idleState },
    action: {
      setBadgeText: async value => { api.badge = value.text; },
      setBadgeBackgroundColor: async () => {},
      setTitle: async value => { api.title = value.title; },
    },
    focused: true, idleState: 'active', badge: '',
  };
  return { api, db, tabs, calls, hooks };
}
