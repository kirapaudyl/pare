import {
  forceCollide, forceLink, forceManyBody, forceRadial, forceSimulation, forceX, forceY,
  type Force, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum,
} from 'd3-force';
import type { Resource, Task } from '../types';

export type GKind = 'core' | 'domain' | 'task' | 'resource';

export interface GNode extends SimulationNodeDatum {
  id: string;
  kind: GKind;
  label: string;
  color: string;
  r: number;
  domainId: string | null;
  url?: string;
  platform?: string;
  done?: boolean;
  pct?: number;
  doneCount?: number;
  total?: number;
  phase: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface GLink extends SimulationLinkDatum<GNode> {
  source: GNode;
  target: GNode;
  kind: 'spine' | 'leaf';
  bend: number; // -1 or 1: which side the curve bows to
  cx: number;   // curve control point, refreshed every frame by the renderer
  cy: number;
}

export interface GraphDomain {
  id: string;
  name: string;
  color: string;
  done: number;
  total: number;
  progressPercentage: number;
}

export interface GraphInput {
  userName: string;
  domains: GraphDomain[];
  tasks: Task[];
  resources: Resource[];
}

const MAX_TASKS_PER_DOMAIN = 36;
const MAX_RESOURCES_PER_DOMAIN = 24;

export const hash01 = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const ringRadius = (w: number, h: number) => clamp(Math.min(w, h) * 0.34, 120, 250);

export function buildGraph(input: GraphInput, prev: Map<string, GNode>, w: number, h: number) {
  const cx = w / 2;
  const cy = h / 2;
  const R = ringRadius(w, h);
  const nodes: GNode[] = [];
  const links: GLink[] = [];

  const place = (id: string, fx: number, fy: number): Pick<GNode, 'x' | 'y' | 'vx' | 'vy'> => {
    const p = prev.get(id);
    return p ? { x: p.x, y: p.y, vx: p.vx, vy: p.vy } : { x: fx, y: fy, vx: 0, vy: 0 };
  };

  const core: GNode = {
    id: '__core__', kind: 'core', label: input.userName, color: '#C7D2FF', r: 30, domainId: null,
    phase: 0, ...place('__core__', cx, cy), fx: cx, fy: cy,
  };
  core.x = cx; core.y = cy;
  nodes.push(core);

  const n = input.domains.length;
  input.domains.forEach((d, i) => {
    const angle = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2;
    const dn: GNode = {
      id: d.id, kind: 'domain', label: d.name, color: d.color,
      r: clamp(20 + Math.sqrt(d.total) * 2.2, 20, 34), domainId: d.id,
      pct: d.progressPercentage, doneCount: d.done, total: d.total, phase: hash01(d.id) * 6.283,
      ...place(d.id, cx + R * Math.cos(angle), cy + R * Math.sin(angle)),
    };
    nodes.push(dn);
    links.push({ source: core, target: dn, kind: 'spine', bend: i % 2 ? 1 : -1, cx: 0, cy: 0 });

    const spawn = (id: string) => {
      const a = hash01(id) * Math.PI * 2;
      return { x: dn.x + Math.cos(a) * 46, y: dn.y + Math.sin(a) * 46 };
    };

    const mine = input.tasks
      .filter((t) => t.domainId === d.id)
      .sort((a, b) => Number(a.status === 'completed') - Number(b.status === 'completed') || b.dateAdded.localeCompare(a.dateAdded))
      .slice(0, MAX_TASKS_PER_DOMAIN);
    for (const t of mine) {
      const id = `t:${t.id}`;
      const done = t.status === 'completed';
      const s = spawn(id);
      const tn: GNode = {
        id, kind: 'task', label: t.title, color: d.color, r: done ? 3.8 : 4.8, domainId: d.id, done,
        phase: hash01(id) * 6.283, ...place(id, s.x, s.y),
      };
      nodes.push(tn);
      links.push({ source: dn, target: tn, kind: 'leaf', bend: hash01(id + 'b') > 0.5 ? 1 : -1, cx: 0, cy: 0 });
    }

    const res = input.resources.filter((r) => r.domainId === d.id).slice(0, MAX_RESOURCES_PER_DOMAIN);
    for (const r of res) {
      const id = `r:${r.id}`;
      const s = spawn(id);
      const rn: GNode = {
        id, kind: 'resource', label: r.title, color: d.color, r: 5.8, domainId: d.id, url: r.url, platform: r.platform,
        phase: hash01(id) * 6.283, ...place(id, s.x, s.y),
      };
      nodes.push(rn);
      links.push({ source: dn, target: rn, kind: 'leaf', bend: hash01(id + 'b') > 0.5 ? 1 : -1, cx: 0, cy: 0 });
    }
  });

  return { nodes, links, key: nodes.map((x) => x.id).join('|') };
}

export interface Engine {
  sim: Simulation<GNode, GLink>;
  setSize: (w: number, h: number) => void;
  setGraph: (nodes: GNode[], links: GLink[], reheat: boolean) => void;
}

export function createEngine(w: number, h: number, calm: boolean): Engine {
  const cfg = { cx: w / 2, cy: h / 2, R: ringRadius(w, h) };
  let current: GNode[] = [];
  let tick = 0;

  const radial = forceRadial<GNode>((n) => (n.kind === 'domain' ? cfg.R : 0), cfg.cx, cfg.cy)
    .strength((n) => (n.kind === 'domain' ? 0.12 : 0));
  const link = forceLink<GNode, GLink>([])
    .distance((l) => (l.kind === 'spine' ? cfg.R : l.target.kind === 'resource' ? 86 : 68))
    .strength((l) => (l.kind === 'spine' ? 0.25 : 0.7));

  // A whisper of motion so the network feels alive, not static.
  const drift: Force<GNode, GLink> = Object.assign(
    () => {
      tick++;
      for (const n of current) {
        if (n.kind === 'core') continue;
        const k = n.kind === 'domain' ? 0.012 : 0.03;
        n.vx += Math.cos(tick * 0.012 + n.phase) * k;
        n.vy += Math.sin(tick * 0.010 + n.phase * 1.3) * k;
      }
    },
    { initialize: (ns: GNode[]) => { current = ns; } },
  );

  const sim = forceSimulation<GNode>([])
    .force('link', link)
    .force('charge', forceManyBody<GNode>().strength((n) => (n.kind === 'core' ? -300 : n.kind === 'domain' ? -520 : -34)).distanceMax(420))
    .force('collide', forceCollide<GNode>().radius((n) => (n.kind === 'domain' ? n.r + 26 : n.kind === 'core' ? n.r + 20 : n.r + 5)).iterations(2))
    .force('ring', radial)
    .force('x', forceX<GNode>(() => cfg.cx).strength((n) => (n.kind === 'task' || n.kind === 'resource' ? 0.012 : 0)))
    .force('y', forceY<GNode>(() => cfg.cy).strength((n) => (n.kind === 'task' || n.kind === 'resource' ? 0.012 : 0)))
    .velocityDecay(0.32)
    .alphaDecay(0.02)
    .alphaTarget(calm ? 0 : 0.02);
  if (!calm) sim.force('drift', drift);

  return {
    sim,
    setSize(nw, nh) {
      cfg.cx = nw / 2; cfg.cy = nh / 2; cfg.R = ringRadius(nw, nh);
      radial.x(cfg.cx).y(cfg.cy).radius((n) => (n.kind === 'domain' ? cfg.R : 0));
      link.distance((l) => (l.kind === 'spine' ? cfg.R : l.target.kind === 'resource' ? 86 : 68));
      for (const n of current) if (n.kind === 'core') { n.fx = cfg.cx; n.fy = cfg.cy; n.x = cfg.cx; n.y = cfg.cy; }
      sim.alpha(Math.max(sim.alpha(), 0.4)).restart();
    },
    setGraph(nodes, links, reheat) {
      current = nodes;
      sim.nodes(nodes);
      link.links(links);
      if (reheat) sim.alpha(0.6).restart();
    },
  };
}
