import { classify } from "./classify.js";
import { attributionLine } from "./licence.js";
import { frameSizeFromText } from "./query.js";
import type { Clip, ClipQuery } from "./types.js";
import { IMAGE_FORMATS, OTHER_FORMATS, VIDEO_FORMATS, VIDEO_MIME, categoryMatches, orientationOf, type Category, type VideoStyle } from "./vocab.js";

export function clipId(provider: string, nativeId: string): string {
  return `${provider}:${nativeId}`;
}

/** Split `provider:nativeId` (nativeId may itself contain colons). */
export function parseClipId(id: string): { provider: string; nativeId: string } | null {
  const i = id.indexOf(":");
  if (i <= 0 || i === id.length - 1) return null;
  return { provider: id.slice(0, i), nativeId: id.slice(i + 1) };
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((t) => t.length > 0);
}

/** Crude singularisation so "trees" matches "tree" and "boxes" matches "box". */
export function stem(token: string): string {
  if (token.length > 4 && token.endsWith("ies")) return token.slice(0, -3) + "y";
  if (token.length > 4 && /(ses|xes|zes|ches|shes)$/.test(token)) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

export interface Matchable {
  title: string;
  tags?: string[];
  categories?: string[];
  description?: string;
}

/**
 * Score how well an item matches a free-text query, 0..1.
 * Title hits weigh most, then tags/categories, then description.
 * Returns 1 for an empty query so browse results are kept.
 */
export function matchScore(item: Matchable, query: string): number {
  const qTokens = [...new Set(tokenize(query).map(stem))];
  if (qTokens.length === 0) return 1;
  const title = new Set(tokenize(item.title).map(stem));
  const tags = new Set(
    [...(item.tags ?? []), ...(item.categories ?? [])].flatMap((t) => tokenize(t)).map(stem),
  );
  const desc = new Set(tokenize(item.description ?? "").map(stem));
  let score = 0;
  for (const q of qTokens) {
    if (title.has(q)) score += 1;
    else if (tags.has(q)) score += 0.7;
    else if (desc.has(q)) score += 0.35;
    else if ([...title].some((t) => t.startsWith(q) || (q.length > 3 && t.includes(q)))) score += 0.5;
    else if ([...tags].some((t) => t.startsWith(q))) score += 0.3;
  }
  return Math.min(1, score / qTokens.length);
}

/** Filter + rank a local catalogue (used by providers that fetch a full list). */
export function filterLocal<T extends Matchable & { category: string }>(items: T[], q: ClipQuery, minScore = 0.34): T[] {
  const typed = items.filter((i) => categoryMatches(i.category, q.categories));
  if (!q.query.trim()) return typed;
  return typed
    .map((item) => ({ item, s: matchScore(item, q.query) }))
    .filter((x) => x.s >= minScore)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.item);
}

export function paginate<T>(items: T[], q: ClipQuery): T[] {
  const offset = q.offset ?? 0;
  return items.slice(offset, offset + q.limit);
}

/** Does the query allow any of these top-level categories? Used to skip a source or a section early. */
export function wantsCategory(q: Pick<ClipQuery, "categories">, ...categories: Category[]): boolean {
  if (!q.categories?.length) return true;
  return q.categories.some((w) => categories.some((c) => categoryMatches(c, [w]) || categoryMatches(w, [c])));
}

const KNOWN_FORMATS = new Set<string>([...VIDEO_FORMATS, ...IMAGE_FORMATS, ...OTHER_FORMATS]);

export function formatFromFilename(name: string): string {
  const clean = name.split(/[?#]/)[0] ?? name;
  const tar = /\.(tar\.(gz|xz|bz2))$/i.exec(clean);
  if (tar) return tar[1]!.toLowerCase();
  const ext = clean.includes(".") ? clean.slice(clean.lastIndexOf(".") + 1).toLowerCase() : "";
  return ext === "jpeg" ? "jpg" : ext;
}

export function isKnownFormat(ext: string): boolean {
  return KNOWN_FORMATS.has(ext.toLowerCase());
}

export function filenameFromUrl(url: string): string {
  try {
    const p = new URL(url).pathname;
    return decodeURIComponent(p.slice(p.lastIndexOf("/") + 1)) || "download";
  } catch {
    return "download";
  }
}

export function absoluteUrl(href: string | undefined, base: string): string | undefined {
  if (!href) return undefined;
  try {
    return new URL(href, base).toString();
  } catch {
    return undefined;
  }
}

export function cleanText(s: string | undefined | null): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

export function uniq<T>(xs: Iterable<T>): T[] {
  return [...new Set(xs)];
}

/** Drop undefined keys so JSON output stays compact. */
export function compact<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

export type ClipInput = Omit<Clip, "id" | "category" | "tags"> & {
  id?: string;
  tags?: string[];
  category?: Category;
  /** The source's own category labels or keywords, used to classify. */
  sourceCategories?: string[];
  /** Display name of the source, for the credit line. */
  sourceName?: string;
};

/**
 * Build a Clip: adds `id`, lowercases/dedupes tags, fills category and styles
 * from the words when the source has none, works out the orientation from the
 * frame size (or a "1920x1080" in the title), sets the preview's MIME type,
 * adds the credit line, and drops undefined keys.
 */
export function makeClip(input: ClipInput): Clip {
  const { sourceCategories, sourceName, ...a } = input;
  const tags = uniq((a.tags ?? []).map((t) => t.toLowerCase().trim()).filter(Boolean));
  let category = a.category;
  let categoryEvidence = a.categoryEvidence;
  if (category && !categoryEvidence) categoryEvidence = { by: "source", confidence: 1 };
  const c = classify({ title: a.title, tags, sourceCategories, description: a.description });
  if (!category) {
    category = c.category;
    categoryEvidence = { by: "rules", confidence: c.confidence };
  }
  const styles = uniq<VideoStyle>([...(a.styles ?? []), ...c.styles]);
  let { width, height } = a;
  if (!width || !height) {
    const fromTitle = frameSizeFromText(a.title);
    if (fromTitle) ({ width, height } = fromTitle);
  }
  const clip: Clip = {
    ...a,
    id: a.id ?? clipId(a.provider, a.nativeId),
    tags,
    category,
    categoryEvidence,
    styles: styles.length ? styles : undefined,
    width,
    height,
    orientation: a.orientation ?? orientationOf(width, height),
    durationSec: a.durationSec !== undefined && Number.isFinite(a.durationSec) ? Math.round(a.durationSec * 100) / 100 : undefined,
    fps: a.fps !== undefined && Number.isFinite(a.fps) ? Math.round(a.fps * 100) / 100 : undefined,
    previewType: a.previewType ?? (a.previewUrl ? VIDEO_MIME[formatFromFilename(a.previewUrl)] : undefined),
  };
  clip.attribution ??= attributionLine(clip, sourceName);
  return compact(clip);
}

export function qs(params: Record<string, string | number | boolean | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}
