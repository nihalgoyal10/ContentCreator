export type ViewKey = 'queue' | 'library' | 'schedule' | 'results' | 'brain' | 'settings';

// Aspect ratio of the exported slides (all slides in a show share one).
export type SlideRatio = '9:16' | '4:5' | '1:1';

// Per-slide caption styling. All sizes are expressed in pixels of the exported
// image (which is a fixed 1080px wide, so they stay stable across ratios). Both
// the on-screen preview and the baked PNG read these — see lib/slideStyle.ts.
export interface TextStyle {
  font: string;        // font key from lib/fonts.ts (e.g. 'tiktok-sans')
  weight: number;      // 300–900
  sizePx: number;      // caption font size, px in the 1080-wide export
  color: string;       // text fill, hex
  strokePx: number;    // outline width, px (0 = no outline)
  strokeColor: string; // outline colour, hex
  bg: 'none' | 'solid' | 'snapchat'; // text background box
  bgColor: string;     // box colour when bg === 'solid'
}

export interface Slide {
  id: string;
  text: string;
  // Generated slides have no source image — they're rendered from text over a
  // gradient. `imageUrl` is kept optional for backwards-compat / future use.
  imageUrl?: string;
  bgFrom?: string;
  bgTo?: string;
  // Caption styling override. Partial so older slides fall back to defaults.
  style?: Partial<TextStyle>;
}

export interface Slideshow {
  id: string;
  hook: string;
  caption: string;
  hashtags: string[];
  slides: Slide[];
  createdAt: string;
  rationale: string;
  ratio?: SlideRatio; // defaults to 9:16 when absent
}

export interface BrainState {
  niche: string;
  appName: string;
  appDescription: string;
  audience: string;
  styleMemory: string;
}

export interface ProjectDefaults {
  socialAccountIds: number[];
  mode: 'draft' | 'schedule';
}

export interface Project {
  id: string;
  name: string;
  brain: BrainState;
  defaults: ProjectDefaults;
  imagePacks: string[]; // background packs generation draws from ([] = gradients only)
}

export interface AppConfig {
  keys: { postbridge: string; openrouter: string; apify: string };
  model: string;
  pinterestActor: string;
  projects: Project[];
  activeProjectId: string;
}

export interface LibraryImage {
  id: string;
  url: string;
  pack: string;
  source: 'bundled' | 'scraped';
}

export interface LibraryPack {
  name: string;
  source: 'bundled' | 'scraped';
  count: number;
  covers: string[];
}

export interface ModelOption {
  id: string;
  name: string;
}

export interface SocialAccount {
  id: number;
  platform: string;
  username: string;
}

// Shapes returned by post-bridge (mapped in lib/api.ts).
export interface ScheduledPost {
  id: string;
  caption: string;
  status: string; // scheduled | processing | posted | draft
  scheduledAt: string | null;
  mediaUrls: string[];
  socialAccounts: number[];
  isDraft: boolean;
}

export interface PostResult {
  id: string;
  platform: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  coverImageUrl: string | null;
  shareUrl: string | null;
  description: string | null;
  lastSyncedAt: string | null;
}
