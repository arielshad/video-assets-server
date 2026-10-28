import { license, parseLicense } from "../core/licence.js";
import type { ClipDetails, ClipFile, ClipQuery, License, Provider, SourceCensus } from "../core/types.js";
import { cleanText, makeClip, qs, tokenize } from "../core/util.js";
import { VIDEO_MIME, type VideoStyle } from "../core/vocab.js";

/**
 * Internet Archive: public-domain and Creative Commons films, the Prelinger
 * Archives (about 10k industrial, educational and advertising films, 1903–
 * 1980s), newsreels, home movies and community stock footage. Search is
 * `advancedsearch.php` (Lucene syntax, JSON); an item's files come from
 * `/metadata/<identifier>` and download from `/download/<identifier>/<file>`.
 * The poster is `/services/img/<identifier>`, the item's tile.
 *
 * Only movies whose `licenseurl` is CC0, public domain or CC BY(-SA) are
 * searched (`licenseurl:*creativecommons.org* AND NOT …nc… AND NOT …nd…`).
 * Those licences are set by the uploader, and some uploads of modern films
 * carry a false public-domain mark, so they are capped at "check-terms" —
 * except the Prelinger collection, whose public-domain status is stated by
 * the archive that holds the films.
 *
 * Historic footage often shows people, brands and events without releases:
 * it is flagged editorial.
 *
 * Search results have no playable file (that needs the item's file list), so
 * the hover preview is empty and the player starts from the clip details.
 */

const SITE = "https://archive.org";
const SEARCH = `${SITE}/advancedsearch.php`;
const MAX_ROWS = 100;
const SOURCE_NAME = "Internet Archive";

const FIELDS = ["identifier", "title", "creator", "licenseurl", "subject", "date", "year", "downloads", "runtime", "collection", "color", "sound", "description"];

export const LICENCE_CLAUSE =
  "mediatype:movies AND licenseurl:*creativecommons.org* AND NOT licenseurl:*nc* AND NOT licenseurl:*nd* AND NOT licenseurl:*sampling*";

/** Collections whose items are TV captures, trailers, fan uploads or YouTube mirrors (IA flags those "deemphasize"), not footage you can reuse. */
const EXCLUDE_COLLECTIONS = ["tvnews", "tvarchive", "movie_trailers", "fanvids", "vlogs", "gamevideos", "speedrunsdotcom", "machinima", "deemphasize", "mirrortube"];
const EXCLUDE_CLAUSE = `NOT collection:(${EXCLUDE_COLLECTIONS.join(" OR ")})`;

/** Curated by the institution that holds the films: their PD statement is the source's, not an anonymous uploader's. */
const TRUSTED_COLLECTIONS = new Set(["prelinger", "prelinger_library", "fedflix", "nasa", "usgovernmentdocuments"]);

interface IaDoc {
  identifier: string;
  title?: string | string[];
  creator?: string | string[];
  licenseurl?: string;
  subject?: string | string[];
  date?: string;
  year?: string | number;
  downloads?: number;
  runtime?: string;
  collection?: string | string[];
  color?: string;
  sound?: string;
  description?: string | string[];
}

interface IaSearch {
  response?: { numFound?: number; docs?: IaDoc[] };
  /** advancedsearch.php reports backend failures with HTTP 200 and this field. */
  error?: string;
}

function check(res: IaSearch): IaSearch {
  if (res.error) throw new Error(`Internet Archive search: ${res.error}`);
  return res;
}

interface IaFile {
  name: string;
  format?: string;
  source?: string;
  size?: string;
  length?: string;
  width?: string;
  height?: string;
  original?: string;
}

interface IaMetadata {
  metadata?: IaDoc & { mediatype?: string };
  files?: IaFile[];
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function list(v: string | string[] | undefined): string[] {
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}

/** IA runtimes: "30:49", "1:02:03", "0:48", "12 minutes", "45 sec". */
export function runtimeSeconds(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const s = v.trim();
  const hms = /^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.\d+)?$/.exec(s);
  if (hms) return Number(hms[1] ?? 0) * 3600 + Number(hms[2]) * 60 + Number(hms[3]);
  const min = /^(\d+(?:\.\d+)?)\s*(?:min|minutes?|mins?)\b/i.exec(s);
  if (min) return Math.round(Number(min[1]) * 60);
  const sec = /^(\d+(?:\.\d+)?)\s*(?:s|sec|secs|seconds?)\b/i.exec(s);
  if (sec) return Number(sec[1]);
  const plain = /^(\d+(?:\.\d+)?)$/.exec(s);
  return plain ? Number(plain[1]) : undefined;
}

export function licenseFor(d: Pick<IaDoc, "licenseurl" | "collection">): License {
  const trusted = list(d.collection).some((c) => TRUSTED_COLLECTIONS.has(c));
  const parsed = parseLicense(d.licenseurl, trusted ? "source" : "uploader") ?? license("LicenseRef-Unknown", "uploader");
  return {
    ...parsed,
    editorial: true,
    note: [parsed.note, "Historic footage may show people, brands or events without releases: fine for documentary and education, check before advertising."].filter(Boolean).join(" "),
  };
}

function stylesOf(d: Pick<IaDoc, "color">): VideoStyle[] {
  return /^(b&w|b\/w|bw|black)/i.test(d.color ?? "") ? ["black-white"] : [];
}

function hasAudioOf(d: Pick<IaDoc, "sound">): boolean | undefined {
  const s = (d.sound ?? "").toLowerCase();
  if (!s) return undefined;
  if (/^(si|silent)/.test(s)) return false;
  if (/^(sd|sound)/.test(s)) return true;
  return undefined;
}

function yearOf(d: Pick<IaDoc, "year" | "date">): number | undefined {
  // "1940", "1940-05-01", "ca. 1940s"
  const y = Number(String(d.year ?? "").slice(0, 4)) || Number(/(?<!\d)(1[89]\d\d|20\d\d)(?!\d)/.exec(d.date ?? "")?.[1]);
  return y && y > 1850 && y < 2100 ? y : undefined;
}

function baseClip(d: IaDoc) {
  const collections = list(d.collection);
  const year = yearOf(d);
  const subjects = list(d.subject).flatMap((s) => s.split(/;\s*/)).map(cleanText).filter(Boolean);
  const historic = collections.some((c) => c.startsWith("prelinger")) || (year !== undefined && year < 1990);
  const description = cleanText(list(d.description).join(" ").replace(/<[^>]*>/g, " ")).slice(0, 600) || undefined;
  return {
    provider: "internetarchive",
    nativeId: d.identifier,
    title: cleanText(first(d.title)) || d.identifier,
    description,
    url: `${SITE}/details/${encodeURIComponent(d.identifier)}`,
    author: cleanText(first(d.creator)) || undefined,
    tags: subjects.slice(0, 20),
    // Old films are filed under archive (their subjects still count as tags for text search).
    sourceCategories: historic ? ["archive film", ...subjects] : subjects,
    styles: stylesOf(d),
    durationSec: runtimeSeconds(d.runtime),
    hasAudio: hasAudioOf(d),
    year,
    posterUrl: `${SITE}/services/img/${encodeURIComponent(d.identifier)}`,
    license: licenseFor(d),
    price: { free: true },
    downloadable: true,
    createdAt: d.date && !Number.isNaN(Date.parse(d.date)) ? new Date(d.date).toISOString() : undefined,
    popularity: d.downloads,
    sourceName: SOURCE_NAME,
  };
}

/** Words of the query as Lucene-safe tokens, each required in the title, subject or description. */
function textClause(q: Pick<ClipQuery, "query">): string | undefined {
  const words = tokenize(q.query).filter((w) => !/^(and|or|not|to)$/.test(w)).slice(0, 8);
  if (!words.length) return undefined;
  return words.map((w) => `(title:${w} OR subject:${w} OR description:${w})`).join(" AND ");
}

export function buildQuery(q: Pick<ClipQuery, "query" | "styles">): string {
  const bw = q.styles?.includes("black-white") ? '(color:"B&W" OR color:bw)' : undefined;
  return [textClause(q), LICENCE_CLAUSE, EXCLUDE_CLAUSE, bw].filter(Boolean).join(" AND ");
}

function searchUrl(query: string, rows: number, page: number): string {
  const sp = new URLSearchParams();
  sp.set("q", query);
  for (const f of FIELDS) sp.append("fl[]", f);
  sp.set("rows", String(rows));
  sp.set("page", String(page));
  sp.append("sort[]", "downloads desc");
  sp.set("output", "json");
  return `${SEARCH}?${sp.toString()}`;
}

/** Error bodies come back with HTTP 200; keep them out of the cache. */
const noError = (body: string): boolean => !/^\s*\{\s*"error"/.test(body);

const VIDEO_EXT = /\.(mp4|m4v|mov|webm|ogv|mpeg|mpg|avi|mkv)$/i;

/** Files of an item: originals, h.264 / Ogg derivatives, and the poster. */
export function filesOf(identifier: string, files: IaFile[]): ClipFile[] {
  const out: ClipFile[] = [];
  const base = `${SITE}/download/${encodeURIComponent(identifier)}`;
  for (const f of files) {
    if (!VIDEO_EXT.test(f.name) || f.name.includes("/")) continue;
    const format = /\.([a-z0-9]+)$/i.exec(f.name)![1]!.toLowerCase().replace("mpg", "mpeg");
    const width = Number(f.width) || undefined;
    const height = Number(f.height) || undefined;
    const isOriginal = f.source === "original";
    // "512Kb MPEG4" is a 240p derivative: a fine preview, not a deliverable.
    const role: ClipFile["role"] = isOriginal ? "original" : /512kb/i.test(f.format ?? "") || /_512kb\./i.test(f.name) ? "preview" : "rendition";
    out.push({
      url: `${base}/${f.name.split("/").map(encodeURIComponent).join("/")}`,
      filename: f.name,
      format,
      mime: VIDEO_MIME[format],
      role,
      width,
      height,
      codec: /h\.?264|mpeg4/i.test(f.format ?? "") && format === "mp4" ? "h264" : /ogg/i.test(f.format ?? "") ? "theora" : undefined,
      sizeBytes: Number(f.size) || undefined,
    });
  }
  out.push({ url: `${SITE}/services/img/${encodeURIComponent(identifier)}`, filename: "poster.jpg", format: "jpg", role: "poster" });
  return out;
}

export const internetarchive: Provider = {
  id: "internetarchive",
  name: SOURCE_NAME,
  homepage: SITE,
  description:
    "Public-domain and Creative Commons films: the Prelinger Archives (industrial, educational and advertising films), newsreels, home movies and community stock footage. Only items marked CC0, public domain or CC BY(-SA); uploader-asserted licences are flagged.",
  categories: ["archive", "city", "people", "transport", "nature", "science", "tech", "food", "space"],
  access: "api",
  pricing: "free",
  supportsDownload: true,
  nativeFilters: ["freeOnly"],

  buildSearchUrl(q) {
    const text = q.query.trim();
    return `${SITE}/search${qs({ query: text ? `${text} AND mediatype:movies` : "mediatype:movies AND collection:prelinger" })}`;
  },

  async search(q, ctx) {
    const rows = Math.max(1, Math.min(q.limit, MAX_ROWS));
    const page = Math.floor((q.offset ?? 0) / rows) + 1;
    const res = check(await ctx.fetch.json<IaSearch>(searchUrl(buildQuery(q), rows, page), { cacheTtlMs: 60 * 60_000, cacheIf: noError, signal: ctx.signal }));
    const clips = (res.response?.docs ?? []).filter((d) => d.identifier).map((d) => makeClip(baseClip(d)));
    return { clips, total: res.response?.numFound, searchUrl: this.buildSearchUrl(q) };
  },

  async getClip(nativeId, ctx) {
    const res = await ctx.fetch.json<IaMetadata>(`${SITE}/metadata/${encodeURIComponent(nativeId)}`, { cacheTtlMs: 24 * 3600_000, cacheIf: noError, signal: ctx.signal });
    const m = res.metadata;
    if (!m?.identifier || (m.mediatype && m.mediatype !== "movies")) return null;
    const files = filesOf(m.identifier, res.files ?? []);
    const videos = files.filter((f) => f.role !== "poster");
    const best = [...videos].sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];
    const length = (res.files ?? []).map((f) => Number(f.length)).find((n) => Number.isFinite(n) && n > 0);
    const playable = videos.filter((f) => f.format === "mp4" || f.format === "webm").sort((a, b) => (a.sizeBytes ?? Infinity) - (b.sizeBytes ?? Infinity))[0];
    const clip = makeClip({
      ...baseClip(m),
      width: best?.width,
      height: best?.height,
      durationSec: runtimeSeconds(m.runtime) ?? length,
      previewUrl: playable?.url,
      previewType: playable?.mime,
      formats: [...new Set(videos.map((f) => f.format))],
    });
    return { ...clip, files } satisfies ClipDetails;
  },

  async census(ctx): Promise<SourceCensus> {
    const count = async (q: string) =>
      check(await ctx.fetch.json<IaSearch>(searchUrl(q, 0, 1), { signal: ctx.signal, cacheTtlMs: 0 })).response?.numFound ?? 0;
    const total = await count(`${LICENCE_CLAUSE} AND ${EXCLUDE_CLAUSE}`);
    const prelinger = await count("mediatype:movies AND collection:prelinger");
    const pd = await count(`${LICENCE_CLAUSE} AND ${EXCLUDE_CLAUSE} AND licenseurl:*publicdomain*`);
    return {
      total,
      free: total,
      byCategory: { archive: prelinger },
      byLicense: { "Public domain / CC0": pd, "CC BY / BY-SA": Math.max(0, total - pd) },
      categories: { "Prelinger Archives": prelinger },
      method: "advancedsearch.php numFound for movies with a CC0, public-domain or CC BY(-SA) licenseurl, TV captures and trailers excluded",
    };
  },
};
