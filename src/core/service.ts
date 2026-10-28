import { createHttpClient } from "./http.js";
import { COMMERCIAL_SAFE } from "./licence.js";
import { durationMatches, parseQuery } from "./query.js";
import type {
  Clip,
  ClipDetails,
  ClipFilters,
  ClipQuery,
  HttpClient,
  NativeFilter,
  Provider,
  ProviderContext,
  ProviderInfo,
} from "./types.js";
import { matchScore, parseClipId } from "./util.js";
import { categoryMatches, shortSide, type Category } from "./vocab.js";

export interface SearchRequest extends ClipFilters {
  query: string;
  /** Restrict to these provider ids. */
  providers?: string[];
  /** Only return clips this server can hand out direct file URLs for. */
  downloadableOnly?: boolean;
  /**
   * Drop clips whose orientation, resolution, length, fps or audio is unknown
   * when that filter is set. Default false: unknown values stay in the list,
   * ranked below known matches.
   */
  strict?: boolean;
  /** Parse "4k", "vertical", "10s", "60fps" out of `query` into filters (default true). */
  parse?: boolean;
  /** Total results to return across providers. */
  limit?: number;
  /** Per-provider result offset (for paging deeper into every source). */
  offset?: number;
  /** Per-provider timeout. */
  timeoutMs?: number;
  /** Per-request credentials, passed to providers only. */
  credentials?: Record<string, string>;
}

export type ProviderStatus = "ok" | "error" | "timeout" | "skipped" | "link";

export interface ProviderSearchReport {
  provider: string;
  name: string;
  status: ProviderStatus;
  count: number;
  total?: number;
  searchUrl?: string;
  error?: string;
  /** Filters this source could not apply itself (we applied them to what it returned). */
  filteredLocally?: NativeFilter[];
  tookMs: number;
}

export interface SearchResponse {
  query: string;
  /** The filters in force after parsing the query. */
  filters: ClipFilters;
  results: Clip[];
  providers: ProviderSearchReport[];
}

export interface ClipServiceOptions {
  providers: Provider[];
  http?: HttpClient;
  defaultTimeoutMs?: number;
}

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 100;

/** Small boost for sources whose metadata and files we trust most. */
const ACCESS_WEIGHT = { api: 1, static: 0.9, scrape: 0.8, link: 0 } as const;

export class ClipService {
  readonly http: HttpClient;
  private readonly providers = new Map<string, Provider>();
  private readonly defaultTimeoutMs: number;

  constructor(opts: ClipServiceOptions) {
    this.http = opts.http ?? createHttpClient();
    this.defaultTimeoutMs = opts.defaultTimeoutMs ?? Number(process.env.VIDEO_SERVER_PROVIDER_TIMEOUT_MS ?? 12_000);
    for (const p of opts.providers) this.providers.set(p.id, p);
  }

  listProviders(): (ProviderInfo & { enabled: boolean })[] {
    return [...this.providers.values()].map((p) => ({
      id: p.id,
      name: p.name,
      homepage: p.homepage,
      description: p.description,
      categories: p.categories,
      access: p.access,
      pricing: p.pricing,
      license: p.license,
      apiKeyEnv: p.apiKeyEnv,
      supportsDownload: p.supportsDownload,
      nativeFilters: p.nativeFilters,
      enabled: p.isEnabled?.() ?? true,
    }));
  }

  getProvider(id: string): Provider | undefined {
    return this.providers.get(id);
  }

  async search(req: SearchRequest): Promise<SearchResponse> {
    const limit = Math.min(Math.max(req.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const timeoutMs = req.timeoutMs ?? this.defaultTimeoutMs;
    const wanted = req.providers?.length ? new Set(req.providers) : undefined;
    const unknown = req.providers?.filter((p) => !this.providers.has(p)) ?? [];
    if (unknown.length) throw new UnknownProviderError(unknown);

    const parsed = req.parse === false ? { query: req.query.trim(), hints: [] as Category[] } : parseQuery(req.query);
    const p = parsed as Partial<ClipFilters>;
    // Explicit filters win over words parsed from the query.
    const filters: ClipFilters = dropUndefined({
      categories: req.categories?.length ? req.categories : undefined,
      styles: req.styles?.length ? req.styles : p.styles,
      orientations: req.orientations?.length ? req.orientations : p.orientations,
      minResolution: req.minResolution ?? p.minResolution,
      duration: req.duration ?? p.duration,
      minFps: req.minFps ?? p.minFps,
      hasAudio: req.hasAudio,
      commercialOnly: req.commercialOnly || undefined,
      freeOnly: req.freeOnly || undefined,
    });

    // Ask each source for a full page so the merged ranking has enough to choose from.
    const perProvider = Math.min(limit, 50);
    const q: ClipQuery = { ...filters, query: parsed.query, hints: parsed.hints, limit: perProvider, offset: req.offset };

    const reports: ProviderSearchReport[] = [];
    const ranked: { clip: Clip; rank: number; provider: Provider }[] = [];

    await Promise.all(
      [...this.providers.values()].map(async (prov) => {
        const started = Date.now();
        const base = { provider: prov.id, name: prov.name, count: 0 };
        const skip = (reason: string): void => {
          reports.push({ ...base, status: "skipped", error: reason, tookMs: 0 });
        };
        if (wanted && !wanted.has(prov.id)) return;
        if (prov.isEnabled && !prov.isEnabled()) return skip(`disabled (set ${prov.apiKeyEnv ?? "its API key"})`);
        if (filters.categories && !filters.categories.some((c) => prov.categories.some((pc) => categoryMatches(c, [pc]) || categoryMatches(pc, [c]))))
          return skip("does not carry the requested categories");
        if (req.downloadableOnly && !prov.supportsDownload) return skip("no direct downloads");
        if (filters.freeOnly && prov.pricing === "paid") return skip("paid only");
        if (filters.commercialOnly && prov.license && !COMMERCIAL_SAFE.has(prov.license.verdict))
          return skip(`licence is ${prov.license.verdict === "no" ? "non-commercial" : prov.license.verdict}`);

        const searchUrl = prov.buildSearchUrl(q);
        const signal = AbortSignal.timeout(timeoutMs);
        const ctx: ProviderContext = { fetch: this.http, signal, credentials: req.credentials };
        try {
          const res = await withTimeout(prov.search(q, ctx), timeoutMs, signal);
          const local = localFilters(filters, prov.nativeFilters);
          let clips = res.clips.filter((c) => passes(c, filters, req));
          if (req.downloadableOnly) clips = clips.filter((c) => c.downloadable);
          clips.forEach((clip, rank) => ranked.push({ clip, rank, provider: prov }));
          reports.push({
            ...base,
            status: prov.access === "link" ? "link" : "ok",
            count: clips.length,
            total: res.total,
            searchUrl: res.searchUrl ?? searchUrl,
            ...(local.length && prov.access !== "link" ? { filteredLocally: local } : {}),
            tookMs: Date.now() - started,
          });
        } catch (e) {
          const timedOut = signal.aborted || e instanceof TimeoutError;
          reports.push({
            ...base,
            status: timedOut ? "timeout" : "error",
            error: timedOut ? `timed out after ${timeoutMs}ms` : errorMessage(e),
            searchUrl,
            tookMs: Date.now() - started,
          });
        }
      }),
    );

    const order = [...this.providers.keys()];
    const results = rankResults(dedupe(ranked, order), q).slice(0, limit);
    reports.sort((a, b) => order.indexOf(a.provider) - order.indexOf(b.provider));
    return { query: q.query, filters, results, providers: reports };
  }

  async getClip(id: string, credentials?: Record<string, string>): Promise<ClipDetails | null> {
    const parsed = parseClipId(id);
    if (!parsed) throw new InvalidClipIdError(id);
    const p = this.providers.get(parsed.provider);
    if (!p) throw new UnknownProviderError([parsed.provider]);
    if (!p.getClip) throw new UnsupportedError(`${p.name} does not support clip details; open the source site instead.`);
    const signal = AbortSignal.timeout(this.defaultTimeoutMs * 2);
    return p.getClip(parsed.nativeId, { fetch: this.http, signal, credentials });
  }
}

function dropUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

const FILTER_KEYS: [NativeFilter, (f: ClipFilters) => boolean][] = [
  ["categories", (f) => !!f.categories],
  ["styles", (f) => !!f.styles],
  ["orientation", (f) => !!f.orientations],
  ["resolution", (f) => f.minResolution !== undefined],
  ["duration", (f) => !!f.duration],
  ["fps", (f) => f.minFps !== undefined],
  ["audio", (f) => f.hasAudio !== undefined],
  ["commercialOnly", (f) => !!f.commercialOnly],
  ["freeOnly", (f) => !!f.freeOnly],
];

function localFilters(f: ClipFilters, native: NativeFilter[] = []): NativeFilter[] {
  return FILTER_KEYS.filter(([k, active]) => active(f) && !native.includes(k)).map(([k]) => k);
}

/** 3% slack: a 1920×1050 master still counts as 1080p. */
const RESOLUTION_SLACK = 0.97;

/**
 * Apply the filters to one clip. Known mismatches always go; unknown
 * orientation, resolution, length, fps or audio only go in strict mode.
 * Category and licence are always known (the classifier fills category; no
 * licence fails commercialOnly). Styles are a soft filter: sources rarely tag
 * them, so a clip without a matching style is only dropped in strict mode.
 */
export function passes(c: Clip, f: ClipFilters, opts: { strict?: boolean } = {}): boolean {
  const strict = !!opts.strict;
  if (f.categories && !categoryMatches(c.category, f.categories)) return false;
  if (f.styles && strict && !f.styles.some((s) => c.styles?.includes(s))) return false;
  if (f.orientations) {
    if (c.orientation ? !f.orientations.includes(c.orientation) : strict) return false;
  }
  if (f.minResolution !== undefined) {
    const s = shortSide(c.width, c.height);
    if (s !== undefined ? s < f.minResolution * RESOLUTION_SLACK : strict) return false;
  }
  if (f.duration) {
    if (c.durationSec !== undefined ? !durationMatches(c.durationSec, f.duration) : strict) return false;
  }
  if (f.minFps !== undefined) {
    // Small slack: 29.97 counts as 30, 59.94 as 60.
    if (c.fps !== undefined ? c.fps < f.minFps - 0.5 : strict) return false;
  }
  if (f.hasAudio !== undefined) {
    if (c.hasAudio !== undefined ? c.hasAudio !== f.hasAudio : strict) return false;
  }
  if (f.commercialOnly && !(c.license && COMMERCIAL_SAFE.has(c.license.verdict))) return false;
  if (f.freeOnly && c.price?.free === false) return false;
  return true;
}

/**
 * The same clip reached through two sources (a NASA video also uploaded to
 * Wikimedia Commons): keep the copy from the source listed first. Matching is
 * by `sameAs` ids and by identical page or preview URLs.
 */
export function dedupe<T extends { clip: Clip; provider: Pick<Provider, "id"> }>(items: T[], order: string[]): T[] {
  const byPriority = [...items].sort((a, b) => order.indexOf(a.provider.id) - order.indexOf(b.provider.id));
  const seen = new Set<string>();
  const keep = new Set<T>();
  for (const it of byPriority) {
    const keys = [it.clip.id, ...(it.clip.sameAs ?? []), `url:${normUrl(it.clip.url)}`];
    if (it.clip.previewUrl) keys.push(`url:${normUrl(it.clip.previewUrl)}`);
    if (keys.some((k) => seen.has(k))) continue;
    keys.forEach((k) => seen.add(k));
    keep.add(it);
  }
  return items.filter((it) => keep.has(it));
}

function normUrl(u: string): string {
  return u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "").toLowerCase();
}

/**
 * Merge per-provider results into one list.
 * Score = text relevance (dominant) + the source's own ranking + how well the
 * known video facts fit what was asked (category hint, orientation,
 * resolution, length, fps, style) + small boosts for commercial-safe, free,
 * downloadable and watchable (has a preview) clips, then a diversity penalty
 * so one large catalogue can't fill the whole first page.
 */
export function rankResults(
  items: { clip: Clip; rank: number; provider: Pick<Provider, "id" | "access"> }[],
  q: Pick<ClipQuery, "query" | "hints" | "categories" | "orientations" | "minResolution" | "duration" | "minFps" | "styles">,
): Clip[] {
  const scored = items.map(({ clip, rank, provider }) => {
    const relevance = matchScore({ ...clip, tags: [...clip.tags, clip.category.replace(/\./g, " ")] }, q.query);
    const sourceRank = 1 / (1 + rank * 0.15);
    const score =
      0.5 * relevance +
      0.15 * sourceRank +
      0.08 * ACCESS_WEIGHT[provider.access] +
      0.15 * videoFit(clip, q) +
      0.04 * (clip.license && COMMERCIAL_SAFE.has(clip.license.verdict) ? 1 : 0) +
      0.02 * (clip.price?.free !== false ? 1 : 0) +
      0.03 * (clip.downloadable ? 1 : 0) +
      0.03 * (clip.previewUrl || clip.posterUrl ? 1 : 0);
    return { clip, provider: provider.id, score };
  });
  scored.sort((a, b) => b.score - a.score);

  const seenPerProvider = new Map<string, number>();
  const diversified = scored.map((s) => {
    const n = seenPerProvider.get(s.provider) ?? 0;
    seenPerProvider.set(s.provider, n + 1);
    return { ...s, score: s.score * Math.pow(0.93, n) };
  });
  diversified.sort((a, b) => b.score - a.score);
  return diversified.map((s) => ({ ...s.clip, score: round(s.score) }));
}

/** 0..1: how well the known video facts fit what was asked. Unknowns score less than a match. */
function videoFit(c: Clip, q: Pick<ClipQuery, "hints" | "categories" | "orientations" | "minResolution" | "duration" | "minFps" | "styles">): number {
  const parts: number[] = [];
  const hints = q.categories?.length ? q.categories : q.hints;
  if (hints?.length) {
    const exact = hints.some((h) => c.category === h || c.category.startsWith(`${h}.`));
    const conf = c.categoryEvidence?.confidence ?? 0.5;
    parts.push(exact ? 0.5 + 0.5 * conf : 0);
  }
  if (q.orientations) parts.push(c.orientation === undefined ? 0.4 : 1);
  if (q.minResolution !== undefined) parts.push(c.width === undefined ? 0.4 : 1);
  if (q.duration) {
    // Closer to the asked minimum is better for b-roll: a 12 s clip beats a 40-minute film for a "10s" shot.
    const d = c.durationSec;
    const target = q.duration.min ?? q.duration.max ?? 0;
    parts.push(d === undefined ? 0.4 : target ? Math.max(0.5, 1 - Math.abs(Math.log((d + 1) / (target + 1))) / 4) : 1);
  }
  if (q.minFps !== undefined) parts.push(c.fps === undefined ? 0.4 : 1);
  if (q.styles) parts.push(q.styles.some((s) => c.styles?.includes(s)) ? 1 : 0.3);
  if (!parts.length) return 0.5;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

class TimeoutError extends Error {}

function withTimeout<T>(p: Promise<T>, ms: number, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new TimeoutError(`timed out after ${ms}ms`));
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export class UnknownProviderError extends Error {
  constructor(readonly ids: string[]) {
    super(`Unknown provider(s): ${ids.join(", ")}`);
    this.name = "UnknownProviderError";
  }
}

export class InvalidClipIdError extends Error {
  constructor(id: string) {
    super(`Invalid clip id "${id}". Expected "<provider>:<id>", e.g. "nasa:KSC-20230105-MH-GEB01-0001".`);
    this.name = "InvalidClipIdError";
  }
}

export class UnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedError";
  }
}
