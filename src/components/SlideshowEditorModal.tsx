import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { X, Loader2, ChevronLeft, ChevronRight, Trash2, Shuffle, Upload, Image as ImageIcon, Type } from 'lucide-react';
import type { Slideshow, Slide, LibraryImage, SlideRatio, TextStyle } from '../types';
import { Button } from './Button';
import { SlidePreview } from './SlidePreview';
import { getLibrary, uploadLibraryImages } from '../lib/api';
import { textStyleOf, RATIOS, DEFAULT_RATIO } from '../lib/slideStyle';
import { FONTS, fontDef, nearestWeight, loadFont } from '../lib/fonts';

interface SlideshowEditorModalProps {
  slideshow: Slideshow;
  onClose: () => void;
  onSave: (patch: { slides: Slide[]; caption: string; hashtags: string[]; ratio: SlideRatio }) => Promise<void>;
}

type Tab = 'post' | 'slide';

const WEIGHT_LABELS: Record<number, string> = {
  300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Extrabold', 900: 'Black',
};

export function SlideshowEditorModal({ slideshow, onClose, onSave }: SlideshowEditorModalProps) {
  const [slides, setSlides] = useState<Slide[]>(slideshow.slides.map((s) => ({ ...s })));
  const [caption, setCaption] = useState(slideshow.caption);
  const [hashtags, setHashtags] = useState(slideshow.hashtags.join(' '));
  const [ratio, setRatio] = useState<SlideRatio>(slideshow.ratio || DEFAULT_RATIO);
  const [index, setIndex] = useState(0);
  const [tab, setTab] = useState<Tab>('post');
  const [library, setLibrary] = useState<LibraryImage[] | null>(null);
  const [pack, setPack] = useState('all');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [applyAll, setApplyAll] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getLibrary().then(setLibrary).catch(() => setLibrary([]));
  }, []);

  const total = slides.length;
  const current = slides[index];
  const style = textStyleOf(current);

  // Make sure the current slide's caption font is fetched so the preview shows it.
  useEffect(() => { loadFont(style.font); }, [style.font]);

  const packs = useMemo(
    () => ['all', ...Array.from(new Set((library || []).map((i) => i.pack)))],
    [library]
  );
  const filtered = useMemo(
    () => (library || []).filter((i) => pack === 'all' || i.pack === pack),
    [library, pack]
  );

  const patchSlide = (patch: Partial<Slide>) =>
    setSlides((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  // Apply a caption-style change to the current slide — or every slide when
  // "Apply to all" is on. Merges onto each slide's fully-resolved style.
  const patchStyle = (patch: Partial<TextStyle>) =>
    setSlides((prev) =>
      prev.map((s, i) =>
        applyAll || i === index ? { ...s, style: { ...textStyleOf(s), ...patch } } : s
      )
    );

  const toggleApplyAll = () => {
    const next = !applyAll;
    setApplyAll(next);
    // Turning it on syncs every slide to the current slide's style.
    if (next) {
      const cur = textStyleOf(slides[index]);
      setSlides((prev) => prev.map((s) => ({ ...s, style: { ...cur } })));
    }
  };

  const setFont = (font: string) => {
    loadFont(font);
    patchStyle({ font, weight: nearestWeight(font, style.weight) });
  };

  // Upload images from the user's device: read each as a data URL, save them to
  // the library (persisted server-side), then show them and apply the first to
  // this slide.
  const handleUpload = async (fileList: FileList | null) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const encoded = await Promise.all(
        files.map(
          (f) =>
            new Promise<{ mimeType: string; data: string }>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve({ mimeType: f.type, data: String(reader.result) });
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(f);
            })
        )
      );
      const added = await uploadLibraryImages(encoded);
      if (added.length) {
        setLibrary((prev) => [...added, ...(prev || [])]);
        setPack(added[0].pack);
        patchSlide({ imageUrl: added[0].url });
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const shuffleBackgrounds = () => {
    const pool = filtered;
    if (!pool.length) return;
    setSlides((prev) => prev.map((s) => ({ ...s, imageUrl: pool[Math.floor(Math.random() * pool.length)].url })));
  };

  const deleteSlide = () => {
    if (total <= 1) return;
    setSlides((prev) => prev.filter((_, i) => i !== index));
    setIndex((i) => Math.max(0, Math.min(i, total - 2)));
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave({
        slides,
        caption,
        hashtags: hashtags.split(/[\s,]+/).map((t) => t.replace(/^#/, '')).filter(Boolean),
        ratio,
      });
    } finally {
      setSaving(false);
    }
  };

  const weights = fontDef(style.font).weights;
  const weightIdx = Math.max(0, weights.indexOf(style.weight));

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-line rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col sm:flex-row overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Preview */}
        <div className="sm:flex-1 bg-surface flex flex-col items-center justify-center p-6 gap-3 min-w-0">
          <div className="w-[200px] max-w-full">
            <SlidePreview slide={current} ratio={ratio} />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
              className="w-9 h-9 rounded-full bg-card border border-line text-ink-4 hover:text-ink disabled:opacity-30 flex items-center justify-center"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex gap-1.5">
              {slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIndex(i)}
                  className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-ink' : 'w-1.5 bg-line-2'}`}
                  aria-label={`Slide ${i + 1}`}
                />
              ))}
            </div>
            <button
              onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
              disabled={index === total - 1}
              className="w-9 h-9 rounded-full bg-card border border-line text-ink-4 hover:text-ink disabled:opacity-30 flex items-center justify-center"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <span className="text-[11px] text-ink-6 tabular-nums">{index + 1} / {total}</span>
        </div>

        {/* Editor panel */}
        <div className="w-full sm:w-96 flex flex-col border-t sm:border-t-0 sm:border-l border-line min-h-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-line">
            <div className="flex gap-1">
              {(['post', 'slide'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-colors ${
                    tab === t ? 'bg-raised text-ink' : 'text-ink-5 hover:text-ink-3'
                  }`}
                >
                  {t === 'post' ? 'Post' : `Slide ${index + 1}`}
                </button>
              ))}
            </div>
            <button onClick={onClose} className="text-ink-5 hover:text-ink">
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {tab === 'post' ? (
              <>
                <Field label="Caption">
                  <textarea
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    rows={5}
                    className="w-full bg-card border border-line rounded-lg px-3 py-2 text-[13px] text-ink resize-none outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10"
                  />
                  <span className="text-[10px] text-ink-6">{caption.length} chars</span>
                </Field>
                <Field label="Hashtags">
                  <input
                    value={hashtags}
                    onChange={(e) => setHashtags(e.target.value)}
                    placeholder="finance budgeting money"
                    className="w-full h-9 bg-card border border-line rounded-lg px-3 text-[13px] text-ink outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10"
                  />
                  <span className="text-[10px] text-ink-6">Space or comma separated, no # needed.</span>
                </Field>
                <Field label="Slide ratio">
                  <select
                    value={ratio}
                    onChange={(e) => setRatio(e.target.value as SlideRatio)}
                    className="w-full h-9 bg-card border border-line rounded-lg px-2 text-[13px] text-ink outline-none focus:border-ink-7"
                  >
                    {(Object.keys(RATIOS) as SlideRatio[]).map((r) => (
                      <option key={r} value={r}>{RATIOS[r].label}</option>
                    ))}
                  </select>
                  <span className="text-[10px] text-ink-6">Applies to every slide in this slideshow.</span>
                </Field>
              </>
            ) : (
              <>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] text-ink-6 uppercase tracking-widest font-semibold">Slide {index + 1} text</label>
                    {total > 1 && (
                      <button onClick={deleteSlide} className="text-[10px] text-ink-6 hover:text-red-600 flex items-center gap-1">
                        <Trash2 size={11} /> Delete slide
                      </button>
                    )}
                  </div>
                  <textarea
                    value={current.text}
                    onChange={(e) => patchSlide({ text: e.target.value })}
                    rows={3}
                    className="w-full bg-card border border-line rounded-lg px-3 py-2 text-[13px] text-ink resize-none outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10"
                  />
                </div>

                {/* ── Text styling ─────────────────────────────────────────── */}
                <div className="space-y-4 border-t border-line pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
                      <Type size={13} /> Text
                    </div>
                    <label className="flex items-center gap-1.5 text-[11px] text-ink-5 cursor-pointer select-none">
                      <input type="checkbox" checked={applyAll} onChange={toggleApplyAll} className="cursor-pointer" />
                      Apply to all slides
                    </label>
                  </div>

                  <Field label="Font">
                    <select
                      value={style.font}
                      onChange={(e) => setFont(e.target.value)}
                      className="w-full h-9 bg-card border border-line rounded-lg px-2 text-[13px] text-ink outline-none focus:border-ink-7"
                    >
                      {FONTS.map((f) => (
                        <option key={f.key} value={f.key}>{f.label}</option>
                      ))}
                    </select>
                  </Field>

                  <Field label={`Weight: ${WEIGHT_LABELS[style.weight] || style.weight}`}>
                    <input
                      type="range"
                      min={0}
                      max={weights.length - 1}
                      step={1}
                      value={weightIdx}
                      disabled={weights.length <= 1}
                      onChange={(e) => patchStyle({ weight: weights[Number(e.target.value)] })}
                      className="w-full accent-ink disabled:opacity-40"
                    />
                  </Field>

                  <Field label={`Size: ${style.sizePx}px`}>
                    <input
                      type="range" min={24} max={160} step={2} value={style.sizePx}
                      onChange={(e) => patchStyle({ sizePx: Number(e.target.value) })}
                      className="w-full accent-ink"
                    />
                  </Field>

                  <Field label="Text colour">
                    <ColorField value={style.color} onChange={(color) => patchStyle({ color })} />
                  </Field>

                  <Field label={`Stroke: ${style.strokePx}px`}>
                    <input
                      type="range" min={0} max={24} step={1} value={style.strokePx}
                      onChange={(e) => patchStyle({ strokePx: Number(e.target.value) })}
                      className="w-full accent-ink"
                    />
                  </Field>

                  <Field label="Stroke colour">
                    <ColorField value={style.strokeColor} onChange={(strokeColor) => patchStyle({ strokeColor })} />
                  </Field>

                  <Field label="Text background">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Segmented active={style.bg === 'solid'} onClick={() => patchStyle({ bg: 'solid', bgColor: style.bg === 'solid' ? style.bgColor : '#ffffff' })}>White</Segmented>
                      <Segmented active={style.bg === 'none'} onClick={() => patchStyle({ bg: 'none' })}>None</Segmented>
                      <Segmented active={style.bg === 'snapchat'} onClick={() => patchStyle({ bg: 'snapchat' })}>Snapchat</Segmented>
                    </div>
                    {style.bg === 'solid' && (
                      <ColorField value={style.bgColor} onChange={(bgColor) => patchStyle({ bgColor })} />
                    )}
                  </Field>
                </div>

                {/* ── Background image ─────────────────────────────────────── */}
                <div className="border-t border-line pt-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] text-ink-6 uppercase tracking-widest font-semibold">Background</label>
                    <select
                      value={pack}
                      onChange={(e) => setPack(e.target.value)}
                      className="h-7 bg-card border border-line rounded-md px-1.5 text-[11px] text-ink outline-none"
                    >
                      {packs.map((p) => (
                        <option key={p} value={p}>{p === 'all' ? 'All packs' : p}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <Button variant="ghost" size="sm" icon={<ImageIcon size={12} />} onClick={() => patchSlide({ imageUrl: undefined })}>
                      Gradient
                    </Button>
                    <Button variant="ghost" size="sm" icon={<Shuffle size={12} />} onClick={shuffleBackgrounds}>
                      Shuffle all
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                      onClick={() => fileInput.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? 'Uploading…' : 'Upload'}
                    </Button>
                    <input
                      ref={fileInput}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      multiple
                      hidden
                      onChange={(e) => {
                        handleUpload(e.target.files);
                        e.target.value = '';
                      }}
                    />
                  </div>
                  {library === null ? (
                    <div className="flex items-center justify-center py-6 text-ink-5 text-[12px] gap-2">
                      <Loader2 size={13} className="animate-spin" /> Loading…
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-1.5 max-h-64 overflow-y-auto">
                      {filtered.map((img) => (
                        <button
                          key={img.id}
                          onClick={() => patchSlide({ imageUrl: img.url })}
                          className={`aspect-[9/16] rounded-md overflow-hidden bg-raised transition-all ${
                            current.imageUrl === img.url ? 'ring-2 ring-ink' : 'hover:ring-2 hover:ring-line-2'
                          }`}
                        >
                          <img src={img.url} alt="" loading="lazy" className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="px-4 py-3 border-t border-line flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button
              variant="primary"
              icon={saving ? <Loader2 size={13} className="animate-spin" /> : undefined}
              onClick={save}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-[11px] text-ink-6 uppercase tracking-widest font-semibold mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}

function ColorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-9 h-9 shrink-0 rounded-md border border-line bg-card p-0.5 cursor-pointer"
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="flex-1 h-9 bg-card border border-line rounded-lg px-3 text-[12px] font-mono uppercase text-ink outline-none focus:border-ink-7"
      />
    </div>
  );
}

function Segmented({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 h-8 rounded-md text-[12px] font-medium border transition-colors ${
        active ? 'bg-ink text-card border-ink' : 'bg-card text-ink-4 border-line hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}
