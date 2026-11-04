export type Tab = Pick<chrome.tabs.Tab, 'id' | 'windowId' | 'url' | 'title' | 'active' | 'pinned' | 'audible' | 'incognito' | 'autoDiscardable' | 'pendingUrl' | 'status' | 'lastAccessed'> & { splitViewId?: number };

export interface TabRecord {
  uid: string;
  url: string;
  title: string;
  firstSeenAt: number;
  lastMeaningfulAt: number | null;
  visibleMs: number;
  activeMs: number;
  meaningfulVisits: number;
  keep: boolean;
  snoozeUntil: number;
  graceUntil: number;
  lastTrialEpisode?: string;
}

export type Language = 'en' | 'ru';

export interface Settings {
  language: Language;
  mode: 'suggest' | 'auto';
  hours: number[];
  minVisitSeconds: number;
  excludedDomains: string[];
  autoStartsAt: number;
}

export interface ArchiveEntry {
  id: string;
  url: string;
  title: string;
  savedAt: number;
  automatic: boolean;
  closed: boolean;
}

export type Feedback = 'pending' | 'agree' | 'keep' | 'later';

export interface TrialEntry {
  id: string;
  episode: string;
  recordUid: string;
  tabId: number;
  url: string;
  title: string;
  suggestedAt: number;
  age: number;
  retention: number;
  visibleMs: number;
  activeMs: number;
  minVisitSeconds: number;
  decision: Feedback;
  reviewedAt: number | null;
}

export interface State {
  version: 2;
  sessionId: string;
  installedAt: number;
  records: Record<string, TabRecord>;
  pending: TabRecord[];
  pendingUntil: number;
  focus: { id: number; url: string; at: number; observedMs: number; qualified: boolean } | null;
  settings: Settings;
  archive: ArchiveEntry[];
  trial: { startedAt: number; entries: TrialEntry[]; trimmed: number };
  nextAutoAt: number;
  error: string;
}

export interface LegacyState {
  version: 1;
  sessionId: string;
  archive: ArchiveEntry[];
  settings: Pick<Settings, 'hours' | 'excludedDomains'>;
  records: Record<string, { url: string; title: string; activeMs: number; keep: boolean; snoozeUntil: number }>;
}

/** Version 2 storage may still contain the former trial mode. Journal keys stay compatible. */
export type StoredState = Omit<State, 'settings'> & {
  settings: Omit<Settings, 'mode'> & { mode: Settings['mode'] | 'trial' };
};

export interface Assessment {
  candidate: boolean;
  protection: string;
  age: number;
  retention: number;
}

export type TabView = TabRecord & Assessment & { id: number; windowId: number; trialId?: string };

export interface Snapshot {
  now: number;
  installedAt: number;
  settings: Settings;
  archive: ArchiveEntry[];
  trial: State['trial'];
  error: string;
  archiveLimit: number;
  trialLimit: number;
  tabs: TabView[];
}

export type Message =
  | { type: 'snapshot' }
  | { type: 'language'; language: Language }
  | { type: 'settings'; settings: Settings & { acknowledged?: boolean } }
  | { type: 'close' | 'keep' | 'snooze' | 'focus'; id: number; url: string }
  | { type: 'restore' | 'forget'; id: string }
  | { type: 'feedback'; id: string; decision: Exclude<Feedback, 'pending'> };

export type Reply = { ok: true; data: Snapshot } | { ok: false; error: string };
