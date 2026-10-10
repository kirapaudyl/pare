import { useMemo } from 'react';
import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Domain, DomainId, DomainNode, JournalEntry, Resource, Task } from '../types';
import { DEFAULT_DOMAINS, DOMAIN_PALETTE, buildSeed, dayKey, uid } from './seed';

/* ---------- DB row shapes ---------- */
interface DomainRow { id: string; name: string; color: string; position: number }
interface TaskRow { id: string; title: string; domain_id: string; status: 'pending' | 'completed'; date_added: string }
interface ResourceRow { id: string; title: string; platform: string; url: string; domain_id: string }
interface JournalRow { id: string; title: string | null; content: string; created_at: string }

export const LEGACY_KEY = 'orbit-brain-v1'; // old zustand/localStorage key from before Supabase

/* A pending task from an earlier day is "carried over". Derived, never stored. */
const isCarriedOver = (status: Task['status'], dateAdded: string) =>
  status === 'pending' && dayKey(dateAdded) !== dayKey();

const toTask = (r: TaskRow): Task => ({
  id: r.id, title: r.title, domainId: r.domain_id, status: r.status,
  dateAdded: r.date_added, isFromYesterday: isCarriedOver(r.status, r.date_added),
});

type Writable = Pick<BrainData, 'domains' | 'tasks' | 'resources' | 'journal' | 'activityDays'>;

interface BrainData {
  domains: Domain[];
  tasks: Task[];
  resources: Resource[];
  journal: JournalEntry[];
  activityDays: string[];
}

interface BrainState extends BrainData {
  status: 'loading' | 'signed-out' | 'ready' | 'error';
  userId: string | null;
  email: string | null;
  syncError: string | null;
  dismissSyncError: () => void;

  init: () => () => void;
  signOut: () => Promise<void>;
  load: () => Promise<void>;
  importLegacy: () => Promise<number>;

  addDomain: (name: string, color?: string) => void;
  deleteDomain: (id: string) => void;
  addTask: (title: string, domainId: DomainId) => void;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;
  addJournal: (content: string, title?: string) => void;
  deleteJournal: (id: string) => void;
  addResource: (r: Omit<Resource, 'id'>) => void;
  removeResource: (id: string) => void;
  rollover: () => void;
}

/* ---------- legacy localStorage import ---------- */
export function readLegacy(): Partial<Writable> | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw)?.state;
    if (!s) return null;
    const hasData = (s.tasks?.length ?? 0) + (s.journal?.length ?? 0) + (s.resources?.length ?? 0) > 0;
    return hasData ? (s as Partial<Writable>) : null;
  } catch {
    return null;
  }
}

/* ---------- write bookkeeping ---------- */
let pendingWrites = 0;
let reloadTimer: ReturnType<typeof setTimeout> | undefined;

/** Insert rows, ignoring ones that already exist (safe to re-run, never overwrites). */
async function insertIgnore(table: string, rows: object[]) {
  if (!rows.length) return;
  const { error } = await supabase.from(table).upsert(rows, { onConflict: 'user_id,id', ignoreDuplicates: true });
  if (error) throw error;
}

async function insertAll(userId: string, d: Partial<Writable>) {
  const domains = d.domains?.length ? d.domains : DEFAULT_DOMAINS;
  await insertIgnore('domains', domains.map((x, i) => ({ user_id: userId, id: x.id, name: x.name, color: x.color, position: i })));
  await insertIgnore('tasks', (d.tasks ?? []).map((t) => ({
    user_id: userId, id: t.id, title: t.title, domain_id: t.domainId, status: t.status, date_added: t.dateAdded,
  })));
  await insertIgnore('resources', (d.resources ?? []).map((r) => ({
    user_id: userId, id: r.id, title: r.title, platform: r.platform, url: r.url, domain_id: r.domainId,
  })));
  await insertIgnore('journal', (d.journal ?? []).map((j) => ({
    user_id: userId, id: j.id, title: j.title ?? null, content: j.content, created_at: j.timestamp,
  })));
  const days = [...new Set(d.activityDays ?? [])];
  if (days.length) {
    const { error } = await supabase.from('activity_days').upsert(
      days.map((day) => ({ user_id: userId, day })), { onConflict: 'user_id,day', ignoreDuplicates: true },
    );
    if (error) throw error;
  }
}

const msg = (e: unknown) => (e instanceof Error ? e.message : (e as { message?: string })?.message ?? 'Something went wrong');

export const useBrainStore = create<BrainState>()((set, get) => {
  /** Optimistic-write helper: UI is already updated; if the DB write fails, resync from the server. */
  const persist = async (op: () => PromiseLike<{ error: { message: string } | null }>) => {
    pendingWrites++;
    try {
      const { error } = await op();
      if (error) throw error;
    } catch (e) {
      set({ syncError: `Couldn't save that change (${msg(e)}). Your data was reloaded from the server.` });
      await get().load();
    } finally {
      pendingWrites--;
    }
  };

  const markActive = (s: BrainState): Pick<BrainState, 'activityDays'> => {
    const today = dayKey();
    return { activityDays: s.activityDays.includes(today) ? s.activityDays : [...s.activityDays, today] };
  };
  const recordActivity = () => {
    const { userId, activityDays } = get();
    if (!userId || activityDays.includes(dayKey())) return;
    set((s) => markActive(s));
    void persist(() => supabase.from('activity_days').upsert(
      { user_id: userId, day: dayKey() }, { onConflict: 'user_id,day', ignoreDuplicates: true },
    ));
  };

  const scheduleReload = () => {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(function tick() {
      if (pendingWrites > 0) { reloadTimer = setTimeout(tick, 400); return; } // never reload mid-write
      void get().load();
    }, 400);
  };

  const handleSession = async (session: Session | null) => {
    if (!session) {
      set({ status: 'signed-out', userId: null, email: null, domains: [], tasks: [], resources: [], journal: [], activityDays: [] });
      return;
    }
    // Token refreshes re-fire this; only (re)load when the user actually changed.
    if (get().userId === session.user.id && get().status === 'ready') return;
    set({ status: 'loading', userId: session.user.id, email: session.user.email ?? null });
    try {
      const { count, error } = await supabase.from('domains').select('id', { count: 'exact', head: true });
      if (error) throw error;
      if ((count ?? 0) === 0) {
        // Brand-new account: bring over this browser's old data if it has any, otherwise start from the demo seed.
        await insertAll(session.user.id, readLegacy() ?? buildSeed());
      }
      await get().load();
    } catch (e) {
      set({ status: 'error', syncError: msg(e) });
    }
  };

  return {
    domains: [], tasks: [], resources: [], journal: [], activityDays: [],
    status: 'loading', userId: null, email: null, syncError: null,
    dismissSyncError: () => set({ syncError: null }),

    init: () => {
      // onAuthStateChange emits INITIAL_SESSION on subscribe, so no separate getSession() call is needed.
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setTimeout(() => void handleSession(session), 0); // don't await supabase calls inside this callback
      });

      const channel = supabase.channel('pare-sync');
      for (const table of ['domains', 'tasks', 'resources', 'journal', 'activity_days']) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleReload);
      }
      channel.subscribe();

      const onVisible = () => {
        if (document.visibilityState === 'visible' && get().status === 'ready') scheduleReload();
      };
      document.addEventListener('visibilitychange', onVisible);

      return () => {
        subscription.unsubscribe();
        void supabase.removeChannel(channel);
        document.removeEventListener('visibilitychange', onVisible);
        clearTimeout(reloadTimer);
      };
    },

    signOut: async () => { await supabase.auth.signOut(); },

    load: async () => {
      if (!get().userId) return;
      try {
        const [d, t, r, j, a] = await Promise.all([
          supabase.from('domains').select('id,name,color,position').order('position'),
          supabase.from('tasks').select('id,title,domain_id,status,date_added').order('date_added', { ascending: false }),
          supabase.from('resources').select('id,title,platform,url,domain_id').order('created_at', { ascending: false }),
          supabase.from('journal').select('id,title,content,created_at').order('created_at', { ascending: false }),
          supabase.from('activity_days').select('day'),
        ]);
        const failed = [d, t, r, j, a].find((x) => x.error);
        if (failed?.error) throw failed.error;

        set({
          status: 'ready',
          domains: (d.data as DomainRow[]).map((x) => ({ id: x.id, name: x.name, color: x.color })),
          tasks: (t.data as TaskRow[]).map(toTask),
          resources: (r.data as ResourceRow[]).map((x) => ({ id: x.id, title: x.title, platform: x.platform, url: x.url, domainId: x.domain_id })),
          journal: (j.data as JournalRow[]).map((x) => ({ id: x.id, title: x.title ?? undefined, content: x.content, timestamp: x.created_at })),
          activityDays: (a.data as { day: string }[]).map((x) => x.day),
        });
      } catch (e) {
        if (get().status !== 'ready') set({ status: 'error' });
        set({ syncError: `Couldn't load your data (${msg(e)}).` });
      }
    },

    /** Merge this browser's pre-Supabase data into the account. Never overwrites existing rows. */
    importLegacy: async () => {
      const userId = get().userId;
      const legacy = readLegacy();
      if (!userId || !legacy) return 0;
      try {
        await insertAll(userId, legacy);
        await get().load();
      } catch (e) {
        set({ syncError: `Import failed (${msg(e)}).` });
        return 0;
      }
      return (legacy.tasks?.length ?? 0) + (legacy.journal?.length ?? 0) + (legacy.resources?.length ?? 0);
    },

    addDomain: (name, color) => {
      const { userId, domains } = get();
      const clean = name.trim();
      if (!userId || !clean) return;
      const d: Domain = {
        id: clean.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now().toString(36),
        name: clean,
        color: color || DOMAIN_PALETTE[domains.length % DOMAIN_PALETTE.length],
      };
      set((s) => ({ domains: [...s.domains, d] }));
      void persist(() => supabase.from('domains').insert({ user_id: userId, id: d.id, name: d.name, color: d.color, position: domains.length }));
    },

    deleteDomain: (id) => {
      const { userId, domains } = get();
      if (!userId || domains.length <= 1) return; // always keep at least one domain
      set((s) => ({
        domains: s.domains.filter((d) => d.id !== id),
        tasks: s.tasks.filter((t) => t.domainId !== id),
        resources: s.resources.filter((r) => r.domainId !== id),
      }));
      void persist(async () => {
        const a = await supabase.from('tasks').delete().eq('domain_id', id);
        if (a.error) return a;
        const b = await supabase.from('resources').delete().eq('domain_id', id);
        if (b.error) return b;
        return supabase.from('domains').delete().eq('id', id);
      });
    },

    addTask: (title, domainId) => {
      const userId = get().userId;
      const clean = title.trim();
      if (!userId || !clean) return;
      const task: Task = { id: uid(), title: clean, domainId, status: 'pending', dateAdded: new Date().toISOString(), isFromYesterday: false };
      set((s) => ({ tasks: [task, ...s.tasks] }));
      void persist(() => supabase.from('tasks').insert({
        user_id: userId, id: task.id, title: task.title, domain_id: task.domainId, status: task.status, date_added: task.dateAdded,
      }));
    },

    toggleTask: (id) => {
      const task = get().tasks.find((t) => t.id === id);
      if (!task) return;
      const status: Task['status'] = task.status === 'pending' ? 'completed' : 'pending';
      set((s) => ({
        tasks: s.tasks.map((t) => (t.id === id ? { ...t, status, isFromYesterday: isCarriedOver(status, t.dateAdded) } : t)),
      }));
      void persist(() => supabase.from('tasks').update({ status }).eq('id', id));
      if (status === 'completed') recordActivity(); // un-checking never removes the streak day
    },

    deleteTask: (id) => {
      set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
      void persist(() => supabase.from('tasks').delete().eq('id', id));
    },

    addJournal: (content, title) => {
      const userId = get().userId;
      const clean = content.trim();
      if (!userId || !clean) return;
      const entry: JournalEntry = { id: uid(), title: title?.trim() || undefined, content: clean, timestamp: new Date().toISOString() };
      set((s) => ({ journal: [entry, ...s.journal] }));
      void persist(() => supabase.from('journal').insert({
        user_id: userId, id: entry.id, title: entry.title ?? null, content: entry.content, created_at: entry.timestamp,
      }));
      recordActivity();
    },

    deleteJournal: (id) => {
      set((s) => ({ journal: s.journal.filter((j) => j.id !== id) }));
      void persist(() => supabase.from('journal').delete().eq('id', id));
    },

    addResource: (r) => {
      const userId = get().userId;
      if (!userId) return;
      const res: Resource = { ...r, id: uid() };
      set((s) => ({ resources: [res, ...s.resources] }));
      void persist(() => supabase.from('resources').insert({
        user_id: userId, id: res.id, title: res.title, platform: res.platform, url: res.url, domain_id: res.domainId,
      }));
    },

    removeResource: (id) => {
      set((s) => ({ resources: s.resources.filter((r) => r.id !== id) }));
      void persist(() => supabase.from('resources').delete().eq('id', id));
    },

    // Local only: recompute "carried over" flags (e.g. the tab stayed open past midnight).
    rollover: () =>
      set((s) => {
        let changed = false;
        const tasks = s.tasks.map((t) => {
          const flag = isCarriedOver(t.status, t.dateAdded);
          if (flag === t.isFromYesterday) return t;
          changed = true;
          return { ...t, isFromYesterday: flag };
        });
        return changed ? { tasks } : s;
      }),
  };
});

export function computeStreak(days: string[]): number {
  const set = new Set(days);
  const cursor = new Date();
  if (!set.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let n = 0;
  while (set.has(dayKey(cursor))) {
    n++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return n;
}

export function useStreak(): number {
  const days = useBrainStore((s) => s.activityDays);
  return useMemo(() => computeStreak(days), [days]);
}

export interface DomainStats extends DomainNode {
  done: number;
  total: number;
}

export function useDomainNodes(): DomainStats[] {
  const domains = useBrainStore((s) => s.domains);
  const tasks = useBrainStore((s) => s.tasks);
  const resources = useBrainStore((s) => s.resources);

  return useMemo(
    () =>
      domains.map((d) => {
        const mine = tasks.filter((t) => t.domainId === d.id);
        const done = mine.filter((t) => t.status === 'completed').length;
        return {
          id: d.id,
          name: d.name,
          color: d.color,
          done,
          total: mine.length,
          progressPercentage: mine.length ? Math.round((done / mine.length) * 100) : 0,
          linkedResources: resources.filter((r) => r.domainId === d.id),
        };
      }),
    [domains, tasks, resources],
  );
}
