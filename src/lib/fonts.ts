// Font catalogue for slide captions. Everything here is served by Google Fonts
// and loaded on demand (one <link> per family, deduped). Fonts do NOT taint the
// export canvas — only cross-origin images do — so captions in any of these
// render cleanly into the downloaded/scheduled PNG.
//
// `weights` lists the weights each family actually ships, so the css2 request is
// always valid and the weight slider only offers real options.
export interface FontDef {
  key: string;
  label: string;
  family: string;   // CSS font-family name
  weights: number[];
}

export const FONTS: FontDef[] = [
  { key: 'inter', label: 'Inter', family: 'Inter', weights: [400, 500, 600, 700, 800, 900] },
  { key: 'tiktok-sans', label: 'TikTok Sans', family: 'TikTok Sans', weights: [400, 500, 600, 700, 800, 900] },
  { key: 'public-sans', label: 'Public Sans', family: 'Public Sans', weights: [400, 500, 600, 700, 800, 900] },
  { key: 'montserrat', label: 'Montserrat', family: 'Montserrat', weights: [400, 500, 600, 700, 800, 900] },
  { key: 'poppins', label: 'Poppins', family: 'Poppins', weights: [400, 500, 600, 700, 800] },
  { key: 'roboto', label: 'Roboto', family: 'Roboto', weights: [400, 500, 700, 900] },
  { key: 'oswald', label: 'Oswald', family: 'Oswald', weights: [400, 500, 600, 700] },
  { key: 'bebas-neue', label: 'Bebas Neue', family: 'Bebas Neue', weights: [400] },
  { key: 'anton', label: 'Anton', family: 'Anton', weights: [400] },
  { key: 'archivo-black', label: 'Archivo Black', family: 'Archivo Black', weights: [400] },
  { key: 'playfair', label: 'Playfair Display', family: 'Playfair Display', weights: [400, 500, 600, 700, 800, 900] },
];

export function fontDef(key: string): FontDef {
  return FONTS.find((f) => f.key === key) || FONTS[0];
}

export function fontFamily(key: string): string {
  return fontDef(key).family;
}

// Snap an arbitrary weight to the nearest weight the family actually offers.
export function nearestWeight(key: string, weight: number): number {
  const w = fontDef(key).weights;
  return w.reduce((best, cur) => (Math.abs(cur - weight) < Math.abs(best - weight) ? cur : best), w[0]);
}

const injected = new Set<string>();

// Add the Google Fonts stylesheet for a family (once). Cheap no-op if present.
export function loadFont(key: string): void {
  const def = fontDef(key);
  if (injected.has(def.key)) return;
  injected.add(def.key);
  const fam = def.family.replace(/ /g, '+');
  const href = `https://fonts.googleapis.com/css2?family=${fam}:wght@${def.weights.join(';')}&display=swap`;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

// Ensure a specific font+weight is actually ready before drawing to canvas —
// otherwise the first bake can fall back to a system font. Best-effort.
export async function ensureFontReady(key: string, weight: number, sizePx: number): Promise<void> {
  loadFont(key);
  if (!document.fonts?.load) return;
  try {
    await document.fonts.load(`${weight} ${Math.round(sizePx)}px "${fontFamily(key)}"`);
  } catch {
    /* fall back to whatever's available */
  }
}
