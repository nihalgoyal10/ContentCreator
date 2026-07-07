// Client-side slide renderer. Each slide becomes a PNG drawn on a canvas — text
// over a gradient or image. No image-generation API, no cost, deterministic
// output. The resulting data URLs are sent to the server, which uploads them to
// post-bridge as the post's media.
//
// Caption geometry + styling (font, weight, size, colour, stroke, text box) come
// from the slide's own TextStyle via lib/slideStyle.ts — the SAME values the
// editor preview uses — so the scheduled PNG matches what the user saw.
import type { Slide, Slideshow, SlideRatio } from '../types';
import {
  RATIOS, ratioOf, textStyleOf, LINE_HEIGHT, SIDE_PAD_PCT,
  BOX_PAD_X, BOX_PAD_Y, BOX_RADIUS, boxFill,
} from './slideStyle';
import { fontFamily, ensureFontReady } from './fonts';

// Word-wrap within hard newlines, mirroring the preview's wrapping.
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph.trim()) { out.push(''); continue; }
    const words = paragraph.split(/\s+/);
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        out.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image load failed: ${src}`));
    img.src = src;
  });
}

// Draw an image to cover the whole canvas (object-fit: cover).
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, W: number, H: number) {
  const scale = Math.max(W / img.width, H / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

export async function renderSlide(slide: Slide, ratio: SlideRatio): Promise<string> {
  const { w: W, h: H } = RATIOS[ratio];
  const style = textStyleOf(slide);

  // Make sure the exact caption font+weight is ready, else the first bake falls
  // back to a system font.
  await ensureFontReady(style.font, style.weight, style.sizePx);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  if (slide.imageUrl) {
    // Image background (same-origin: bundled at /library/… or scraped via /api/…).
    try {
      const img = await loadImage(slide.imageUrl);
      drawCover(ctx, img, W, H);
      // Darken so light text stays readable.
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, W, H);
    } catch {
      ctx.fillStyle = slide.bgFrom || '#0f172a';
      ctx.fillRect(0, 0, W, H);
    }
  } else {
    // Gradient background
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, slide.bgFrom || '#0f172a');
    grad.addColorStop(1, slide.bgTo || '#1e293b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    // Subtle vignette for depth
    const vig = ctx.createRadialGradient(W / 2, H / 2, H / 3, W / 2, H / 2, H);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
  }

  // Caption — every dimension comes from the slide's TextStyle. Font size and
  // stroke are already in export pixels (1080-wide basis), so no scaling.
  const fontPx = style.sizePx;
  const lineHeight = Math.round(fontPx * LINE_HEIGHT);
  const strokeW = Math.max(0, style.strokePx);

  ctx.font = `${style.weight} ${fontPx}px "${fontFamily(style.font)}", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  const maxWidth = W * (1 - 2 * (SIDE_PAD_PCT / 100));
  const lines = wrap(ctx, slide.text || '', maxWidth);
  const blockH = lines.length * lineHeight;
  const startY = (H - blockH) / 2; // vertically centered, matching the preview
  const x = W / 2;

  // Text-box background behind the whole caption block.
  const fill = boxFill(style);
  if (fill && lines.length) {
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const padX = fontPx * BOX_PAD_X;
    const padY = fontPx * BOX_PAD_Y;
    roundRect(ctx, x - widest / 2 - padX, startY - padY, widest + padX * 2, blockH + padY * 2, fontPx * BOX_RADIUS);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  for (let i = 0; i < lines.length; i++) {
    const y = startY + i * lineHeight;
    // Paint stroke first, fill on top — same as CSS paint-order: stroke fill.
    if (strokeW > 0) {
      ctx.strokeStyle = style.strokeColor;
      ctx.lineWidth = strokeW;
      ctx.strokeText(lines[i], x, y);
    }
    ctx.fillStyle = style.color;
    ctx.fillText(lines[i], x, y);
  }

  return canvas.toDataURL('image/png');
}

export async function renderSlideshow(show: Slideshow): Promise<string[]> {
  const ratio = ratioOf(show);
  const out: string[] = [];
  for (const slide of show.slides) {
    out.push(await renderSlide(slide, ratio));
  }
  return out;
}
