import { customLicense, parseLicense } from "../core/licence.js";
import type { Clip, ClipDetails, ClipFile, ClipQuery, License, Provider, SourceCensus } from "../core/types.js";
import { cleanText, makeClip, qs } from "../core/util.js";
import { VIDEO_MIME } from "../core/vocab.js";

/**
 * Wikimedia Commons: about 400k video files (nature, science, history,
 * documentary footage, timelapses), each with a licence recorded per file.
 * Found with the public MediaWiki API in one request:
 * `action=query&generator=search&gsrnamespace=6&gsrsearch=<q> filetype:video`
 * with `prop=imageinfo|videoinfo`: `imageinfo` gives the original file, its
 * frame size, length, poster (`thumburl`) and licence (`extmetadata`);
 * `videoinfo` lists the server's transcodes (VP9 WebM from 240p up to 2160p,
 * plus a 360p MPEG-4 .mov), which are the renditions and the preview.
 *
 * Commons originals are WebM or Ogg Theora, never MP4: the files keep their
 * real container so editors know what they get.
 *
 * A minimum resolution goes to the search itself as `filew:>N fileh:>N`
 * (both sides at least N is the same as the short side at least N).
 *
 * nativeId is the file title without "File:" and with underscores for spaces,
 * as in Commons URLs ("Ocean_surface_waves_06.ogv").
 *
 * Rate limits (2026): about 10 requests/minute without a descriptive
 * User-Agent, 200/minute with one. The shared HTTP client sends one with
 * contact details, retries once on a short 429, and results are cached.
 */

const SITE = "https://commons.wikimedia.org";
const API = `${SITE}/w/api.php`;
const MAX_PAGE_SIZE = 50;
const METADATA = "ObjectName|ImageDescription|Artist|LicenseShortName|LicenseUrl|AttributionRequired|DateTimeOriginal|DateTime|Categories";
const SOURCE_NAME = "Wikimedia Commons";
const POSTER_WIDTH = 640;

interface Meta {
  value?: string;
}

interface Derivative {
  src?: string;
  type?: string;
  transcodekey?: string;
  width?: number;
  height?: number;
  bandwidth?: number;
}

interface CommonsPage {
  title: string;
  index?: number;
  missing?: boolean;
  imageinfo?: {
    size?: number;
    width?: number;
    height?: number;
    duration?: number;
    url?: string;
    thumburl?: string;
    descriptionurl?: string;
    mime?: string;
    mediatype?: string;
    extmetadata?: Record<string, Meta | undefined>;
  }[];
  videoinfo?: { derivatives?: Derivative[] }[];
}

interface CommonsQuery {
  query?: { pages?: CommonsPage[]; searchinfo?: { totalhits?: number } };
  continue?: Record<string, string | number>;
  /** MediaWiki reports some failures ("cirrussearch-too-busy-error") with HTTP 200 and this body. */
  error?: { code?: string; info?: string };
}

function check(res: CommonsQuery): CommonsQuery {
  if (res.error) throw new Error(`Commons API: ${res.error.info ?? res.error.code ?? "error"}`);
  return res;
}

/** Wikimedia metadata values can hold HTML; keep the text. */
function plain(html: string | undefined): string {
  return cleanText(
    (html ?? "")
      .replace(/<[^>]*>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">"),
  );
}

/** "File:Ocean_waves.webm" / "Ocean_waves.webm" → "Ocean waves.webm" (MediaWiki's canonical title, for API calls). */
export function commonsTitle(title: string): string {
  return title.replace(/^File:/i, "").replace(/_/g, " ").trim();
}

/** "File:Ocean waves.webm" → "Ocean_waves.webm": the nativeId. */
export function commonsNativeId(title: string): string {
  return commonsTitle(title).replace(/ /g, "_");
}

/** Licence, maintenance and upload-bookkeeping categories say nothing about the footage. */
const NOISE_CATEGORY =
  /^(gfdl|cc[- ]|pd[- ]|public domain|self-published|license migration|files with|files by|files from|media (needing|with|missing)|uploaded|videos (by|from|with|of size|in)|webm videos|ogg theora|pages with|attribution|all media|taken with|quality|featured|valued)|license|licence/i;

function sourceCategoriesOf(meta: Record<string, Meta | undefined>): string[] {
  return (meta.Categories?.value ?? "")
    .split("|")
    .map(cleanText)
    .filter((c) => c && !NOISE_CATEGORY.test(c));
}

/** Artist is HTML; "No machine-readable author provided. <a>User</a> assumed (…)" → "User". */
function authorOf(html: string): string | undefined {
  const text = plain(html);
  if (/^no machine-readable author/i.test(text)) {
    const link = /<a [^>]*>([^<]+)<\/a>/.exec(html)?.[1];
    return link ? plain(link).replace(/~commonswiki$/, "").replace(/^User:\s*/i, "") : undefined;
  }
  return text.replace(/^User:\s*/i, "").slice(0, 120) || undefined;
}

function authorUrlOf(html: string): string | undefined {
  const href = /<a [^>]*href="([^"]+)"/.exec(html)?.[1];
  if (!href) return undefined;
  return href.startsWith("//") ? `https:${href}` : href.startsWith("/") ? `${SITE}${href}` : /^https?:\/\//.test(href) ? href : undefined;
}

function licenseOf(meta: Record<string, Meta | undefined>): License {
  const name = plain(meta.LicenseShortName?.value);
  const url = meta.LicenseUrl?.value || undefined;
  const parsed = parseLicense(name) ?? parseLicense(url);
  if (parsed) return parsed;
  if (name) {
    return customLicense(name, {
      url,
      assertedBy: "source",
      attributionRequired: meta.AttributionRequired?.value === "true" || undefined,
    });
  }
  return customLicense("No licence stated", { assertedBy: "source", note: "Commons lists no licence for this file; check its page." });
}

/** Strip the analytics query Commons now appends to upload and thumbnail URLs. */
function cleanUrl(u: string): string {
  return u.replace(/\?utm_[^#]*$/, "");
}

/** "240p.vp9.webm" → webm, "360p.mpeg4.mov" → mov. */
function containerOf(d: Derivative): string {
  const key = d.transcodekey ?? "";
  const fromKey = /\.([a-z0-9]+)$/.exec(key)?.[1];
  if (fromKey) return fromKey === "ogv" ? "ogv" : fromKey;
  const mime = (d.type ?? "").split(";")[0]!.trim();
  return Object.entries(VIDEO_MIME).find(([, m]) => m === mime)?.[0] ?? (/\.([a-z0-9]{2,4})(?:\?|$)/i.exec(d.src ?? "")?.[1]?.toLowerCase() ?? "webm");
}

function codecOf(type: string | undefined): string | undefined {
  const codecs = /codecs="([^"]+)"/.exec(type ?? "")?.[1];
  const video = codecs?.split(",")[0]?.trim().toLowerCase();
  if (!video) return undefined;
  if (video.startsWith("avc")) return "h264";
  if (video === "mp4v") return "mpeg4";
  return video;
}

/** Does the original carry an audio track? Read from its codec list ("theora, vorbis"). */
function hasAudioOf(derivatives: Derivative[]): boolean | undefined {
  const original = derivatives.find((d) => !d.transcodekey);
  const codecs = /codecs="([^"]+)"/.exec(original?.type ?? "")?.[1];
  if (!codecs) return undefined;
  return /vorbis|opus|mp4a|aac|mp3|flac/i.test(codecs);
}

function filesOf(p: CommonsPage): ClipFile[] {
  const info = p.imageinfo?.[0];
  const derivatives = p.videoinfo?.[0]?.derivatives ?? [];
  const out: ClipFile[] = [];
  const original = derivatives.find((d) => !d.transcodekey);
  if (info?.url) {
    const url = cleanUrl(info.url);
    const name = decodeURIComponent(url.split("/").pop() ?? commonsNativeId(p.title));
    out.push({
      url,
      filename: name,
      format: /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? "webm",
      mime: original?.type?.split(";")[0] ?? info.mime,
      role: "original",
      width: info.width,
      height: info.height,
      codec: codecOf(original?.type),
      sizeBytes: info.size,
      bitrate: original?.bandwidth,
    });
  }
  for (const d of derivatives) {
    if (!d.src || !d.transcodekey) continue;
    const url = cleanUrl(d.src);
    const format = containerOf(d);
    out.push({
      url,
      filename: decodeURIComponent(url.split("/").pop() ?? `${commonsNativeId(p.title)}.${d.transcodekey}`),
      format,
      mime: d.type?.split(";")[0],
      role: "rendition",
      width: d.width,
      height: d.height,
      codec: codecOf(d.type),
      bitrate: d.bandwidth,
    });
  }
  if (info?.thumburl) {
    out.push({ url: cleanUrl(info.thumburl), filename: "poster.jpg", format: "jpg", role: "poster" });
  }
  return out;
}

/**
 * The hover preview: a WebM transcode near 360p (small, plays everywhere
 * modern), else the smallest browser-playable file.
 */
function previewOf(files: ClipFile[]): ClipFile | undefined {
  const playable = files.filter((f) => f.role === "rendition" && f.format === "webm" && f.height);
  if (!playable.length) return undefined;
  return [...playable].sort((a, b) => Math.abs(Math.min(a.width!, a.height!) - 360) - Math.abs(Math.min(b.width!, b.height!) - 360))[0];
}

export function toClip(p: CommonsPage): ClipDetails | undefined {
  const info = p.imageinfo?.[0];
  if (!info?.url) return undefined;
  if (info.mediatype && info.mediatype !== "VIDEO") return undefined;
  const meta = info.extmetadata ?? {};
  const nativeId = commonsNativeId(p.title);
  const title = plain(meta.ObjectName?.value) || commonsTitle(p.title).replace(/\.[a-z0-9]{2,5}$/i, "");
  const description = plain(meta.ImageDescription?.value).slice(0, 500) || undefined;
  const files = filesOf(p);
  const preview = previewOf(files);
  const derivatives = p.videoinfo?.[0]?.derivatives ?? [];
  const date = meta.DateTimeOriginal?.value ?? meta.DateTime?.value;
  const year = Number(/\b(1[89]\d\d|20\d\d)\b/.exec(plain(date))?.[1]) || undefined;
  const formats = [...new Set(files.filter((f) => f.role !== "poster").map((f) => f.format))];
  const clip = makeClip({
    provider: "wikimediacommons",
    nativeId,
    title,
    description,
    url: info.descriptionurl ? cleanUrl(info.descriptionurl) : `${SITE}/wiki/File:${encodeURIComponent(nativeId)}`,
    author: authorOf(meta.Artist?.value ?? ""),
    authorUrl: authorUrlOf(meta.Artist?.value ?? ""),
    sourceCategories: sourceCategoriesOf(meta),
    width: info.width,
    height: info.height,
    durationSec: info.duration,
    hasAudio: hasAudioOf(derivatives),
    year,
    posterUrl: info.thumburl ? cleanUrl(info.thumburl) : undefined,
    previewUrl: preview?.url,
    previewType: preview?.mime ?? (preview ? VIDEO_MIME[preview.format] : undefined),
    formats,
    license: licenseOf(meta),
    price: { free: true },
    downloadable: true,
    createdAt: parseDate(meta.DateTime?.value),
    sourceName: SOURCE_NAME,
  });
  return { ...clip, files };
}

function parseDate(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const d = new Date(plain(v));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Error bodies come back with HTTP 200; keep them out of the cache. */
const noError = (body: string): boolean => !/^\s*\{\s*"error"/.test(body);

const PROPS = {
  prop: "imageinfo|videoinfo",
  iiprop: "url|size|mime|mediatype|extmetadata",
  iiurlwidth: POSTER_WIDTH,
  iiextmetadatafilter: METADATA,
  iiextmetadatalanguage: "en",
  viprop: "derivatives",
};

/** The search string Commons gets: the words, `filetype:video`, and the minimum frame size. */
export function searchText(q: Pick<ClipQuery, "query" | "minResolution">): string {
  const parts = [q.query.trim(), "filetype:video"];
  if (q.minResolution) {
    // Both sides above N-1 ⇔ the short side is at least N (3% slack for cropped masters).
    const n = Math.floor(q.minResolution * 0.97) - 1;
    parts.push(`filew:>${n}`, `fileh:>${n}`);
  }
  return parts.filter(Boolean).join(" ");
}

export const wikimediacommons: Provider = {
  id: "wikimediacommons",
  name: SOURCE_NAME,
  homepage: SITE,
  description:
    "About 400k freely licensed videos: nature, science, history, documentary footage and timelapses. Licence recorded per file (CC0, public domain, CC BY, CC BY-SA); files are WebM/Ogg with WebM renditions up to 4K.",
  categories: ["nature", "city", "people", "aerial", "space", "science", "tech", "transport", "food", "archive", "background"],
  access: "api",
  pricing: "free",
  supportsDownload: true,
  nativeFilters: ["resolution", "freeOnly"],

  buildSearchUrl(q) {
    return `${SITE}/w/index.php${qs({ search: searchText(q), title: "Special:MediaSearch", type: "video" })}`;
  },

  async search(q, ctx) {
    const limit = Math.max(1, Math.min(q.limit, MAX_PAGE_SIZE));
    const url = `${API}${qs({
      action: "query",
      format: "json",
      formatversion: 2,
      generator: "search",
      gsrnamespace: 6,
      gsrsearch: searchText(q),
      gsrlimit: limit,
      gsroffset: q.offset || undefined,
      ...PROPS,
    })}`;
    const res = check(await ctx.fetch.json<CommonsQuery>(url, { cacheTtlMs: 60 * 60_000, cacheIf: noError, signal: ctx.signal }));
    const pages = [...(res.query?.pages ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const clips: Clip[] = [];
    for (const p of pages) {
      const c = toClip(p);
      if (!c) continue;
      const { files: _files, ...clip } = c;
      clips.push(clip);
    }
    return { clips, searchUrl: this.buildSearchUrl(q) };
  },

  async getClip(nativeId, ctx) {
    const url = `${API}${qs({ action: "query", format: "json", formatversion: 2, titles: `File:${commonsTitle(nativeId)}`, ...PROPS })}`;
    const res = check(await ctx.fetch.json<CommonsQuery>(url, { cacheTtlMs: 60 * 60_000, cacheIf: noError, signal: ctx.signal }));
    const page = res.query?.pages?.[0];
    if (!page || page.missing) return null;
    return toClip(page) ?? null;
  },

  async census(ctx): Promise<SourceCensus> {
    const count = async (search: string): Promise<number> => {
      const r = check(await ctx.fetch.json<CommonsQuery>(
        `${API}${qs({ action: "query", format: "json", formatversion: 2, list: "search", srnamespace: 6, srsearch: search, srinfo: "totalhits", srlimit: 1, srprop: "" })}`,
        { signal: ctx.signal, cacheTtlMs: 0 },
      ));
      return r.query?.searchinfo?.totalhits ?? 0;
    };
    const total = await count("filetype:video");
    const hd = await count("filetype:video filew:>1045 fileh:>1045");
    const uhd = await count("filetype:video filew:>2094 fileh:>2094");
    return {
      total,
      free: total,
      byCategory: {},
      categories: { "Full HD or larger": hd, "4K or larger": uhd },
      method: "MediaWiki search totalhits for filetype:video (and filew/fileh for the size tiers)",
    };
  },
};
