import type { Domain, JournalEntry, Resource, Task } from '../types';

export const USER_NAME = 'Kiran';

export const DEFAULT_DOMAINS: Domain[] = [
  { id: 'career', name: 'Career & Business', color: '#4F46E5' },
  { id: 'money', name: 'Money', color: '#0F9D6B' },
  { id: 'curiosity', name: 'Curiosity', color: '#E08A00' },
  { id: 'personal', name: 'Personal', color: '#D6336C' },
];

// Add this export right below DEFAULT_DOMAINS:
export const DOMAINS = DEFAULT_DOMAINS;

export const DOMAIN_PALETTE = [
  '#4F46E5', '#0F9D6B', '#E08A00', '#D6336C',
  '#8B5CF6', '#EC4899', '#06B6D4', '#F59E0B',
  '#10B981', '#6366F1', '#E11D48', '#0284C7',
];

export const dayKey = (d: Date | string | number = new Date()): string => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

export const daysAgo = (n: number, hour = 10): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export function buildSeed() {
  const t = (
    id: string, title: string, domainId: string, status: Task['status'], ago: number,
  ): Task => ({
    id, title, domainId, status, dateAdded: daysAgo(ago), isFromYesterday: false,
  });

   const tasks: Task[] = [
    t('t1', 'Finish module 3 of Google Data Analytics', 'career', 'pending', 1),
    t('t2', 'Draft process flow diagram for dispatch handover', 'career', 'pending', 0),
    t('t3', 'Practice 5 SQL JOIN problems', 'career', 'completed', 2),
    t('t4', 'Update weekly ops tracker', 'career', 'completed', 1),
    t('t5', 'Review this month’s budget vs actuals', 'money', 'pending', 1),
    t('t6', 'Move savings to the emergency fund', 'money', 'completed', 3),
    t('t7', 'Compare index fund vs fixed deposit returns', 'money', 'pending', 0),
    t('t8', 'Watch one video on how neural networks learn', 'curiosity', 'pending', 0),
    t('t9', 'Read 20 pages of Thinking in Systems', 'curiosity', 'completed', 1),
    t('t10', '30-minute walk, no phone', 'personal', 'pending', 1),
    t('t11', 'Call home this weekend', 'personal', 'pending', 0),
    t('t12', 'Meal-prep lunches for the week', 'personal', 'completed', 2),
  ];

  const r = (
    id: string, title: string, platform: string, url: string, domainId: string,
  ): Resource => ({ id, title, platform, url, domainId });

  const resources: Resource[] = [
    r('r1', 'Google Data Analytics Course', 'Coursera', 'https://www.coursera.org/professional-certificates/google-data-analytics', 'career'),
    r('r2', 'SQL Course (Apna College YouTube)', 'YouTube', 'https://www.youtube.com/@ApnaCollegeOfficial', 'career'),
    r('r3', 'Process Flow Diagram Making', 'diagrams.net', 'https://app.diagrams.net/', 'career'),
    r('r4', 'Personal Finance Basics', 'Zerodha Varsity', 'https://zerodha.com/varsity/', 'money'),
    r('r5', 'Investopedia: Budgeting', 'Investopedia', 'https://www.investopedia.com/', 'money'),
    r('r6', 'Neural Networks series', 'YouTube', 'https://www.youtube.com/@3blue1brown', 'curiosity'),
    r('r7', 'Farnam Street: Mental Models', 'Blog', 'https://fs.blog/mental-models/', 'curiosity'),
    r('r8', 'Guided breathing sessions', 'Headspace', 'https://www.headspace.com/', 'personal'),
    r('r9', 'Strength training basics', 'YouTube', 'https://www.youtube.com/', 'personal'),
  ];

  const journal: JournalEntry[] = [
    { id: 'j1', title: 'Hub Handovers', content: 'Idea: a one-page SLA tracker for hub handovers.', timestamp: daysAgo(1, 21) },
    { id: 'j2', title: 'Sneaker souls', content: 'Sneaker souls\nsneaker in\nwholesome kiks\nTorn head sneaker\nwhite tone\nLogin shoes', timestamp: daysAgo(2, 14) },
  ];

  const activityDays = [1, 2, 3, 4].map((n) => dayKey(daysAgo(n)));

  return { domains: DEFAULT_DOMAINS, tasks, resources, journal, activityDays };
}