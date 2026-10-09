import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Domain, DomainId, DomainNode, JournalEntry, Resource, Task } from '../types';
import { DOMAIN_PALETTE, buildSeed, dayKey, uid } from './seed';

interface BrainState {
  domains: Domain[];
  tasks: Task[];
  resources: Resource[];
  journal: JournalEntry[];
  activityDays: string[];
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

const withActivity = (days: string[]): string[] => {
  const today = dayKey();
  return days.includes(today) ? days : [...days, today];
};

export const useBrainStore = create<BrainState>()(
  persist(
    (set) => ({
      ...buildSeed(),

      addDomain: (name, color) =>
        set((s) => {
          const cleanName = name.trim();
          if (!cleanName) return s;
          const id = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now().toString(36);
          const chosenColor = color || DOMAIN_PALETTE[s.domains.length % DOMAIN_PALETTE.length];
          return {
            domains: [...s.domains, { id, name: cleanName, color: chosenColor }],
          };
        }),

      deleteDomain: (id) =>
        set((s) => ({
          domains: s.domains.filter((d) => d.id !== id),
          tasks: s.tasks.filter((t) => t.domainId !== id),
          resources: s.resources.filter((r) => r.domainId !== id),
        })),

      addTask: (title, domainId) =>
        set((s) => ({
          tasks: [
            { id: uid(), title: title.trim(), domainId, status: 'pending', dateAdded: new Date().toISOString(), isFromYesterday: false },
            ...s.tasks,
          ],
        })),

      toggleTask: (id) =>
        set((s) => {
          const task = s.tasks.find((t) => t.id === id);
          if (!task) return s;
          const completing = task.status === 'pending';
          return {
            tasks: s.tasks.map((t) =>
              t.id === id ? { ...t, status: completing ? 'completed' : 'pending' } : t,
            ),
            activityDays: completing ? withActivity(s.activityDays) : s.activityDays,
          };
        }),

      deleteTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),

      addJournal: (content, title) =>
        set((s) => ({
          journal: [{ id: uid(), title: title?.trim(), content: content.trim(), timestamp: new Date().toISOString() }, ...s.journal],
          activityDays: withActivity(s.activityDays),
        })),

      deleteJournal: (id) => set((s) => ({ journal: s.journal.filter((j) => j.id !== id) })),

      addResource: (r) => set((s) => ({ resources: [{ ...r, id: uid() }, ...s.resources] })),
      removeResource: (id) => set((s) => ({ resources: s.resources.filter((r) => r.id !== id) })),

      rollover: () =>
        set((s) => {
          const today = dayKey();
          let changed = false;
          const tasks = s.tasks.map((t) => {
            const old = t.status === 'pending' && dayKey(t.dateAdded) !== today;
            if (old !== t.isFromYesterday) {
              changed = true;
              return { ...t, isFromYesterday: old };
            }
            return t;
          });
          return changed ? { tasks } : s;
        }),
    }),
    {
      name: 'orbit-brain-v1',
      version: 2,
      onRehydrateStorage: () => (state) => state?.rollover(),
    },
  ),
);

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