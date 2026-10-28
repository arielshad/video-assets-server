/**
 * Collections: curated landing pages (/footage/<slug>) that show a saved
 * search. A topic file (web/src/content/collections/<slug>.md) holds the
 * editorial copy and the search; scripts/snapshot-collections.mjs runs that
 * search and saves the results here as a snapshot
 * (web/src/data/collections/<slug>.json), which the website pre-renders.
 *
 * Snapshots are kept stable on purpose: clips already on a page keep their
 * place while the search still finds them, and new ones only fill free slots.
 * A page that reshuffles every day looks unreliable to search engines and to
 * readers. `updatedAt` moves only when the list really changes, so the
 * sitemap's lastmod stays honest.
 */

import type { SearchRequest, SearchResponse } from "./service.js";
import type { Category, Clip, CommercialVerdict, Orientation, Pricing, VideoStyle } from "./types.js";
import { COMMERCIAL_SAFE } from "./licence.js";
import { parseQuery } from "./query.js";
import { matchScore } from "./util.js";
import { categoryLabel } from "./vocab.js";

/** Most clips shown on one collection page. */
export const MAX_ASSETS = 36;
/** Below this many clips (or sources), a page is `noindex` and new topics are refused. */
export const MIN_INDEXABLE = 12;
export const MIN_SOURCES = 2;
/**
 * Results whose text matches less of the query than this are left out: every
 * query word must be in the title or tags (a title that only starts with it
 * scores 0.5).
 */
const MIN_RELEVANCE = 0.7;
/** No single source may fill more than this share of a page. */
const MAX_SOURCE_SHARE = 0.4;

export interface CollectionSearch {
  q: string;
  categories?: Category[];
  styles?: VideoStyle[];
  orientations?: Orientation[];
  /** Minimum short side in pixels (720, 1080, 2160). */
  minResolution?: number;
  free?: boolean;
  /** Only clips whose licence allows a commercial release (yes / yes-with-credit). */
  commercial?: boolean;
  downloadable?: boolean;
  providers?: string[];
  /** Editorial blocklist: title phrases (case-insensitive) or clip ids that never belong on the page. */
  exclude?: string[];
}

/** The part of a Clip a collection page shows (no descriptions: they are the source's copy). */
export interface SnapshotClip {
  id: string;
  provider: string;
  title: string;
  category: Category;
  styles?: VideoStyle[];
  url: string;
  /** Still frame (https). Clips without a poster or a preview are not shown on static pages. */
  posterUrl?: string;
  /** Small playable version (https), played from the source on hover. */
  previewUrl?: string;
  previewType?: string;
  author?: string;
  license?: { id: string; name: string; url?: string; verdict: CommercialVerdict; attributionRequired?: boolean; editorial?: boolean };
  free?: boolean;
  formats?: string[];
  orientation?: Orientation;
  width?: number;
  height?: number;
  fps?: number;
  durationSec?: number;
  year?: number;
  downloadable: boolean;
}

export interface CollectionSnapshot {
  slug: string;
  search: CollectionSearch;
  /** When the list of clips last changed (ISO date-time). */
  updatedAt: string;
  clips: SnapshotClip[];
}

export interface SnapshotResult {
  snapshot: CollectionSnapshot;
  changed: boolean;
  /** Sources that failed or timed out this run (their previous clips were kept). */
  failed: string[];
  kept: number;
  added: number;
  dropped: number;
  /** Clips skipped because their preview no longer loads. */
  brokenMedia: number;
}

const https = (u: string | undefined): u is string => !!u && /^https:\/\//.test(u);

export function toSnapshotClip(a: Clip): SnapshotClip | undefined {
  // A static page needs something to show: a poster or a preview, both https.
  if (!a.title?.trim() || (!https(a.posterUrl) && !https(a.previewUrl))) return undefined;
  const out: SnapshotClip = {
    id: a.id,
    provider: a.provider,
    title: a.title.trim(),
    category: a.category,
    url: a.url,
    downloadable: a.downloadable,
  };
  if (a.styles?.length) out.styles = a.styles;
  if (https(a.posterUrl)) out.posterUrl = a.posterUrl;
  if (https(a.previewUrl)) {
    out.previewUrl = a.previewUrl;
    if (a.previewType) out.previewType = a.previewType;
  }
  if (a.author) out.author = a.author;
  if (a.license) {
    const { id, name, url, verdict, attributionRequired, editorial } = a.license;
    out.license = {
      id,
      name,
      ...(url ? { url } : {}),
      verdict,
      ...(attributionRequired !== undefined ? { attributionRequired } : {}),
      ...(editorial ? { editorial } : {}),
    };
  }
  if (a.price) out.free = a.price.free;
  if (a.formats?.length) out.formats = a.formats.slice(0, 6);
  if (a.orientation) out.orientation = a.orientation;
  if (a.width && a.height) {
    out.width = a.width;
    out.height = a.height;
  }
  if (a.fps) out.fps = a.fps;
  if (a.durationSec) out.durationSec = a.durationSec;
  if (a.year) out.year = a.year;
  return out;
}

/** True when a clip belongs on a "free" page: free by its own price, or from a free-only source. */
function isFree(a: Clip, pricing: ReadonlyMap<string, Pricing>): boolean {
  return a.price ? a.price.free : pricing.get(a.provider) === "free";
}

/**
 * Merge this run's results into the previous list.
 *  1. Fresh candidates: relevant, with a playable preview, free and commercial-safe when the search asks for it, one per id and title.
 *  2. Previous clips keep their order while they are still candidates, or while their source failed this run.
 *  3. New candidates fill the remaining slots in ranking order; no source takes more than 40% of the page.
 */
export function selectClips(
  fresh: Clip[],
  opts: { search: CollectionSearch; previous?: SnapshotClip[]; failed?: ReadonlySet<string>; pricing: ReadonlyMap<string, Pricing>; max?: number },
): SnapshotClip[] {
  const max = opts.max ?? MAX_ASSETS;
  const perSource = Math.max(1, Math.floor(max * MAX_SOURCE_SHARE));
  const exclude = (opts.search.exclude ?? []).map((e) => e.toLowerCase());
  const excluded = (a: { id: string; title: string }) => exclude.some((e) => a.id.toLowerCase() === e || a.title.toLowerCase().includes(e));
  const seenTitles = new Set<string>();
  const candidates = new Map<string, SnapshotClip>();
  // Relevance is checked against the words left after filter words are parsed
  // out, as the search does: "vertical" alone is the portrait filter, not a title word.
  const words = parseQuery(opts.search.q).query;
  for (const a of fresh) {
    if (candidates.has(a.id) || excluded(a)) continue;
    // The category counts as a tag ("ocean" finds a nature.ocean clip titled "Waves at Big Sur"), as in the search ranking.
    if (words && matchScore({ ...a, tags: [...a.tags, a.category.replace(/\./g, " "), categoryLabel(a.category)] }, words) < MIN_RELEVANCE) continue;
    if (opts.search.free && !isFree(a, opts.pricing)) continue;
    if (opts.search.commercial && !(a.license && COMMERCIAL_SAFE.has(a.license.verdict))) continue;
    if (opts.search.downloadable && !a.downloadable) continue;
    const s = toSnapshotClip(a);
    if (!s) continue;
    const titleKey = `${s.provider}:${s.title.toLowerCase()}`;
    if (seenTitles.has(titleKey)) continue;
    seenTitles.add(titleKey);
    candidates.set(s.id, s);
  }

  const out: SnapshotClip[] = [];
  const bySource = new Map<string, number>();
  const take = (s: SnapshotClip) => {
    out.push(s);
    bySource.set(s.provider, (bySource.get(s.provider) ?? 0) + 1);
  };
  for (const p of opts.previous ?? []) {
    if (out.length >= max) break;
    const now = candidates.get(p.id);
    if (now) take(now);
    else if (opts.failed?.has(p.provider) && !excluded(p)) take(p);
  }
  const taken = new Set(out.map((s) => s.id));
  for (const s of candidates.values()) {
    if (out.length >= max) break;
    if (taken.has(s.id) || (bySource.get(s.provider) ?? 0) >= perSource) continue;
    take(s);
  }
  return out;
}

/** The URL a static page needs to load for this clip: the poster, else the preview. */
function mediaOf(a: SnapshotClip): string {
  return a.posterUrl ?? a.previewUrl ?? "";
}

export function sourcesOf(assets: SnapshotClip[]): string[] {
  return [...new Set(assets.map((a) => a.provider))];
}

/** Indexable: enough clips from enough sources to be worth a search engine's time. */
export function isIndexable(clips: SnapshotClip[]): boolean {
  return clips.length >= MIN_INDEXABLE && sourcesOf(clips).length >= MIN_SOURCES;
}

export function searchRequest(search: CollectionSearch): SearchRequest {
  return {
    query: search.q,
    categories: search.categories,
    styles: search.styles,
    orientations: search.orientations,
    minResolution: search.minResolution,
    freeOnly: search.free,
    commercialOnly: search.commercial,
    downloadableOnly: search.downloadable,
    providers: search.providers,
    // Ask for more than a page so filtering and the per-source cap still leave enough.
    limit: 100,
  };
}

/**
 * Run one collection's search and merge it into its previous snapshot.
 * With `checkMedia`, every chosen clip's poster (or preview, when it has no
 * poster) is checked once per URL; a clip whose media is definitely gone is
 * skipped and the next candidate takes its slot, so the static page never
 * shows a broken tile.
 */
export async function snapshotCollection(
  run: (req: SearchRequest) => Promise<SearchResponse>,
  slug: string,
  search: CollectionSearch,
  opts: { previous?: CollectionSnapshot; pricing: ReadonlyMap<string, Pricing>; now?: Date; checkMedia?: (url: string) => Promise<boolean> },
): Promise<SnapshotResult> {
  const res = await run(searchRequest(search));
  const failed = res.providers.filter((p) => p.status === "error" || p.status === "timeout").map((p) => p.provider);
  const prevAssets = sameSearch(opts.previous?.search, search) ? opts.previous?.clips : undefined;
  const broken: string[] = [];
  const checked = new Map<string, boolean>();
  let assets: SnapshotClip[] = [];
  for (let round = 0; round < 5; round++) {
    // Broken previews are excluded by id for this run only (not saved with the search).
    const effective = broken.length ? { ...search, exclude: [...(search.exclude ?? []), ...broken] } : search;
    assets = selectClips(res.results, { search: effective, previous: prevAssets, failed: new Set(failed), pricing: opts.pricing });
    if (!opts.checkMedia) break;
    const unchecked = assets.filter((a) => !checked.has(mediaOf(a)));
    if (!unchecked.length) break;
    const results = await Promise.all(unchecked.map(async (a) => [a, await opts.checkMedia!(mediaOf(a))] as const));
    for (const [a, ok] of results) {
      checked.set(mediaOf(a), ok);
      if (!ok) broken.push(a.id);
    }
    if (results.every(([, ok]) => ok)) break;
  }
  assets = assets.filter((a) => checked.get(mediaOf(a)) !== false);
  const before = new Set((prevAssets ?? []).map((a) => a.id));
  const after = new Set(assets.map((a) => a.id));
  const changed = !opts.previous || JSON.stringify(opts.previous.clips) !== JSON.stringify(assets) || JSON.stringify(opts.previous.search) !== JSON.stringify(search);
  return {
    snapshot: {
      slug,
      search,
      updatedAt: changed ? (opts.now ?? new Date()).toISOString() : opts.previous!.updatedAt,
      clips: assets,
    },
    changed,
    failed,
    kept: [...after].filter((id) => before.has(id)).length,
    added: [...after].filter((id) => !before.has(id)).length,
    dropped: [...before].filter((id) => !after.has(id)).length,
    brokenMedia: broken.length,
  };
}

/** Same search once normalised (case, spacing, list order). */
export function sameSearch(a: CollectionSearch | undefined, b: CollectionSearch | undefined): boolean {
  if (!a || !b) return false;
  return searchKey(a) === searchKey(b);
}

export function searchKey(s: CollectionSearch): string {
  const list = (l?: string[]) => [...(l ?? [])].sort().join(",");
  return [
    s.q.trim().toLowerCase().replace(/\s+/g, " "),
    list(s.categories),
    list(s.styles),
    list(s.orientations),
    s.minResolution ? String(s.minResolution) : "",
    s.free ? "free" : "",
    s.commercial ? "commercial" : "",
    s.downloadable ? "dl" : "",
    list(s.providers),
  ].join("|");
}
