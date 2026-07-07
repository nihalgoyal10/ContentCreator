// Single source of truth for slide geometry + caption styling defaults. Both
// the editor preview (SlidePreview.tsx, CSS) and the exported PNG (render.ts,
// canvas) import from here so a slide looks pixel-equivalent in both.
//
// Text sizes are stored in *export pixels* against a fixed 1080px-wide canvas.
// Width is constant across every ratio, so a given sizePx renders the same
// physical text whether the slide is 9:16, 4:5 or 1:1. The preview reproduces
// those pixels with container-query-width units (cqw = percent of slide width).
import type { Slide, TextStyle, SlideRatio } from '../types';

// Every export is BASE_W wide; height comes from the ratio.
export const BASE_W = 1080;

export const RATIOS: Record<SlideRatio, { w: number; h: number; css: string; label: string }> = {
  '9:16': { w: BASE_W, h: 1920, css: '9 / 16', label: '9:16 — Reels / TikTok / Shorts' },
  '4:5': { w: BASE_W, h: 1350, css: '4 / 5', label: '4:5 — Portrait feed' },
  '1:1': { w: BASE_W, h: 1080, css: '1 / 1', label: '1:1 — Square' },
};

export const DEFAULT_RATIO: SlideRatio = '9:16';
export function ratioOf(show: { ratio?: SlideRatio }): SlideRatio {
  return show.ratio && RATIOS[show.ratio] ? show.ratio : DEFAULT_RATIO;
}

// Defaults reproduce the original look exactly: 52px white Inter, 4px black
// outline, no text box — a clean TikTok caption.
export const DEFAULT_TEXT_STYLE: TextStyle = {
  font: 'inter',
  weight: 800,
  sizePx: 52,
  color: '#ffffff',
  strokePx: 4,
  strokeColor: '#000000',
  bg: 'none',
  bgColor: '#ffffff',
};

export function textStyleOf(slide: Slide): TextStyle {
  return { ...DEFAULT_TEXT_STYLE, ...(slide.style || {}) };
}

// Line-height multiple + side safe-zone, shared by both renderers.
export const LINE_HEIGHT = 1.2;
export const SIDE_PAD_PCT = 8; // percent of width, each side

// Text-box padding + corner radius, as fractions of the font size (so they use
// `em` in CSS and `fontPx * k` on the canvas — identical geometry).
export const BOX_PAD_X = 0.3;
export const BOX_PAD_Y = 0.14;
export const BOX_RADIUS = 0.18;

// The translucent black pill used by the "Snapchat" preset.
export const SNAPCHAT_BG = 'rgba(0,0,0,0.5)';

// Resolve a text-box's fill (or null when there is no box).
export function boxFill(style: TextStyle): string | null {
  if (style.bg === 'none') return null;
  if (style.bg === 'snapchat') return SNAPCHAT_BG;
  return style.bgColor;
}

// Export pixels (against BASE_W) → preview CSS length in container-query-width
// units, so the preview scales with its own width exactly like the export.
export const cqw = (px: number) => `${(px / BASE_W) * 100}cqw`;
