/** Minimal typed client for the server's REST API (same origin). Shapes follow src/core/types.ts. */

export interface License {
  id: string;
  name: string;
  url?: string;
  commercialUse?: boolean;
  attributionRequired?: boolean;
  shareAlike?: boolean;
  redistribution?: boolean;
  /** People, insignia or brands without releases: news/documentary, not ads. */
  editorial?: boolean;
  assertedBy?: "source" | "site" | "uploader";
  verdict: string;
  note?: string;
}
export interface Price { free: boolean; amount?: number; currency?: string }
export interface Clip {
  id: string;
  provider: string;
  nativeId?: string;
  title: string;
  description?: string;
  url: string;
  author?: string;
  authorUrl?: string;
  tags: string[];
  category: string;
  styles?: string[];
  orientation?: "landscape" | "portrait" | "square";
  width?: number;
  height?: number;
  fps?: number;
  durationSec?: number;
  hasAudio?: boolean;
  year?: number;
  /** Still frame, loaded by the browser straight from the source. */
  posterUrl?: string;
  /** Small playable version (≤ 720p), played straight from the source. */
  previewUrl?: string;
  previewType?: string;
  formats?: string[];
  license?: License;
  attribution?: string;
  price?: Price;
  requiresAccount?: boolean;
  downloadable: boolean;
  score?: number;
}
export interface ClipFile {
  url: string;
  filename: string;
  format: string;
  mime?: string;
  role: "original" | "rendition" | "preview" | "poster" | "captions";
  width?: number;
  height?: number;
  fps?: number;
  codec?: string;
  sizeBytes?: number;
  bitrate?: number;
  requiresAuth?: boolean;
}
export interface ClipDetails extends Clip {
  files: ClipFile[];
  /** The file a browser should play, straight from the source. */
  watch?: { url: string; type?: string; width?: number; height?: number };
  shareUrl?: string;
}
export interface ProviderReport {
  provider: string;
  name: string;
  status: "ok" | "error" | "timeout" | "skipped" | "link";
  count: number;
  total?: number;
  searchUrl?: string;
  error?: string;
  filteredLocally?: string[];
  tookMs: number;
}
/** The filters in force after the server parsed the query ("4k vertical 10s"). */
export interface ParsedFilters {
  categories?: string[];
  styles?: string[];
  orientations?: string[];
  minResolution?: number;
  duration?: { min?: number; max?: number };
  minFps?: number;
  hasAudio?: boolean;
  commercialOnly?: boolean;
  freeOnly?: boolean;
}
export interface SearchResponse { query: string; filters?: ParsedFilters; results: Clip[]; providers: ProviderReport[] }
export interface Provider { id: string; name: string; description: string; supportsDownload: boolean; access?: string; categories?: string[] }

const KEY_STORE = "video-assets-server-key";
export class UnauthorizedError extends Error {}

export function getKey(): string {
  try {
    return localStorage.getItem(KEY_STORE) ?? "";
  } catch {
    return "";
  }
}
export function setKey(k: string): void {
  try {
    localStorage.setItem(KEY_STORE, k);
  } catch {
    /* private mode */
  }
}

/** Headers for every same-origin API call. The key travels only as a header, never in a URL. */
export function apiHeaders(extra: Record<string, string> = {}): Record<string, string> {
  // x-video-client lets the server's analytics tell website traffic from other API users.
  const headers: Record<string, string> = { "x-video-client": "web", ...extra };
  const key = getKey();
  if (key) headers["x-api-key"] = key;
  return headers;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? "GET",
    headers: apiHeaders(init.body !== undefined ? { "content-type": "application/json", accept: "application/json" } : { accept: "application/json" }),
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: init.signal,
  });
  if (res.status === 401) throw new UnauthorizedError("This server needs an API key.");
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
  return body;
}

/** `/v1/clips/<id>`: ids hold ":", spaces and slashes, so they are always encoded. */
export const clipBase = (id: string) => `/v1/clips/${encodeURIComponent(id)}`;

export function formatBytes(n?: number): string {
  if (n == null) return "";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i > 1 ? 1 : 0)} ${u[i]}`;
}

/** Only ever put https/http URLs into href/src: results come from third-party sites. */
export function safeUrl(u?: string): string | undefined {
  if (!u) return undefined;
  try {
    const p = new URL(u, typeof window === "undefined" ? "https://localhost" : window.location.href);
    return p.protocol === "https:" || p.protocol === "http:" ? p.href : undefined;
  } catch {
    return undefined;
  }
}

/** A filesystem-friendly name: "Ocean Waves 01" -> "ocean-waves-01". */
export const slugName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "clip";

/** Save text as a file from the browser (sequence exports). */
export function saveText(filename: string, text: string, type = "text/plain"): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}
