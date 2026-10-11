import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ExternalLink, Minus, Plus, Maximize2, X } from 'lucide-react';
import { useBrainStore, useDomainNodes } from '../store/useBrainStore';
import { USER_NAME } from '../store/seed';
import { buildGraph, createEngine, hash01, type Engine, type GLink, type GNode } from '../lib/brainGraph';

/* ---------- small helpers ---------- */
interface Cam { k: number; x: number; y: number }
const PANEL_W = 300;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function rgba(hex: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  const n = m ? parseInt(m[1], 16) : 0x9aa5ff;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp(a, 0, 1)})`;
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '\u2026').width > maxW) t = t.slice(0, -1);
  return t + '\u2026';
}

const STARS = Array.from({ length: 150 }, (_, i) => ({
  x: hash01('sx' + i), y: hash01('sy' + i), r: 0.3 + hash01('sr' + i) * 1.1, tw: hash01('st' + i) * 6.28,
}));

/* ---------- component ---------- */
export default function MindMap() {
  const domains = useDomainNodes();
  const tasks = useBrainStore((s) => s.tasks);
  const resources = useBrainStore((s) => s.resources);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const nodesRef = useRef<GNode[]>([]);
  const linksRef = useRef<GLink[]>([]);
  const keyRef = useRef('');
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const camRef = useRef<Cam>({ k: 1, x: 0, y: 0 });
  const targetRef = useRef<Cam | null>(null);
  const followRef = useRef<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const hoverRef = useRef<GNode | null>(null);
  const fittedRef = useRef(false);
  const dragRef = useRef<{ mode: 'node' | 'pan'; node?: GNode; sx: number; sy: number; lx: number; ly: number; moved: boolean } | null>(null);
  const calm = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const selected = domains.find((d) => d.id === selectedId) ?? null;

  /* camera: fit everything in view */
  const fitCam = useCallback((): Cam => {
    const { w, h } = sizeRef.current;
    const nodes = nodesRef.current;
    if (!nodes.length || !w) return { k: 1, x: 0, y: 0 };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of nodes) {
      const m = n.kind === 'domain' ? n.r + 40 : n.r + 8;
      x0 = Math.min(x0, n.x - m); x1 = Math.max(x1, n.x + m);
      y0 = Math.min(y0, n.y - m); y1 = Math.max(y1, n.y + m);
    }
    const pad = 28;
    const k = clamp(Math.min((w - pad * 2) / (x1 - x0), (h - pad * 2) / (y1 - y0)), 0.45, 1.15);
    return { k, x: w / 2 - ((x0 + x1) / 2) * k, y: h / 2 - ((y0 + y1) / 2) * k };
  }, []);

  const viewCenterX = () => {
    const { w } = sizeRef.current;
    return w > 760 && selectedRef.current ? (w - PANEL_W) / 2 : w / 2;
  };

  const zoomAt = useCallback((factor: number, sx: number, sy: number, animate: boolean) => {
    const cam = camRef.current;
    const k = clamp(cam.k * factor, 0.35, 3.2);
    const wx = (sx - cam.x) / cam.k;
    const wy = (sy - cam.y) / cam.k;
    const next = { k, x: sx - wx * k, y: sy - wy * k };
    followRef.current = null;
    if (animate) targetRef.current = next;
    else { camRef.current = next; targetRef.current = null; }
  }, []);

  const resetView = useCallback(() => {
    setSelectedId(null);
    followRef.current = null;
    targetRef.current = fitCam();
  }, [fitCam]);

  /* selection -> camera follow */
  useEffect(() => {
    selectedRef.current = selectedId;
    if (selectedId) followRef.current = selectedId;
    else { followRef.current = null; if (fittedRef.current) targetRef.current = fitCam(); }
  }, [selectedId, fitCam]);

  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelectedId(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

  /* sizing */
  useEffect(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const apply = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(r.width), h = Math.round(r.height);
      if (!w || !h) return;
      sizeRef.current = { w, h, dpr };
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      engineRef.current?.setSize(w, h);
      setReady(true);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  /* data -> graph (positions are preserved so nothing jumps) */
  useEffect(() => {
    const { w, h } = sizeRef.current;
    if (!ready || !w) return;
    const prev = new Map(nodesRef.current.map((n) => [n.id, n]));
    const g = buildGraph({ userName: USER_NAME, domains, tasks, resources }, prev, w, h);
    const structureChanged = g.key !== keyRef.current;
    keyRef.current = g.key;
    nodesRef.current = g.nodes;
    linksRef.current = g.links;
    if (!engineRef.current) engineRef.current = createEngine(w, h, calm);
    engineRef.current.setGraph(g.nodes, g.links, structureChanged);
  }, [ready, domains, tasks, resources, calm]);

  /* render loop */
  useEffect(() => {
    let raf = 0;
    // After the first layout settles, frame the whole network once.
    const fitTimer = setTimeout(() => {
      if (!fittedRef.current && nodesRef.current.length) { targetRef.current = fitCam(); fittedRef.current = true; }
    }, 1400);

    const frame = (time: number) => {
      raf = requestAnimationFrame(frame);
      const canvas = canvasRef.current;
      const { w, h, dpr } = sizeRef.current;
      if (!canvas || !w) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const cam = camRef.current;
      const nodes = nodesRef.current;
      const links = linksRef.current;
      const sel = selectedRef.current;

      // follow the selected domain, then ease the camera toward its target
      if (followRef.current) {
        const n = nodes.find((x) => x.id === followRef.current);
        if (n) {
          const k = Math.max(cam.k, 1.35);
          targetRef.current = { k, x: viewCenterX() - n.x * k, y: h / 2 - n.y * k };
        }
      }
      const tg = targetRef.current;
      if (tg) {
        cam.k += (tg.k - cam.k) * 0.12;
        cam.x += (tg.x - cam.x) * 0.12;
        cam.y += (tg.y - cam.y) * 0.12;
        if (!followRef.current && Math.abs(tg.k - cam.k) < 0.001 && Math.abs(tg.x - cam.x) < 0.3 && Math.abs(tg.y - cam.y) < 0.3) targetRef.current = null;
      }

      /* background (screen space) */
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      const bg = ctx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, Math.max(w, h) * 0.75);
      bg.addColorStop(0, '#151D3C');
      bg.addColorStop(1, '#070B18');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      for (const s of STARS) {
        const a = calm ? 0.5 : 0.35 + 0.35 * Math.sin(time * 0.0012 + s.tw);
        ctx.fillStyle = `rgba(200,210,255,${a})`;
        ctx.beginPath();
        ctx.arc(((s.x * w + cam.x * 0.04) % w + w) % w, ((s.y * h + cam.y * 0.04) % h + h) % h, s.r, 0, 6.283);
        ctx.fill();
      }

      /* world space */
      ctx.setTransform(dpr * cam.k, 0, 0, dpr * cam.k, dpr * cam.x, dpr * cam.y);

      const nodeA = (n: GNode) => (!sel || n.kind === 'core' ? 1 : n.kind === 'domain' ? (n.id === sel ? 1 : 0.4) : n.domainId === sel ? 1 : 0.16);
      const linkA = (l: GLink) => (!sel ? 1 : l.kind === 'spine' ? (l.target.id === sel ? 1 : 0.3) : l.target.domainId === sel ? 1 : 0.1);

      // nebula glow behind each cluster
      ctx.globalCompositeOperation = 'lighter';
      const core = nodes.find((n) => n.kind === 'core');
      if (core) {
        const g0 = ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, 300);
        g0.addColorStop(0, 'rgba(120,140,255,0.16)');
        g0.addColorStop(1, 'rgba(120,140,255,0)');
        ctx.fillStyle = g0;
        ctx.fillRect(core.x - 300, core.y - 300, 600, 600);
      }
      for (const n of nodes) {
        if (n.kind !== 'domain') continue;
        const rad = 120 + (n.total ?? 0) * 3;
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, rad);
        g.addColorStop(0, rgba(n.color, 0.26 * nodeA(n)));
        g.addColorStop(1, rgba(n.color, 0));
        ctx.fillStyle = g;
        ctx.fillRect(n.x - rad, n.y - rad, rad * 2, rad * 2);
      }

      // curved, glowing links
      for (const l of links) {
        const s = l.source, t = l.target;
        const dx = t.x - s.x, dy = t.y - s.y;
        const len = Math.hypot(dx, dy) || 1;
        const off = l.bend * len * 0.16;
        l.cx = (s.x + t.x) / 2 - (dy / len) * off;
        l.cy = (s.y + t.y) / 2 + (dx / len) * off;
        const a = linkA(l);
        const g = ctx.createLinearGradient(s.x, s.y, t.x, t.y);
        const base = l.kind === 'spine' ? 0.55 : 0.34;
        g.addColorStop(0, rgba(s.color, base * a));
        g.addColorStop(1, rgba(t.color, base * a));
        ctx.strokeStyle = g;
        ctx.lineWidth = l.kind === 'spine' ? 1.8 : 0.9;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.quadraticCurveTo(l.cx, l.cy, t.x, t.y);
        ctx.stroke();
      }

      // light flowing from the core to each domain
      if (!calm) {
        links.forEach((l, i) => {
          if (l.kind !== 'spine') return;
          const a = linkA(l);
          for (let j = 0; j < 3; j++) {
            const p = (time * 0.00006 + j / 3 + i * 0.137) % 1;
            const q = 1 - p;
            const px = q * q * l.source.x + 2 * q * p * l.cx + p * p * l.target.x;
            const py = q * q * l.source.y + 2 * q * p * l.cy + p * p * l.target.y;
            ctx.fillStyle = rgba(l.target.color, 0.18 * a);
            ctx.beginPath(); ctx.arc(px, py, 4.5, 0, 6.283); ctx.fill();
            ctx.fillStyle = rgba('#FFFFFF', 0.85 * a);
            ctx.beginPath(); ctx.arc(px, py, 1.5, 0, 6.283); ctx.fill();
          }
        });
      }

      ctx.globalCompositeOperation = 'source-over';
      const hover = hoverRef.current;

      // leaves
      for (const n of nodes) {
        if (n.kind !== 'task' && n.kind !== 'resource') continue;
        const a = nodeA(n);
        const hot = hover === n ? 1.35 : 1;
        ctx.save();
        if (n.kind === 'resource') {
          ctx.translate(n.x, n.y);
          ctx.rotate(Math.PI / 4);
          const s = n.r * 0.95 * hot;
          ctx.shadowColor = n.color; ctx.shadowBlur = 10;
          ctx.fillStyle = rgba('#FFFFFF', 0.92 * a);
          ctx.fillRect(-s, -s, s * 2, s * 2);
          ctx.fillStyle = rgba(n.color, a);
          ctx.fillRect(-s * 0.55, -s * 0.55, s * 1.1, s * 1.1);
        } else if (n.done) {
          ctx.strokeStyle = rgba(n.color, 0.55 * a);
          ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.arc(n.x, n.y, n.r * hot, 0, 6.283); ctx.stroke();
        } else {
          ctx.shadowColor = n.color; ctx.shadowBlur = 12;
          ctx.fillStyle = rgba(n.color, 0.95 * a);
          ctx.beginPath(); ctx.arc(n.x, n.y, n.r * hot, 0, 6.283); ctx.fill();
        }
        ctx.restore();
      }

      // domains + core
      for (const n of nodes) {
        if (n.kind === 'domain') {
          const a = nodeA(n);
          const R = n.r * (hover === n ? 1.08 : 1);
          ctx.save();
          ctx.shadowColor = n.color; ctx.shadowBlur = 26 * a;
          ctx.fillStyle = '#0B1020';
          ctx.beginPath(); ctx.arc(n.x, n.y, R, 0, 6.283); ctx.fill();
          ctx.restore();
          ctx.strokeStyle = rgba(n.color, 0.95 * a);
          ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(n.x, n.y, R, 0, 6.283); ctx.stroke();

          const pr = R + 7;
          ctx.lineWidth = 3; ctx.lineCap = 'round';
          ctx.strokeStyle = rgba('#FFFFFF', 0.12 * a);
          ctx.beginPath(); ctx.arc(n.x, n.y, pr, 0, 6.283); ctx.stroke();
          if ((n.pct ?? 0) > 0) {
            ctx.strokeStyle = rgba(n.color, a);
            ctx.beginPath(); ctx.arc(n.x, n.y, pr, -Math.PI / 2, -Math.PI / 2 + 6.283 * ((n.pct ?? 0) / 100)); ctx.stroke();
          }
          if (sel === n.id) {
            ctx.strokeStyle = rgba(n.color, 0.35 + (calm ? 0 : 0.2 * Math.sin(time * 0.004)));
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(n.x, n.y, pr + 8, 0, 6.283); ctx.stroke();
          }

          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = rgba('#FFFFFF', a);
          ctx.font = `700 ${Math.round(R * 0.6)}px "Bricolage Grotesque", system-ui, sans-serif`;
          ctx.fillText(`${n.pct ?? 0}%`, n.x, n.y + 1);
          ctx.font = '700 13px "Bricolage Grotesque", system-ui, sans-serif';
          ctx.fillStyle = rgba('#EBEEFF', a);
          ctx.fillText(ellipsize(ctx, n.label, 150), n.x, n.y + pr + 17);
          ctx.font = '500 11px Figtree, system-ui, sans-serif';
          ctx.fillStyle = rgba('#9AA5D6', a);
          ctx.fillText(`${n.doneCount ?? 0}/${n.total ?? 0} done`, n.x, n.y + pr + 32);
        } else if (n.kind === 'core') {
          const spin = calm ? 0 : time * 0.0002;
          ctx.save();
          ctx.shadowColor = '#8FA2FF'; ctx.shadowBlur = 34;
          const cg = ctx.createRadialGradient(n.x - 8, n.y - 8, 2, n.x, n.y, n.r);
          cg.addColorStop(0, '#FFFFFF'); cg.addColorStop(1, '#8FA2FF');
          ctx.fillStyle = cg;
          ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, 6.283); ctx.fill();
          ctx.restore();
          ctx.strokeStyle = 'rgba(190,200,255,0.4)';
          ctx.lineWidth = 1; ctx.setLineDash([3, 7]);
          ctx.lineDashOffset = -spin * 400;
          ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 12, 0, 6.283); ctx.stroke();
          ctx.setLineDash([]);
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = '#12141F';
          ctx.font = '700 14px "Bricolage Grotesque", system-ui, sans-serif';
          ctx.fillText(ellipsize(ctx, n.label, n.r * 1.7), n.x, n.y + 1);
        }
      }

      // tooltip for hovered leaf (drawn at constant screen size)
      if (hover && (hover.kind === 'task' || hover.kind === 'resource')) {
        ctx.save();
        ctx.translate(hover.x, hover.y - hover.r - 12);
        ctx.scale(1 / cam.k, 1 / cam.k);
        ctx.font = '600 12px Figtree, system-ui, sans-serif';
        const sub = hover.kind === 'resource' ? (hover.platform ?? 'Resource') : hover.done ? 'Completed' : 'Pending';
        const title = ellipsize(ctx, hover.label, 230);
        const tw = Math.max(ctx.measureText(title).width, 60) + 22;
        ctx.fillStyle = 'rgba(8,12,26,0.94)';
        ctx.strokeStyle = rgba(hover.color, 0.7);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(-tw / 2, -40, tw, 38, 9); ctx.fill(); ctx.stroke();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#F2F4FF'; ctx.fillText(title, 0, -28);
        ctx.font = '500 10.5px Figtree, system-ui, sans-serif';
        ctx.fillStyle = rgba(hover.color, 1); ctx.fillText(hover.kind === 'resource' ? `${sub} \u00B7 click to open` : sub, 0, -13);
        ctx.restore();
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(fitTimer);
    };
  }, [calm, fitCam]);

  useEffect(() => () => { engineRef.current?.sim.stop(); engineRef.current = null; }, []);

  /* ctrl/cmd + wheel (and trackpad pinch) zooms; plain scroll still scrolls the page */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.002), e.clientX - r.left, e.clientY - r.top, false);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  /* pointer interaction */
  const toWorld = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const cam = camRef.current;
    return { sx, sy, wx: (sx - cam.x) / cam.k, wy: (sy - cam.y) / cam.k };
  };

  const hitTest = (wx: number, wy: number): GNode | null => {
    const k = camRef.current.k;
    const nodes = nodesRef.current;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const pad = (n.kind === 'task' || n.kind === 'resource' ? 7 : 5) / k;
      const rr = (n.kind === 'domain' ? n.r + 8 : n.r) + pad;
      if ((n.x - wx) ** 2 + (n.y - wy) ** 2 <= rr * rr) return n;
    }
    return null;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { sx, sy, wx, wy } = toWorld(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    const node = hitTest(wx, wy);
    if (node && node.kind !== 'core') {
      dragRef.current = { mode: 'node', node, sx, sy, lx: sx, ly: sy, moved: false };
      node.fx = wx; node.fy = wy;
      engineRef.current?.sim.alphaTarget(0.3).restart();
    } else {
      dragRef.current = { mode: 'pan', sx, sy, lx: sx, ly: sy, moved: false };
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { sx, sy, wx, wy } = toWorld(e);
    const d = dragRef.current;
    if (!d) {
      const h = hitTest(wx, wy);
      hoverRef.current = h && h.kind !== 'core' ? h : null;
      e.currentTarget.style.cursor = h && h.kind !== 'core' ? 'pointer' : 'grab';
      return;
    }
    if (Math.hypot(sx - d.sx, sy - d.sy) > 4) d.moved = true;
    if (d.mode === 'node' && d.node) {
      d.node.fx = wx; d.node.fy = wy;
    } else if (d.moved) {
      camRef.current.x += sx - d.lx;
      camRef.current.y += sy - d.ly;
      targetRef.current = null;
      followRef.current = null;
      e.currentTarget.style.cursor = 'grabbing';
    }
    d.lx = sx; d.ly = sy;
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    engineRef.current?.sim.alphaTarget(calm ? 0 : 0.02);
    if (d.mode === 'node' && d.node) {
      d.node.fx = null; d.node.fy = null;
      if (!d.moved) {
        if (d.node.kind === 'domain') setSelectedId((cur) => (cur === d.node!.id ? null : d.node!.id));
        else if (d.node.kind === 'resource' && d.node.url) window.open(d.node.url, '_blank', 'noopener,noreferrer');
      }
    } else if (!d.moved) {
      setSelectedId(null);
    }
    e.currentTarget.style.cursor = 'grab';
  };

  const onPointerLeave = () => { hoverRef.current = null; };

  const zoomButton = (f: number) => {
    const { w, h } = sizeRef.current;
    zoomAt(f, viewCenterX() || w / 2, h / 2, true);
  };

  const pendingOf = (id: string) => tasks.filter((t) => t.domainId === id && t.status === 'pending');

  return (
    <section aria-label="Brain view" className="overflow-hidden rounded-xl2 bg-[#0A0F1F] p-5 shadow-lift sm:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-bold text-white">Brain view</h2>
        <span className="text-xs text-slate-400">Drag nodes &middot; drag background to pan &middot; Ctrl + scroll to zoom</span>
      </header>

      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Focus a domain">
        {domains.map((d) => {
          const active = d.id === selectedId;
          return (
            <button
              key={d.id}
              aria-pressed={active}
              onClick={() => setSelectedId(active ? null : d.id)}
              className="flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition-colors"
              style={active ? { borderColor: d.color, backgroundColor: `${d.color}33`, color: '#fff' } : { borderColor: 'rgba(255,255,255,.14)', color: '#C6CCE8' }}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color, boxShadow: `0 0 8px ${d.color}` }} />
              {d.name}
              <span className="text-slate-400">{d.progressPercentage}%</span>
            </button>
          );
        })}
      </div>

      <div ref={wrapRef} className="relative mt-4 h-[540px] overflow-hidden rounded-2xl sm:h-[600px]">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Network of ${domains.length} domains with ${tasks.length} tasks and ${resources.length} resources around ${USER_NAME}. Use the domain buttons above to explore.`}
          className="absolute inset-0 h-full w-full cursor-grab"
          style={{ touchAction: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerLeave}
        />

        <div className="absolute bottom-3 left-3 flex flex-col gap-1.5">
          {[
            { label: 'Zoom in', icon: <Plus size={16} />, on: () => zoomButton(1.3) },
            { label: 'Zoom out', icon: <Minus size={16} />, on: () => zoomButton(1 / 1.3) },
            { label: 'Fit to view', icon: <Maximize2 size={15} />, on: resetView },
          ].map((b) => (
            <button
              key={b.label} onClick={b.on} aria-label={b.label} title={b.label}
              className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/5 text-slate-200 backdrop-blur hover:bg-white/15"
            >
              {b.icon}
            </button>
          ))}
        </div>

        <AnimatePresence>
          {selected && (
            <motion.aside
              key={selected.id}
              aria-label={`${selected.name} details`}
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 32 }}
              className="absolute inset-y-3 right-3 z-10 flex w-[calc(100%-1.5rem)] max-w-[300px] flex-col rounded-2xl border border-white/10 bg-[#0E1530]/90 p-5 text-slate-100 shadow-2xl backdrop-blur-md"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-display text-lg font-bold" style={{ color: selected.color }}>{selected.name}</h3>
                  <p className="text-xs text-slate-400">{selected.done}/{selected.total} tasks done &middot; {selected.progressPercentage}%</p>
                </div>
                <button onClick={() => setSelectedId(null)} aria-label="Close details" className="rounded-md p-1 text-slate-400 hover:text-white"><X size={18} /></button>
              </div>

              <div className="mt-4 flex-1 space-y-5 overflow-y-auto pr-1">
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Resources ({selected.linkedResources.length})</h4>
                  {selected.linkedResources.length === 0 && <p className="text-sm text-slate-400">None yet. Add one from the Resources tab.</p>}
                  <ul className="space-y-2">
                    {selected.linkedResources.map((r) => (
                      <li key={r.id}>
                        <a href={r.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-3 rounded-xl border border-white/10 p-2.5 hover:border-white/40">
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold">{r.title}</span>
                            <span className="text-xs text-slate-400">{r.platform}</span>
                          </span>
                          <ExternalLink size={14} className="shrink-0 text-slate-400" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Pending ({pendingOf(selected.id).length})</h4>
                  {pendingOf(selected.id).length === 0 && <p className="text-sm text-slate-400">Nothing pending here.</p>}
                  <ul className="space-y-1.5">
                    {pendingOf(selected.id).slice(0, 10).map((t) => (
                      <li key={t.id} className="flex items-start gap-2 text-sm">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: selected.color }} />
                        <span>{t.title}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
