import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Download, Trash2, Upload } from 'lucide-react';
import type { LibraryImage } from '../types';
import { ViewHeader } from '../components/ViewHeader';
import { Button } from '../components/Button';
import { getLibrary, scrapePinterest, deleteLibraryImage, uploadImageFiles } from '../lib/api';

interface LibraryViewProps {
  hasApify: boolean;
}

export function LibraryView({ hasApify }: LibraryViewProps) {
  const [images, setImages] = useState<LibraryImage[] | null>(null);
  const [searches, setSearches] = useState('');
  const [count, setCount] = useState(40);
  const [scraping, setScraping] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = () => getLibrary().then(setImages).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const scrape = async () => {
    setError(null);
    setNote(null);
    setScraping(true);
    try {
      // Pinterest searches are comma-separated phrases (each can contain spaces).
      const queries = searches.split(',').map((s) => s.trim()).filter(Boolean);
      const r = await scrapePinterest(queries, count);
      setNote(`Added ${r.added} image${r.added === 1 ? '' : 's'} from ${r.found} found.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setScraping(false);
    }
  };

  // Upload images from the user's device — no Apify key needed. Saved into the
  // "Uploads" pack (shown below), reusable as slide backgrounds.
  const upload = async (fileList: FileList | null) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setError(null);
    setNote(null);
    setUploading(true);
    try {
      const added = await uploadImageFiles(files);
      setNote(
        added.length < files.length
          ? `Uploaded ${added.length} of ${files.length} — some photos were over ~4.5 MB. Try smaller images.`
          : `Uploaded ${added.length} image${added.length === 1 ? '' : 's'}.`
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  const remove = async (id: string) => setImages(await deleteLibraryImage(id));

  // Group by pack, scraped packs first.
  const groups = useMemo(() => {
    const map = new Map<string, LibraryImage[]>();
    for (const img of images || []) {
      if (!map.has(img.pack)) map.set(img.pack, []);
      map.get(img.pack)!.push(img);
    }
    return [...map.entries()];
  }, [images]);

  return (
    <>
      <ViewHeader
        title="Library"
        subtitle="Background images for your slides. Ships with curated aesthetic packs — upload your own, or scrape more from Pinterest with your own Apify key."
      />

      <div className="flex-1 overflow-y-auto">
        {/* Scrape bar */}
        <div className="px-8 py-4 border-b border-line bg-surface">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-end gap-2 flex-wrap">
              <div className="flex-1 min-w-[220px]">
                <label className="text-[11px] text-ink-5 mb-1 block">Pinterest searches</label>
                <input
                  value={searches}
                  onChange={(e) => setSearches(e.target.value)}
                  placeholder="e.g. dark moody aesthetic, cozy bedroom, foggy mountain"
                  disabled={!hasApify}
                  className="w-full h-9 bg-card border border-line rounded-lg px-3 text-[13px] text-ink placeholder:text-ink-6 outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10 disabled:opacity-50"
                />
              </div>
              <div className="w-24">
                <label className="text-[11px] text-ink-5 mb-1 block">Max</label>
                <input
                  type="number"
                  value={count}
                  min={10}
                  max={200}
                  onChange={(e) => setCount(Number(e.target.value))}
                  onBlur={() => setCount((c) => Math.min(Math.max(c || 10, 10), 200))}
                  disabled={!hasApify}
                  className="w-full h-9 bg-card border border-line rounded-lg px-3 text-[13px] text-ink outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10 disabled:opacity-50"
                />
                <span className="text-[10px] text-ink-6 mt-1 block">min 10</span>
              </div>
              <Button
                variant="primary"
                size="lg"
                icon={scraping ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                onClick={scrape}
                disabled={!hasApify || scraping || !searches.trim()}
              >
                {scraping ? 'Scraping…' : 'Scrape Pinterest'}
              </Button>
              <Button
                variant="secondary"
                size="lg"
                icon={uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
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
                  upload(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>
            {!hasApify && (
              <p className="text-[12px] text-ink-5 mt-2">
                Add your Apify API key in Settings to scrape Pinterest. The bundled packs below work without it.
              </p>
            )}
            {note && <p className="text-[12px] text-emerald-600 mt-2">{note}</p>}
            {error && <p className="text-[12px] text-red-600 mt-2">{error}</p>}
          </div>
        </div>

        {/* Packs */}
        <div className="p-8">
          <div className="max-w-5xl mx-auto space-y-8">
            {images === null ? (
              <div className="flex items-center justify-center py-16 text-ink-5 text-[13px] gap-2">
                <Loader2 size={14} className="animate-spin" /> Loading library…
              </div>
            ) : (
              groups.map(([pack, imgs]) => (
                <div key={pack}>
                  <div className="flex items-baseline gap-3 mb-3">
                    <h2 className="text-[13px] font-semibold text-ink uppercase tracking-widest">{pack}</h2>
                    <span className="text-[11px] text-ink-6">{imgs.length}</span>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                    {imgs.map((img) => (
                      <div key={img.id} className="group relative aspect-[9/16] rounded-lg overflow-hidden bg-raised">
                        <img src={img.url} alt="" loading="lazy" className="w-full h-full object-cover" />
                        {img.source === 'scraped' && (
                          <button
                            onClick={() => remove(img.id)}
                            aria-label="Remove image"
                            className="absolute top-1 right-1 w-6 h-6 rounded-md bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
