import { asEditorial, customLicense, license } from "../core/licence.js";
import type { ClipDetails, ClipFile, License, Provider, SourceCensus } from "../core/types.js";
import { cleanText, makeClip, qs } from "../core/util.js";

/**
 * NASA Image and Video Library (images.nasa.gov): about 9k NASA videos —
 * launches, missions, astronauts, Earth from orbit, the Sun — through the
 * official keyless API at images-api.nasa.gov.
 *
 * - Search: `/search?media_type=video&q=…` returns title, description,
 *   keywords, centre, date and a poster per item (one request).
 * - Details: `<asset>/collection.json` lists every file, and
 *   `<asset>/metadata.json` (exiftool output) gives frame size, length, frame
 *   rate and whether there is an audio track (two requests).
 *
 * Every video has the same set of MP4 (h264) renditions, named by size:
 * `~orig` (the master), `~large` (1080p), `~medium` (720p), `~small` (360p),
 * `~preview` (270p) and `~mobile` (180p). Search results point their hover
 * preview at `~preview.mp4`, which the browser fetches from NASA directly.
 *
 * Licence: NASA media is generally not copyrighted in the US. NASA asks to be
 * credited, forbids implying endorsement and using its insignia, and needs
 * permission for identifiable people in ads, so every item is
 * yes-with-credit and editorial-flagged. Items whose credit line names
 * another organisation (a launch provider, a university) may be copyrighted
 * by them: those are "check-terms".
 */

const SITE = "https://images.nasa.gov";
const API = "https://images-api.nasa.gov";
const ASSETS = "https://images-assets.nasa.gov";
const SOURCE_NAME = "NASA Image and Video Library";
const MAX_PAGE_SIZE = 100;

/** Rendition name → nominal short side in pixels (capped by the master). */
const RENDITIONS: Record<string, number> = { large: 1080, medium: 720, small: 360, preview: 270, mobile: 180 };

interface NasaData {
  nasa_id: string;
  title?: string;
  description?: string;
  description_508?: string;
  keywords?: string[];
  center?: string;
  date_created?: string;
  media_type?: string;
  photographer?: string;
  secondary_creator?: string;
  location?: string;
  album?: string[];
}

interface NasaLink {
  href: string;
  rel?: string;
  render?: string;
  width?: number;
  height?: number;
}

interface NasaItem {
  href?: string;
  data?: NasaData[];
  links?: NasaLink[];
}

interface NasaSearch {
  collection?: { items?: NasaItem[]; metadata?: { total_hits?: number } };
}

type ExifMeta = Record<string, unknown>;

function https(u: string): string {
  return u.replace(/^http:\/\//, "https://");
}

function assetBase(nasaId: string): string {
  const id = encodeURIComponent(nasaId);
  return `${ASSETS}/video/${id}/${id}`;
}

/** The credit NASA gives: "NASA/Bill Ingalls", the outside photographer ("Rocket Lab"), or the centre. */
function creditOf(d: NasaData): string | undefined {
  const who = cleanText(d.photographer || d.secondary_creator);
  if (who && !/^(n\/a|na|none)$/i.test(who)) return who.length > 80 ? `NASA ${d.center ?? ""}`.trim() + ` (${who.split(",")[0]} et al.)` : /\bnasa\b/i.test(who) ? who : `NASA/${who}`;
  return d.center ? `NASA ${d.center}` : "NASA";
}

/**
 * Outside organisations whose footage NASA distributes ("NASA/SpaceX",
 * "United Launch Alliance", "Courtesy of ESA"): it may be copyrighted by them.
 * Individual names are NASA staff or contractors and stay NASA media.
 */
const THIRD_PARTY =
  /\b(spacex|united launch alliance|ula|rocket ?lab|boeing|lockheed|northrop|blue origin|sierra (space|nevada)|axiom|firefly|intuitive machines|astrobotic|virgin (galactic|orbit)|esa|european space agency|jaxa|roscosmos|csa|canadian space agency|isro|getty|reuters|ap photo|associated press|courtesy|copyright)\b|©/i;

export function licenseFor(d: NasaData): License {
  const credit = [d.photographer, d.secondary_creator].map((x) => cleanText(x)).filter(Boolean).join("; ");
  const outside = THIRD_PARTY.exec(credit)?.[0];
  if (outside) {
    return customLicense("NASA media (third-party credit)", {
      url: "https://www.nasa.gov/nasa-brand-center/images-and-media/",
      verdict: "check-terms",
      attributionRequired: true,
      assertedBy: "source",
      note: `Credited to ${credit}: footage from ${outside} may be copyrighted by them even though NASA distributes it. Ask before commercial use.`,
    });
  }
  return asEditorial(license("LicenseRef-NASA-Media", "source"), "");
}

function posterOf(item: NasaItem): string | undefined {
  const links = item.links ?? [];
  const pick = links.find((l) => /~large\.jpg$/.test(l.href)) ?? links.find((l) => /~medium\.jpg$/.test(l.href)) ?? links.find((l) => l.render === "image");
  return pick ? https(pick.href) : undefined;
}

function baseClip(d: NasaData, poster?: string) {
  const description = cleanText(d.description || d.description_508).slice(0, 600) || undefined;
  const year = Number(d.date_created?.slice(0, 4)) || undefined;
  return {
    provider: "nasa",
    nativeId: d.nasa_id,
    title: cleanText(d.title) || d.nasa_id,
    description,
    url: `${SITE}/details/${encodeURIComponent(d.nasa_id)}`,
    author: creditOf(d),
    tags: d.keywords ?? [],
    sourceCategories: [...(d.keywords ?? []), ...(d.album ?? [])],
    year,
    posterUrl: poster,
    previewUrl: `${assetBase(d.nasa_id)}~preview.mp4`,
    previewType: "video/mp4",
    formats: ["mp4"],
    license: licenseFor(d),
    price: { free: true },
    downloadable: true,
    createdAt: d.date_created,
    sourceName: SOURCE_NAME,
  };
}

/** exiftool durations: "0:00:30", "12.5 s", 30. */
export function exifSeconds(v: unknown): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return undefined;
  const hms = /^(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/.exec(v.trim());
  if (hms) return Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3]);
  const s = /^(\d+(?:\.\d+)?)\s*s$/.exec(v.trim());
  return s ? Number(s[1]) : undefined;
}

function num(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Frame size, length, frame rate and audio from metadata.json (exiftool tags). */
export function videoFacts(m: ExifMeta): { width?: number; height?: number; durationSec?: number; fps?: number; hasAudio?: boolean; sizeBytes?: number } {
  const width = num(m["QuickTime:ImageWidth"]) ?? num(m["QuickTime:SourceImageWidth"]) ?? num((m["XMP:VideoFrameSize"] as { W?: number } | undefined)?.W);
  const height = num(m["QuickTime:ImageHeight"]) ?? num(m["QuickTime:SourceImageHeight"]) ?? num((m["XMP:VideoFrameSize"] as { H?: number } | undefined)?.H);
  const durationSec = exifSeconds(m["QuickTime:Duration"]) ?? exifSeconds(m["QuickTime:TrackDuration"]);
  const fps = num(m["QuickTime:VideoFrameRate"]) ?? num(m["XMP:VideoFrameRate"]);
  const hasAudio = m["QuickTime:AudioFormat"] !== undefined || m["QuickTime:AudioChannels"] !== undefined ? true : undefined;
  const sizeBytes = num(m["QuickTime:MediaDataSize"]);
  return { width, height, durationSec, fps, hasAudio, sizeBytes };
}

/** Scale a nominal short side to the master's aspect ratio, never above the master. */
function sizeFor(short: number, master?: { width?: number; height?: number }): { width?: number; height?: number } {
  if (!master?.width || !master?.height) return short >= 1080 ? {} : { width: Math.round((short * 16) / 9), height: short };
  const s = Math.min(master.width, master.height);
  if (short >= s) return { width: master.width, height: master.height };
  const k = short / s;
  const even = (n: number) => Math.round(n / 2) * 2;
  return { width: even(master.width * k), height: even(master.height * k) };
}

export function filesFrom(nasaId: string, urls: string[], master?: { width?: number; height?: number; fps?: number; sizeBytes?: number }): ClipFile[] {
  const out: ClipFile[] = [];
  for (const raw of urls) {
    const url = https(raw);
    const name = decodeURIComponent(url.split("/").pop() ?? "");
    const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
    if (!ext) continue;
    const variant = /~([a-z]+)\.[a-z0-9]+$/i.exec(name)?.[1]?.toLowerCase();
    if (ext === "vtt" || ext === "srt") {
      out.push({ url, filename: name, format: ext, role: "captions" });
    } else if (ext === "jpg" || ext === "png") {
      if (variant === "large" || variant === "orig") out.push({ url, filename: name, format: ext, role: "poster" });
    } else if (["mp4", "mov", "m4v", "webm", "mpg", "mpeg"].includes(ext)) {
      if (variant === "orig") {
        out.push({ url, filename: name, format: ext, mime: "video/mp4", role: "original", width: master?.width, height: master?.height, fps: master?.fps, codec: "h264", sizeBytes: master?.sizeBytes });
      } else if (variant && RENDITIONS[variant]) {
        out.push({ url, filename: name, format: ext, mime: "video/mp4", role: variant === "preview" || variant === "mobile" ? "preview" : "rendition", codec: "h264", ...sizeFor(RENDITIONS[variant]!, master) });
      }
    }
  }
  // Masters stay first, then renditions from big to small.
  return out.sort((a, b) => roleOrder(a) - roleOrder(b) || (b.height ?? 0) - (a.height ?? 0));
  function roleOrder(f: ClipFile) {
    return ["original", "rendition", "preview", "poster", "captions"].indexOf(f.role);
  }
}

export const nasa: Provider = {
  id: "nasa",
  name: SOURCE_NAME,
  homepage: SITE,
  description:
    "About 9k NASA videos: rocket launches, missions, astronauts, Earth from orbit, the Sun and planets. Public domain in the US with credit to NASA (no endorsement, no insignia); MP4 renditions from 180p to the 1080p/4K master.",
  categories: ["space", "science", "aerial", "nature", "tech", "transport", "people", "archive"],
  access: "api",
  pricing: "free",
  supportsDownload: true,
  nativeFilters: ["freeOnly"],

  buildSearchUrl(q) {
    return `${SITE}/search${qs({ q: q.query.trim() || undefined, media: "video" })}`;
  },

  async search(q, ctx) {
    const pageSize = Math.max(1, Math.min(q.limit, MAX_PAGE_SIZE));
    const page = Math.floor((q.offset ?? 0) / pageSize) + 1;
    const url = `${API}/search${qs({ q: q.query.trim() || "nasa", media_type: "video", page_size: pageSize, page })}`;
    const res = await ctx.fetch.json<NasaSearch>(url, { cacheTtlMs: 60 * 60_000, signal: ctx.signal });
    const clips = (res.collection?.items ?? [])
      .map((item) => {
        const d = item.data?.[0];
        if (!d?.nasa_id || (d.media_type && d.media_type !== "video")) return undefined;
        return makeClip(baseClip(d, posterOf(item)));
      })
      .filter((c): c is NonNullable<typeof c> => !!c);
    return { clips, total: res.collection?.metadata?.total_hits, searchUrl: this.buildSearchUrl(q) };
  },

  async getClip(nativeId, ctx) {
    const search = await ctx.fetch.json<NasaSearch>(`${API}/search${qs({ nasa_id: nativeId, media_type: "video" })}`, { cacheTtlMs: 24 * 3600_000, signal: ctx.signal });
    const item = search.collection?.items?.[0];
    const d = item?.data?.[0];
    if (!item || !d) return null;
    const base = assetBase(d.nasa_id);
    const [urls, meta] = await Promise.all([
      ctx.fetch.json<string[]>(`${ASSETS}/video/${encodeURIComponent(d.nasa_id)}/collection.json`, { cacheTtlMs: 24 * 3600_000, signal: ctx.signal }).catch(() => [] as string[]),
      ctx.fetch.json<ExifMeta>(`${base.replace(/\/[^/]+$/, "")}/metadata.json`, { cacheTtlMs: 24 * 3600_000, signal: ctx.signal }).catch(() => ({}) as ExifMeta),
    ]);
    const facts = videoFacts(meta);
    const files = filesFrom(d.nasa_id, urls, facts);
    const preview = files.find((f) => f.role === "preview" && /~preview\./.test(f.filename)) ?? files.find((f) => f.role === "preview");
    const clip = makeClip({
      ...baseClip(d, posterOf(item) ?? files.find((f) => f.role === "poster")?.url),
      width: facts.width,
      height: facts.height,
      durationSec: facts.durationSec,
      fps: facts.fps,
      hasAudio: facts.hasAudio,
      previewUrl: preview?.url ?? `${base}~preview.mp4`,
    });
    return { ...clip, files } satisfies ClipDetails;
  },

  async census(ctx): Promise<SourceCensus> {
    const res = await ctx.fetch.json<NasaSearch>(`${API}/search${qs({ media_type: "video", page_size: 1, q: "nasa" })}`, { signal: ctx.signal, cacheTtlMs: 0 });
    const total = res.collection?.metadata?.total_hits ?? 0;
    const launches = await ctx.fetch.json<NasaSearch>(`${API}/search${qs({ media_type: "video", page_size: 1, q: "launch" })}`, { signal: ctx.signal, cacheTtlMs: 0 });
    return {
      total,
      atLeast: true,
      free: total,
      byCategory: {},
      categories: { launches: launches.collection?.metadata?.total_hits ?? 0 },
      method: "images-api.nasa.gov search total_hits for media_type=video (q=nasa matches almost every item, so it is a lower bound)",
    };
  },
};
