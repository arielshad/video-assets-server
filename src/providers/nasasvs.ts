import { license } from "../core/licence.js";
import type { Clip, ClipDetails, ClipFile, License, Provider, ProviderContext, SourceCensus } from "../core/types.js";
import { cleanText, makeClip, qs } from "../core/util.js";
import type { VideoStyle } from "../core/vocab.js";

/**
 * NASA Scientific Visualization Studio (svs.gsfc.nasa.gov): about 10k pages
 * of data visualisations and animations — Earth's weather and climate, the
 * Sun, the Moon, planets, galaxies — usually as 1080p and 4K MP4 (often 60
 * fps). They make striking, explanation-free motion backgrounds.
 *
 * API (keyless, JSON): `/api/search/?search=…&limit=&offset=` returns id,
 * title, description, type and release date, but no media. A page's files
 * come from `/api/<id>` (`main_image`, `main_video` and `media_groups`).
 * So a search fetches the details of its first few results (cached for a
 * day) to show posters and frame sizes; later results link to the page and
 * get their media when opened.
 *
 * Licence: produced by NASA, public domain in the US, credit "NASA's
 * Scientific Visualization Studio". No people or insignia in data
 * visualisations, so they are not flagged editorial.
 */

const SITE = "https://svs.gsfc.nasa.gov";
const API = `${SITE}/api`;
const SOURCE_NAME = "NASA Scientific Visualization Studio";
const MAX_PAGE_SIZE = 100;
/** Results whose details (poster, files) are fetched during a search. */
const ENRICH = 6;

interface SvsResult {
  id: number | string;
  url?: string;
  result_type?: string;
  release_date?: string;
  title?: string;
  description?: string;
  hits?: number;
}

interface SvsSearch {
  count?: number;
  results?: SvsResult[];
}

interface SvsMedia {
  url?: string;
  filename?: string;
  media_type?: string;
  alt_text?: string;
  width?: number;
  height?: number;
  duration?: number | null;
  frame_rate?: number | null;
}

interface SvsPage {
  id: number | string;
  url?: string;
  page_type?: string;
  title?: string;
  description?: string;
  release_date?: string;
  main_image?: SvsMedia | null;
  main_video?: SvsMedia | null;
  main_credits?: Record<string, { name?: string }[]>;
  media_groups?: { items?: { instance?: SvsMedia | null }[] }[];
  keywords?: string[];
  nasa_science_categories?: string[];
  missions?: string[];
}

function https(u: string | undefined): string | undefined {
  return u?.replace(/^http:\/\//, "https://");
}

export function svsLicense(): License {
  const base = license("LicenseRef-NASA-Media", "source");
  return {
    ...base,
    editorial: undefined,
    note: "Made by NASA, so not copyrighted in the US. Credit \"NASA's Scientific Visualization Studio\" and don't imply NASA endorses you.",
  };
}

function stylesOf(type: string | undefined): VideoStyle[] {
  const t = (type ?? "").toLowerCase();
  if (t.includes("visualization")) return ["visualization"];
  if (t.includes("animation")) return ["animation"];
  return [];
}

/** "lucy_trajectory_1080p60.mp4" → 60. */
export function fpsFromName(name: string | undefined): number | undefined {
  const m = /\d{3,4}p(\d{2,3})\b/i.exec(name ?? "");
  return m ? Number(m[1]) : undefined;
}

function baseClip(r: SvsResult | SvsPage) {
  const type = "result_type" in r ? r.result_type : (r as SvsPage).page_type;
  const page = r as SvsPage;
  const keywords = page.keywords ?? [];
  return {
    provider: "nasasvs",
    nativeId: String(r.id),
    title: cleanText(r.title) || `SVS ${r.id}`,
    description: cleanText(r.description?.replace(/\|\|/g, " ")).slice(0, 600) || undefined,
    url: `${SITE}/${r.id}/`,
    author: creditOf(page),
    tags: [...keywords, ...(page.missions ?? [])],
    sourceCategories: [...(page.nasa_science_categories ?? []), ...keywords, "space"],
    styles: stylesOf(type),
    license: svsLicense(),
    price: { free: true },
    downloadable: true,
    createdAt: r.release_date,
    year: Number(r.release_date?.slice(0, 4)) || undefined,
    popularity: "hits" in r ? (r as SvsResult).hits : undefined,
    sourceName: SOURCE_NAME,
  };
}

function creditOf(p: SvsPage): string {
  const people = Object.values(p.main_credits ?? {})
    .flat()
    .map((x) => cleanText(x?.name))
    .filter(Boolean);
  return people.length ? `NASA's Scientific Visualization Studio (${people.slice(0, 2).join(", ")})` : "NASA's Scientific Visualization Studio";
}

/** Every movie on the page (de-duplicated), plus the main image as the poster. */
export function filesOf(p: SvsPage): ClipFile[] {
  const seen = new Set<string>();
  const out: ClipFile[] = [];
  const media = [p.main_video, ...(p.media_groups ?? []).flatMap((g) => (g.items ?? []).map((i) => i.instance))].filter(
    (m): m is SvsMedia => !!m?.url && m.media_type === "Movie",
  );
  for (const m of media) {
    const url = https(m.url)!;
    if (seen.has(url)) continue;
    seen.add(url);
    const format = /\.([a-z0-9]+)$/i.exec(m.filename ?? url)?.[1]?.toLowerCase() ?? "mp4";
    if (!["mp4", "webm", "mov", "m4v", "mpeg", "mpg"].includes(format)) continue;
    out.push({
      url,
      filename: m.filename ?? url.split("/").pop()!,
      format,
      mime: format === "mp4" || format === "m4v" ? "video/mp4" : format === "webm" ? "video/webm" : undefined,
      role: "rendition",
      width: m.width ?? undefined,
      height: m.height ?? undefined,
      fps: m.frame_rate ?? fpsFromName(m.filename),
    });
  }
  // The largest movie is the master; the rest are renditions (other sizes, labelled/unlabelled versions).
  const biggest = [...out].sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0))[0];
  if (biggest) biggest.role = "original";
  const poster = https(p.main_image?.url);
  if (poster) out.push({ url: poster, filename: p.main_image?.filename ?? "poster.jpg", format: "jpg", role: "poster", width: p.main_image?.width ?? undefined, height: p.main_image?.height ?? undefined });
  return out;
}

function fromPage(p: SvsPage): ClipDetails | undefined {
  const files = filesOf(p);
  const videos = files.filter((f) => f.role !== "poster");
  if (!videos.length) return undefined;
  const main = p.main_video?.url ? videos.find((f) => f.url === https(p.main_video!.url)) : undefined;
  const best = videos.find((f) => f.role === "original")!;
  const watch = [...videos].filter((f) => f.format === "mp4").sort((a, b) => Math.abs((a.height ?? 0) - 720) - Math.abs((b.height ?? 0) - 720))[0];
  const clip = makeClip({
    ...baseClip(p),
    width: best.width,
    height: best.height,
    fps: (main ?? best).fps,
    durationSec: p.main_video?.duration ?? undefined,
    hasAudio: undefined,
    posterUrl: files.find((f) => f.role === "poster")?.url,
    previewUrl: watch?.url,
    previewType: watch?.mime,
    formats: [...new Set(videos.map((f) => f.format))],
  });
  return { ...clip, files };
}

async function page(id: string, ctx: ProviderContext): Promise<SvsPage | null> {
  try {
    return await ctx.fetch.json<SvsPage>(`${API}/${encodeURIComponent(id)}`, { cacheTtlMs: 24 * 3600_000, signal: ctx.signal });
  } catch {
    return null;
  }
}

export const nasasvs: Provider = {
  id: "nasasvs",
  name: SOURCE_NAME,
  homepage: SITE,
  description:
    "About 10k NASA data visualisations and animations: Earth's weather and climate, the Sun, the Moon, planets and galaxies, mostly 1080p and 4K MP4 at 30–60 fps. Public domain, credit NASA's SVS.",
  categories: ["space", "science", "nature", "background"],
  access: "api",
  pricing: "free",
  supportsDownload: true,
  nativeFilters: ["freeOnly"],

  buildSearchUrl(q) {
    return `${SITE}/search/${qs({ search: q.query.trim() || undefined })}`;
  },

  async search(q, ctx) {
    const limit = Math.max(1, Math.min(q.limit, MAX_PAGE_SIZE));
    const res = await ctx.fetch.json<SvsSearch>(`${API}/search/${qs({ search: q.query.trim() || undefined, limit, offset: q.offset || undefined })}`, {
      cacheTtlMs: 60 * 60_000,
      signal: ctx.signal,
    });
    const results = res.results ?? [];
    const details = await Promise.all(results.slice(0, ENRICH).map((r) => page(String(r.id), ctx)));
    const clips: Clip[] = [];
    results.forEach((r, i) => {
      const d = details[i];
      if (i < ENRICH && d) {
        const full = fromPage(d);
        // A page with no movie at all (an image gallery, a print) is not footage.
        if (!full) return;
        const { files: _files, ...clip } = full;
        clips.push(clip);
      } else {
        clips.push(makeClip(baseClip(r)));
      }
    });
    return { clips, total: res.count, searchUrl: this.buildSearchUrl(q) };
  },

  async getClip(nativeId, ctx) {
    const p = await ctx.fetch.json<SvsPage>(`${API}/${encodeURIComponent(nativeId)}`, { cacheTtlMs: 24 * 3600_000, signal: ctx.signal });
    return p ? (fromPage(p) ?? null) : null;
  },

  async census(ctx): Promise<SourceCensus> {
    const count = async (params: Record<string, string>) => (await ctx.fetch.json<SvsSearch>(`${API}/search/${qs({ ...params, limit: 1 })}`, { signal: ctx.signal, cacheTtlMs: 0 })).count ?? 0;
    const total = await count({});
    return {
      total,
      free: total,
      byCategory: { space: total },
      method: "SVS search API count for all pages (some pages hold only images)",
    };
  },
};
