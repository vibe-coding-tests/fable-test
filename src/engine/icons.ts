// ------------------------------------------------------------------
// Procedural 2D icons (SPEC §3): canvas-drawn glyphs from a fixed
// vocabulary, colored per ability/item. Data URLs cached by key.
// ------------------------------------------------------------------

import type { AbilityDef, ItemDef, NeutralItemDef, SilhouetteSpec } from '../core/types';
import { ITEM_ICON_PATHS, ITEM_GLYPH_PATHS, ITEM_GLYPH_VIEWBOX } from './item-glyphs.generated';

const cache = new Map<string, string>();

// Parsed once per glyph token. game-icons paths are single-path 512² silhouettes;
// we fill them tinted into the slot, which beats the hand-drawn glyph and stops the
// ~30 unmapped tokens from collapsing into the generic gem diamond. Procedural
// ITEM_GLYPHS stays the fallback for any token without a vendored silhouette (and
// for environments without Path2D), so the empty-assets floor is preserved.
const silhouetteCache = new Map<string, Path2D | null>();

// Lookup order: per-item id (every item gets its own shape) → glyph token default
// → procedural. Cached per resolved key so each Path2D is parsed at most once.
function itemSilhouette(id: string | undefined, token: string | undefined): Path2D | null {
  const d = (id && ITEM_ICON_PATHS[id]) || (token && ITEM_GLYPH_PATHS[token]) || null;
  if (!d) return null;
  if (silhouetteCache.has(d)) return silhouetteCache.get(d)!;
  const p = typeof Path2D !== 'undefined' ? new Path2D(d) : null;
  silhouetteCache.set(d, p);
  return p;
}

// Fit the 512² silhouette into the slot with a soft drop for depth, then fill the
// tint. The brass/rarity read still comes from the slot background drawn by bg().
function drawSilhouette(ctx: CanvasRenderingContext2D, s: number, path: Path2D, color: string): void {
  const pad = s * 0.18;
  const span = s - pad * 2;
  const scale = span / ITEM_GLYPH_VIEWBOX;
  ctx.save();
  ctx.translate(pad, pad + s * 0.015);
  ctx.scale(scale, scale);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fill(path, 'evenodd');
  ctx.restore();
  ctx.save();
  ctx.translate(pad, pad);
  ctx.scale(scale, scale);
  ctx.fillStyle = color;
  ctx.fill(path, 'evenodd');
  ctx.restore();
}

function draw(size: number, fn: (ctx: CanvasRenderingContext2D, s: number) => void): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  fn(ctx, size);
  return canvas.toDataURL();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function bg(ctx: CanvasRenderingContext2D, s: number, color: string, color2: string): void {
  const grad = ctx.createLinearGradient(0, 0, s, s);
  grad.addColorStop(0, color2);
  grad.addColorStop(1, '#10141c');
  ctx.fillStyle = grad;
  roundRect(ctx, 1, 1, s - 2, s - 2, s * 0.16);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, s * 0.04);
  roundRect(ctx, 1.5, 1.5, s - 3, s - 3, s * 0.16);
  ctx.stroke();
}

type GlyphFn = (ctx: CanvasRenderingContext2D, s: number, color: string) => void;

const GLYPHS: Record<string, GlyphFn> = {
  projectile: (ctx, s, c) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(s * 0.62, s * 0.38, s * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = c;
    ctx.lineWidth = s * 0.07;
    ctx.beginPath();
    ctx.moveTo(s * 0.2, s * 0.8);
    ctx.lineTo(s * 0.5, s * 0.5);
    ctx.stroke();
  },
  'ground-aoe': (ctx, s, c) => {
    ctx.strokeStyle = c;
    ctx.lineWidth = s * 0.06;
    for (const r of [0.16, 0.28]) {
      ctx.beginPath();
      ctx.ellipse(s * 0.5, s * 0.62, s * r * 1.5, s * r * 0.8, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(s * 0.5, s * 0.62, s * 0.06, 0, Math.PI * 2);
    ctx.fill();
  },
  chain: (ctx, s, c) => {
    ctx.strokeStyle = c;
    ctx.lineWidth = s * 0.08;
    ctx.beginPath();
    ctx.moveTo(s * 0.2, s * 0.3);
    ctx.lineTo(s * 0.45, s * 0.5);
    ctx.lineTo(s * 0.3, s * 0.72);
    ctx.lineTo(s * 0.62, s * 0.62);
    ctx.lineTo(s * 0.8, s * 0.78);
    ctx.stroke();
  },
  beam: (ctx, s, c) => {
    ctx.strokeStyle = c;
    ctx.lineWidth = s * 0.1;
    ctx.beginPath();
    ctx.moveTo(s * 0.18, s * 0.78);
    ctx.lineTo(s * 0.82, s * 0.24);
    ctx.stroke();
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(s * 0.82, s * 0.24, s * 0.1, 0, Math.PI * 2);
    ctx.fill();
  },
  'summon-pop': (ctx, s, c) => {
    ctx.fillStyle = c;
    for (const [x, y, r] of [[0.5, 0.45, 0.16], [0.32, 0.68, 0.1], [0.68, 0.68, 0.1]]) {
      ctx.beginPath();
      ctx.arc(s * x, s * y, s * r, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  shield: (ctx, s, c) => {
    ctx.strokeStyle = c;
    ctx.lineWidth = s * 0.07;
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.18);
    ctx.lineTo(s * 0.78, s * 0.32);
    ctx.lineTo(s * 0.72, s * 0.66);
    ctx.lineTo(s * 0.5, s * 0.84);
    ctx.lineTo(s * 0.28, s * 0.66);
    ctx.lineTo(s * 0.22, s * 0.32);
    ctx.closePath();
    ctx.stroke();
  },
  'stun-stars': (ctx, s, c) => {
    ctx.fillStyle = c;
    const star = (cx: number, cy: number, r: number) => {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 === 0 ? r : r * 0.45;
        ctx[i === 0 ? 'moveTo' : 'lineTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
    };
    star(s * 0.42, s * 0.46, s * 0.22);
    star(s * 0.7, s * 0.32, s * 0.12);
  },
  channel: (ctx, s, c) => {
    ctx.strokeStyle = c;
    ctx.lineWidth = s * 0.06;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(s * 0.5, s * 0.5, s * (0.14 + i * 0.11), i * 0.8, i * 0.8 + Math.PI * 1.4);
      ctx.stroke();
    }
  },
  'global-mark': (ctx, s, c) => {
    ctx.strokeStyle = c;
    ctx.lineWidth = s * 0.06;
    ctx.beginPath();
    ctx.arc(s * 0.5, s * 0.5, s * 0.26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.12);
    ctx.lineTo(s * 0.5, s * 0.88);
    ctx.moveTo(s * 0.12, s * 0.5);
    ctx.lineTo(s * 0.88, s * 0.5);
    ctx.stroke();
  },
  hook: (ctx, s, c) => {
    ctx.strokeStyle = c;
    ctx.lineWidth = s * 0.09;
    ctx.beginPath();
    ctx.moveTo(s * 0.25, s * 0.2);
    ctx.lineTo(s * 0.55, s * 0.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(s * 0.55, s * 0.66, s * 0.17, -Math.PI / 2, Math.PI * 0.8);
    ctx.stroke();
  },
  wall: (ctx, s, c) => {
    ctx.fillStyle = c;
    for (let i = 0; i < 4; i++) {
      const x = 0.2 + i * 0.16;
      const h = 0.25 + (i % 2) * 0.12;
      ctx.beginPath();
      ctx.moveTo(s * x, s * 0.8);
      ctx.lineTo(s * (x + 0.07), s * (0.8 - h));
      ctx.lineTo(s * (x + 0.14), s * 0.8);
      ctx.closePath();
      ctx.fill();
    }
  },
  storm: (ctx, s, c) => {
    ctx.strokeStyle = c;
    ctx.lineWidth = s * 0.06;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(s * 0.5, s * 0.5, s * (0.12 + i * 0.12), i, i + Math.PI * (1.2 - i * 0.2));
      ctx.stroke();
    }
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(s * 0.52, s * 0.3);
    ctx.lineTo(s * 0.42, s * 0.52);
    ctx.lineTo(s * 0.52, s * 0.52);
    ctx.lineTo(s * 0.44, s * 0.74);
    ctx.lineTo(s * 0.64, s * 0.48);
    ctx.lineTo(s * 0.53, s * 0.48);
    ctx.lineTo(s * 0.6, s * 0.3);
    ctx.closePath();
    ctx.fill();
  },
  // WS-G archetypes
  vortex: (ctx, s, c) => {
    ctx.strokeStyle = c;
    ctx.lineWidth = s * 0.07;
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      const a = t * Math.PI * 4;
      const r = s * 0.34 * (1 - t);
      const x = s * 0.5 + Math.cos(a) * r;
      const y = s * 0.5 + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  },
  dome: (ctx, s, c) => {
    ctx.strokeStyle = c;
    ctx.lineWidth = s * 0.07;
    ctx.beginPath();
    ctx.arc(s * 0.5, s * 0.66, s * 0.32, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s * 0.16, s * 0.66);
    ctx.lineTo(s * 0.84, s * 0.66);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(s * 0.5, s * 0.66, s * 0.32, s * 0.1, 0, 0, Math.PI * 2);
    ctx.stroke();
  },
  mine: (ctx, s, c) => {
    ctx.strokeStyle = c;
    ctx.lineWidth = s * 0.05;
    ctx.beginPath();
    ctx.arc(s * 0.5, s * 0.5, s * 0.32, 0, Math.PI * 2);
    ctx.setLineDash([s * 0.08, s * 0.06]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(s * 0.5, s * 0.5, s * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.18);
    ctx.lineTo(s * 0.5, s * 0.34);
    ctx.lineWidth = s * 0.06;
    ctx.stroke();
  }
};

// item glyphs reuse + extras
const ITEM_GLYPHS: Record<string, GlyphFn> = {
  leaf: (ctx, s, c) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.ellipse(s * 0.5, s * 0.5, s * 0.3, s * 0.16, -0.7, 0, Math.PI * 2);
    ctx.fill();
  },
  flask: (ctx, s, c) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(s * 0.44, s * 0.2);
    ctx.lineTo(s * 0.56, s * 0.2);
    ctx.lineTo(s * 0.56, s * 0.42);
    ctx.lineTo(s * 0.7, s * 0.74);
    ctx.arc(s * 0.5, s * 0.74, s * 0.2, 0, Math.PI);
    ctx.lineTo(s * 0.44, s * 0.42);
    ctx.closePath();
    ctx.fill();
  },
  branch: (ctx, s, c) => {
    ctx.strokeStyle = c;
    ctx.lineWidth = s * 0.07;
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.85);
    ctx.lineTo(s * 0.5, s * 0.3);
    ctx.moveTo(s * 0.5, s * 0.55);
    ctx.lineTo(s * 0.32, s * 0.38);
    ctx.moveTo(s * 0.5, s * 0.45);
    ctx.lineTo(s * 0.68, s * 0.3);
    ctx.stroke();
  },
  ring: (ctx, s, c) => {
    ctx.strokeStyle = c;
    ctx.lineWidth = s * 0.09;
    ctx.beginPath();
    ctx.arc(s * 0.5, s * 0.55, s * 0.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(s * 0.5, s * 0.3, s * 0.08, 0, Math.PI * 2);
    ctx.fill();
  },
  crown: (ctx, s, c) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(s * 0.22, s * 0.7);
    ctx.lineTo(s * 0.22, s * 0.4);
    ctx.lineTo(s * 0.38, s * 0.55);
    ctx.lineTo(s * 0.5, s * 0.3);
    ctx.lineTo(s * 0.62, s * 0.55);
    ctx.lineTo(s * 0.78, s * 0.4);
    ctx.lineTo(s * 0.78, s * 0.7);
    ctx.closePath();
    ctx.fill();
  },
  fist: (ctx, s, c) => {
    ctx.fillStyle = c;
    roundRect(ctx, s * 0.3, s * 0.35, s * 0.4, s * 0.34, s * 0.08);
    ctx.fill();
    roundRect(ctx, s * 0.24, s * 0.42, s * 0.12, s * 0.2, s * 0.05);
    ctx.fill();
  },
  boot: (ctx, s, c) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(s * 0.38, s * 0.2);
    ctx.lineTo(s * 0.56, s * 0.2);
    ctx.lineTo(s * 0.56, s * 0.6);
    ctx.lineTo(s * 0.76, s * 0.72);
    ctx.lineTo(s * 0.76, s * 0.8);
    ctx.lineTo(s * 0.38, s * 0.8);
    ctx.closePath();
    ctx.fill();
  },
  mantle: (ctx, s, c) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.18);
    ctx.lineTo(s * 0.74, s * 0.5);
    ctx.lineTo(s * 0.66, s * 0.82);
    ctx.lineTo(s * 0.34, s * 0.82);
    ctx.lineTo(s * 0.26, s * 0.5);
    ctx.closePath();
    ctx.fill();
  },
  band: (ctx, s, c) => {
    ctx.strokeStyle = c;
    ctx.lineWidth = s * 0.1;
    ctx.beginPath();
    ctx.arc(s * 0.5, s * 0.5, s * 0.24, 0.3, Math.PI * 2 - 0.3);
    ctx.stroke();
  },
  blade: (ctx, s, c) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(s * 0.3, s * 0.78);
    ctx.lineTo(s * 0.66, s * 0.2);
    ctx.lineTo(s * 0.76, s * 0.3);
    ctx.lineTo(s * 0.4, s * 0.86);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(s * 0.24, s * 0.66, s * 0.18, s * 0.06);
  },
  hammer: (ctx, s, c) => {
    ctx.fillStyle = c;
    roundRect(ctx, s * 0.3, s * 0.22, s * 0.4, s * 0.24, s * 0.05);
    ctx.fill();
    ctx.fillRect(s * 0.46, s * 0.46, s * 0.08, s * 0.36);
  },
  axe: (ctx, s, c) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(s * 0.42, s * 0.4, s * 0.24, -Math.PI * 0.6, Math.PI * 0.5);
    ctx.lineTo(s * 0.42, s * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(s * 0.5, s * 0.3, s * 0.07, s * 0.52);
  },
  staff: (ctx, s, c) => {
    ctx.strokeStyle = c;
    ctx.lineWidth = s * 0.07;
    ctx.beginPath();
    ctx.moveTo(s * 0.42, s * 0.84);
    ctx.lineTo(s * 0.62, s * 0.24);
    ctx.stroke();
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(s * 0.64, s * 0.2, s * 0.1, 0, Math.PI * 2);
    ctx.fill();
  },
  mask: (ctx, s, c) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.ellipse(s * 0.5, s * 0.48, s * 0.24, s * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#10141c';
    ctx.beginPath();
    ctx.ellipse(s * 0.42, s * 0.42, s * 0.06, s * 0.08, 0, 0, Math.PI * 2);
    ctx.ellipse(s * 0.58, s * 0.42, s * 0.06, s * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  gem: (ctx, s, c) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.2);
    ctx.lineTo(s * 0.74, s * 0.45);
    ctx.lineTo(s * 0.5, s * 0.82);
    ctx.lineTo(s * 0.26, s * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#10141c';
    ctx.lineWidth = s * 0.02;
    ctx.beginPath();
    ctx.moveTo(s * 0.26, s * 0.45);
    ctx.lineTo(s * 0.74, s * 0.45);
    ctx.stroke();
  },
  armor: (ctx, s, c) => GLYPHS.shield(ctx, s, c),
  cloak: (ctx, s, c) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.16);
    ctx.quadraticCurveTo(s * 0.78, s * 0.4, s * 0.7, s * 0.84);
    ctx.lineTo(s * 0.3, s * 0.84);
    ctx.quadraticCurveTo(s * 0.22, s * 0.4, s * 0.5, s * 0.16);
    ctx.fill();
  },
  wand: (ctx, s, c) => {
    ctx.strokeStyle = c;
    ctx.lineWidth = s * 0.07;
    ctx.beginPath();
    ctx.moveTo(s * 0.3, s * 0.76);
    ctx.lineTo(s * 0.64, s * 0.3);
    ctx.stroke();
    ctx.fillStyle = c;
    for (const [x, y] of [[0.7, 0.22], [0.78, 0.34], [0.62, 0.18]]) {
      ctx.beginPath();
      ctx.arc(s * x, s * y, s * 0.035, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  dagger: (ctx, s, c) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.16);
    ctx.lineTo(s * 0.58, s * 0.52);
    ctx.lineTo(s * 0.5, s * 0.6);
    ctx.lineTo(s * 0.42, s * 0.52);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(s * 0.36, s * 0.6, s * 0.28, s * 0.06);
    ctx.fillRect(s * 0.46, s * 0.66, s * 0.08, s * 0.18);
  },
  bar: (ctx, s, c) => {
    ctx.fillStyle = c;
    roundRect(ctx, s * 0.26, s * 0.3, s * 0.48, s * 0.16, s * 0.04);
    ctx.fill();
    roundRect(ctx, s * 0.26, s * 0.54, s * 0.48, s * 0.16, s * 0.04);
    ctx.fill();
  },
  cyclone: (ctx, s, c) => GLYPHS.storm(ctx, s, c),
  gear: (ctx, s, c) => {
    ctx.strokeStyle = c;
    ctx.lineWidth = s * 0.08;
    ctx.beginPath();
    ctx.arc(s * 0.5, s * 0.5, s * 0.18, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(s * 0.5 + Math.cos(a) * s * 0.24, s * 0.5 + Math.sin(a) * s * 0.24);
      ctx.lineTo(s * 0.5 + Math.cos(a) * s * 0.32, s * 0.5 + Math.sin(a) * s * 0.32);
      ctx.stroke();
    }
  },
  drum: (ctx, s, c) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.ellipse(s * 0.5, s * 0.36, s * 0.24, s * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(s * 0.26, s * 0.36, s * 0.48, s * 0.3);
    ctx.beginPath();
    ctx.ellipse(s * 0.5, s * 0.66, s * 0.24, s * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  fang: (ctx, s, c) => {
    ctx.fillStyle = c;
    for (const dx of [-0.1, 0.1]) {
      ctx.beginPath();
      ctx.moveTo(s * (0.45 + dx), s * 0.3);
      ctx.lineTo(s * (0.52 + dx), s * 0.3);
      ctx.lineTo(s * (0.48 + dx), s * 0.7);
      ctx.closePath();
      ctx.fill();
    }
  },
  burst: (ctx, s, c) => {
    ctx.strokeStyle = c;
    ctx.lineWidth = s * 0.05;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(s * 0.5 + Math.cos(a) * s * 0.12, s * 0.5 + Math.sin(a) * s * 0.12);
      ctx.lineTo(s * 0.5 + Math.cos(a) * s * 0.3, s * 0.5 + Math.sin(a) * s * 0.3);
      ctx.stroke();
    }
  }
};

// WS-F: a small secondary mark keyed off the ability's dominant effect, so two
// spells that share a VfxArchetype glyph (e.g. two `projectile`s) still read
// differently in the HUD. Pure-derived; no per-ability art needed.
type EffectMark = 'stun' | 'summon' | 'heal' | 'displace' | 'slow' | 'none';

function dominantEffectMark(def: AbilityDef): EffectMark {
  const nodes: { kind?: string; status?: string }[] = [];
  if (def.effects) nodes.push(...(def.effects as { kind?: string; status?: string }[]));
  if (def.channel?.tick) nodes.push(...(def.channel.tick.effects as { kind?: string; status?: string }[]));
  if (def.toggle) nodes.push(...(def.toggle.effects as { kind?: string; status?: string }[]));
  const has = (pred: (n: { kind?: string; status?: string }) => boolean) => nodes.some(pred);
  if (has((n) => n.kind === 'summon')) return 'summon';
  if (has((n) => n.kind === 'heal')) return 'heal';
  if (has((n) => n.kind === 'status' && (n.status === 'stun' || n.status === 'hex' || n.status === 'root' || n.status === 'frozen'))) return 'stun';
  if (has((n) => n.kind === 'displace')) return 'displace';
  if (has((n) => n.kind === 'status' && n.status === 'slow')) return 'slow';
  return 'none';
}

function drawEffectMark(ctx: CanvasRenderingContext2D, s: number, mark: EffectMark, color: string): void {
  if (mark === 'none') return;
  const cx = s * 0.2;
  const cy = s * 0.2;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = s * 0.04;
  switch (mark) {
    case 'stun': {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * s * 0.08, cy + Math.sin(a) * s * 0.08, s * 0.03, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'summon': {
      for (const [dx, dy] of [[-0.06, 0.04], [0.06, 0.04], [0, -0.06]]) {
        ctx.beginPath();
        ctx.arc(cx + dx * s, cy + dy * s, s * 0.035, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'heal': {
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 0.08); ctx.lineTo(cx, cy + s * 0.08);
      ctx.moveTo(cx - s * 0.08, cy); ctx.lineTo(cx + s * 0.08, cy);
      ctx.stroke();
      break;
    }
    case 'displace': {
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.08, cy + s * 0.05);
      ctx.lineTo(cx + s * 0.08, cy - s * 0.05);
      ctx.lineTo(cx + s * 0.02, cy - s * 0.07);
      ctx.moveTo(cx + s * 0.08, cy - s * 0.05);
      ctx.lineTo(cx + s * 0.06, cy + s * 0.01);
      ctx.stroke();
      break;
    }
    case 'slow': {
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.07, Math.PI * 0.2, Math.PI * 1.6);
      ctx.stroke();
      break;
    }
  }
}

export function abilityIcon(def: AbilityDef, size = 64): string {
  const key = `ab:${def.id}:${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const url = draw(size, (ctx, s) => {
    bg(ctx, s, def.vfx.color, '#1c2433');
    // Glyph hint wins (mirrors item glyphs); else the archetype glyph.
    const glyph = (def.glyph && (GLYPHS[def.glyph] || ITEM_GLYPHS[def.glyph])) || GLYPHS[def.vfx.archetype] || GLYPHS.projectile;
    glyph(ctx, s, def.vfx.color);
    // Per-ability secondary mark so same-archetype spells diverge.
    drawEffectMark(ctx, s, dominantEffectMark(def), def.vfx.color2 ?? '#ffffff');
    if (def.ult) {
      ctx.fillStyle = '#ffd86a';
      ctx.beginPath();
      ctx.arc(s * 0.84, s * 0.16, s * 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  cache.set(key, url);
  return url;
}

const TIER_COLORS: Record<string, string> = {
  consumable: '#9fdc5c',
  component: '#b8c4d8',
  basic: '#7ec8f2',
  core: '#ffd86a'
};

// Neutral items live outside the six-slot tier ladder, so they get their own
// rarity-style ramp (T1 common → T5 gold) instead of a TIER_COLORS lookup.
const NEUTRAL_TIER_COLORS: Record<number, string> = {
  1: '#b8c4d8',
  2: '#9fdc5c',
  3: '#7ec8f2',
  4: '#c98bff',
  5: '#ffd86a'
};

function renderItemIcon(key: string, id: string | undefined, glyph: string | undefined, color: string, size: number): string {
  const hit = cache.get(key);
  if (hit) return hit;
  const url = draw(size, (ctx, s) => {
    bg(ctx, s, color, '#141a26');
    const sil = itemSilhouette(id, glyph);
    if (sil) {
      drawSilhouette(ctx, s, sil, color);
    } else {
      const g = (glyph && ITEM_GLYPHS[glyph]) || ITEM_GLYPHS.gem;
      g(ctx, s, color);
    }
  });
  cache.set(key, url);
  return url;
}

export function itemIcon(def: ItemDef, size = 64): string {
  const color = def.iconColor ?? TIER_COLORS[def.tier] ?? '#ffffff';
  return renderItemIcon(`it:${def.id}:${size}`, def.id, def.glyph, color, size);
}

export function neutralItemIcon(def: NeutralItemDef, size = 64): string {
  const color = NEUTRAL_TIER_COLORS[def.tier] ?? '#c9b98a';
  return renderItemIcon(`nt:${def.id}:${size}`, def.id, def.glyph, color, size);
}

// WS-F: a silhouette-derived bust. The head shape, weapon hint, and a 3-color
// palette grade make the pick/codex/HUD portrait resemble the unit instead of a
// letter-in-a-blob. When a hero GLB is eventually enabled this stays the single
// seam to swap for a live rotating render (GRAPHICS_SPEC §6.1).
export function heroPortrait(palette: [string, string, string], letter: string, size = 72, sil?: SilhouetteSpec): string {
  const key = `hp:${palette.join()}:${letter}:${size}:${sil ? `${sil.build}/${sil.head ?? ''}/${sil.weapon ?? ''}/${(sil.extras ?? []).join('+')}` : ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [p0, p1, p2] = palette;
  const url = draw(size, (ctx, s) => {
    bg(ctx, s, p0, '#1a2030');

    if (!sil) {
      // Legacy letter bust (kept for callers without a silhouette).
      ctx.fillStyle = p0;
      ctx.beginPath();
      ctx.arc(s * 0.5, s * 0.42, s * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(s * 0.24, s * 0.88);
      ctx.quadraticCurveTo(s * 0.5, s * 0.5, s * 0.76, s * 0.88);
      ctx.fill();
      ctx.fillStyle = p2;
      ctx.font = `bold ${s * 0.28}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(letter, s * 0.5, s * 0.46);
      return;
    }

    const cx = s * 0.5;
    // Shoulders / torso, tinted by body shape.
    ctx.fillStyle = p1;
    ctx.beginPath();
    const shoulderW = sil.bodyShape === 'bulky' ? 0.34 : sil.bodyShape === 'robed' ? 0.3 : 0.26;
    ctx.moveTo(cx - s * shoulderW, s * 0.96);
    ctx.quadraticCurveTo(cx, s * 0.56, cx + s * shoulderW, s * 0.96);
    ctx.closePath();
    ctx.fill();

    // Weapon hint behind the head (diagonal).
    if (sil.weapon && sil.weapon !== 'none') {
      ctx.strokeStyle = p2;
      ctx.lineWidth = s * (sil.weapon === 'staff' || sil.weapon === 'totem' ? 0.05 : 0.07);
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.18, s * 0.92);
      ctx.lineTo(cx + s * 0.42, s * 0.2);
      ctx.stroke();
      if (sil.weapon === 'cleaver' || sil.weapon === 'sword') {
        ctx.fillStyle = p2;
        ctx.beginPath();
        ctx.arc(cx + s * 0.42, s * 0.2, s * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Head, shaped by the silhouette head token.
    ctx.fillStyle = p0;
    const hy = s * 0.4;
    const hr = s * 0.18;
    ctx.beginPath();
    switch (sil.head) {
      case 'horned':
      case 'helm':
        ctx.moveTo(cx - hr, hy + hr * 0.6);
        ctx.lineTo(cx - hr, hy - hr * 0.4);
        ctx.lineTo(cx, hy - hr);
        ctx.lineTo(cx + hr, hy - hr * 0.4);
        ctx.lineTo(cx + hr, hy + hr * 0.6);
        ctx.closePath();
        break;
      case 'hood':
        ctx.moveTo(cx - hr, hy + hr);
        ctx.quadraticCurveTo(cx, hy - hr * 1.4, cx + hr, hy + hr);
        ctx.closePath();
        break;
      case 'skull':
        ctx.ellipse(cx, hy, hr * 0.92, hr, 0, 0, Math.PI * 2);
        break;
      default:
        ctx.arc(cx, hy, hr, 0, Math.PI * 2);
    }
    ctx.fill();

    // Horns / crown extras.
    if (sil.head === 'horned' || (sil.extras ?? []).includes('horns')) {
      ctx.fillStyle = p2;
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + dir * hr * 0.7, hy - hr * 0.4);
        ctx.lineTo(cx + dir * hr * 1.5, hy - hr * 1.4);
        ctx.lineTo(cx + dir * hr * 0.4, hy - hr * 0.8);
        ctx.closePath();
        ctx.fill();
      }
    }
    if ((sil.extras ?? []).includes('crown')) {
      ctx.fillStyle = p2;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + i * hr * 0.6 - hr * 0.12, hy - hr * 0.7);
        ctx.lineTo(cx + i * hr * 0.6, hy - hr * 1.25);
        ctx.lineTo(cx + i * hr * 0.6 + hr * 0.12, hy - hr * 0.7);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Glowing eyes — the same cheap "this is a hero" read used by the 3D rig.
    ctx.fillStyle = p2;
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cx + dir * hr * 0.4, hy + hr * 0.05, s * 0.022, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  cache.set(key, url);
  return url;
}
