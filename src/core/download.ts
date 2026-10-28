import { createWriteStream } from "node:fs";
import { lookup } from "node:dns/promises";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { isIP } from "node:net";
import { basename, dirname, extname, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Zip, ZipPassThrough } from "fflate";
import type { ClipDetails, ClipFile, HttpClient } from "./types.js";
import { BROWSER_PLAYABLE, VIDEO_FORMATS, VIDEO_MIME, resolutionLabel, shortSide } from "./vocab.js";

export interface FileSelection {
  /**
   * Wanted resolution as the short side in pixels (720, 1080, 2160). Picks the
   * smallest file at or above it, else the largest below it.
   */
  height?: number;
  /** Desired container, e.g. "mp4", "webm". */
  format?: string;
  /** Desired role. Default: the original, else the biggest rendition, else a preview. */
  role?: ClipFile["role"];
  /** Return every file that can be fetched (ignores the smart defaults). */
  all?: boolean;
}

const VIDEO_ROLES = new Set<ClipFile["role"]>(["original", "rendition", "preview"]);
/** Most widely usable container first: mp4 opens in every editor and browser. */
const FORMAT_RANK = new Map<string, number>(VIDEO_FORMATS.map((f, i) => [f, i]));

function formatRank(f: ClipFile): number {
  return FORMAT_RANK.get(f.format) ?? 50;
}

function size(f: ClipFile): number | undefined {
  return shortSide(f.width, f.height);
}

function matchesFormat(f: ClipFile, fmt: string): boolean {
  const want = fmt.toLowerCase().replace(/^\./, "");
  return f.format === want || (want === "mp4" && f.format === "m4v");
}

/** Bigger frame first, then the more usable container, then the bigger file (higher bitrate). */
function byQuality(a: ClipFile, b: ClipFile): number {
  return (size(b) ?? 0) - (size(a) ?? 0) || formatRank(a) - formatRank(b) || (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0);
}

/**
 * Pick the file to download for a clip.
 * Default: the original master, else the biggest rendition, else the preview,
 * preferring mp4 among files of the same size. With `height`, the smallest
 * file that reaches that resolution (a 1080p rendition rather than a 4K
 * master), else the biggest one below it. Files that need a login, stills and
 * captions are never picked unless asked for.
 */
export function selectFiles(clip: Pick<ClipDetails, "files">, sel: FileSelection = {}): ClipFile[] {
  let files = clip.files.filter((f) => !f.requiresAuth);
  if (sel.all) return files;
  files = sel.role ? files.filter((f) => f.role === sel.role) : files.filter((f) => VIDEO_ROLES.has(f.role));
  if (sel.format) files = files.filter((f) => matchesFormat(f, sel.format!));
  if (files.length <= 1) return files;

  if (sel.height) {
    const target = sel.height * 0.97;
    const above = files.filter((f) => (size(f) ?? (f.role === "original" ? Infinity : 0)) >= target);
    if (above.length) {
      above.sort((a, b) => (size(a) ?? Infinity) - (size(b) ?? Infinity) || formatRank(a) - formatRank(b));
      return [above[0]!];
    }
    return [[...files].sort(byQuality)[0]!];
  }

  for (const role of ["original", "rendition", "preview"] as const) {
    const hit = files.filter((f) => f.role === role);
    if (hit.length) return [hit.sort(byQuality)[0]!];
  }
  return [[...files].sort(byQuality)[0]!];
}

/**
 * The file the browser player should stream from the source: a container
 * every browser plays (mp4/webm), as close to 720p as possible (big enough to
 * watch, small enough to start fast), never above 1080p unless that is all
 * there is.
 */
export function pickPlayback(clip: Pick<ClipDetails, "files" | "previewUrl" | "previewType">): { url: string; type?: string; width?: number; height?: number } | undefined {
  const playable = clip.files.filter((f) => !f.requiresAuth && !f.headers && VIDEO_ROLES.has(f.role) && BROWSER_PLAYABLE.has(f.format));
  if (playable.length) {
    const score = (f: ClipFile): number => {
      const s = size(f);
      if (s === undefined) return f.role === "preview" ? 2 : 5;
      if (s > 1100) return 3 + s / 10_000; // too heavy to start quickly
      // Same size: a transcode starts faster than the high-bitrate master.
      return Math.abs(s - 720) / 1000 + (f.format === "mp4" ? 0 : 0.05) + (f.role === "original" ? 0.01 : 0);
    };
    const best = [...playable].sort((a, b) => score(a) - score(b))[0]!;
    return { url: best.url, type: best.mime ?? VIDEO_MIME[best.format], width: best.width, height: best.height };
  }
  return clip.previewUrl ? { url: clip.previewUrl, type: clip.previewType } : undefined;
}

/** True when the selection is only a small preview. */
export function isPreviewOnly(files: ClipFile[]): boolean {
  return files.length > 0 && files.every((f) => f.role === "preview");
}

export function totalBytes(files: ClipFile[]): number | undefined {
  let sum = 0;
  for (const f of files) {
    if (f.sizeBytes === undefined) return undefined;
    sum += f.sizeBytes;
  }
  return sum;
}

/** Normalise a relative path and refuse anything that escapes its root. */
export function safeRelative(p: string): string {
  const parts = p.replace(/\\/g, "/").split("/").filter((s) => s && s !== ".");
  if (parts.some((s) => s === "..")) throw new Error(`Unsafe path in file list: ${p}`);
  const joined = parts.join("/");
  if (!joined) throw new Error(`Empty path in file list`);
  return joined;
}

/** A file name that is safe on every OS. */
export function safeFilename(name: string, fallback = "clip"): string {
  const base = basename(name.replace(/\\/g, "/"));
  const ext = extname(base).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 8);
  const stem = base
    .slice(0, base.length - extname(base).length)
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return `${stem || fallback}${ext}`;
}

// ---------------------------------------------------------------------------
// Outbound URL safety (scraped pages and manifests are untrusted)

const PRIVATE_HOST = /^(localhost|.*\.localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i;
const PRIVATE_V4 = /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|22[4-9]\.|23\d\.|24\d\.|25[0-5]\.)/;

function isPrivateAddress(addr: string): boolean {
  const a = addr.replace(/^\[|\]$/g, "").toLowerCase();
  if (isIP(a) === 4) return PRIVATE_V4.test(a);
  if (isIP(a) === 6) {
    if (a === "::1" || a === "::") return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a);
    if (mapped) return PRIVATE_V4.test(mapped[1]!);
    // URL parsing rewrites ::ffff:10.0.0.1 as ::ffff:a00:1.
    const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(a);
    if (hex) {
      const hi = parseInt(hex[1]!, 16);
      const lo = parseInt(hex[2]!, 16);
      return PRIVATE_V4.test(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    return /^(f[cd]|fe[89ab])/.test(a);
  }
  return false;
}

/** Refuse non-http(s) URLs and obvious internal targets, by name and literal address. */
export function assertPublicUrl(url: string): URL {
  const u = new URL(url);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`Refusing non-HTTP URL: ${url}`);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (PRIVATE_HOST.test(host)) throw new Error(`Refusing internal host: ${host}`);
  if (isPrivateAddress(host)) throw new Error(`Refusing private address: ${host}`);
  return u;
}

type HostResolver = (host: string) => Promise<string[]>;
let resolveHost: HostResolver = async (host) => (await lookup(host, { all: true, verbatim: true })).map((r) => r.address);

/** Tests swap the DNS resolver. */
export function setHostResolver(fn: HostResolver): void {
  resolveHost = fn;
}

/**
 * Like assertPublicUrl, and also resolves the host and refuses names that
 * point at private addresses. A name that doesn't resolve locally (e.g. behind
 * an egress proxy) is allowed: the fetch itself fails if it is unreachable.
 */
export async function assertPublicHost(url: string): Promise<URL> {
  const u = assertPublicUrl(url);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return u;
  let addrs: string[] = [];
  try {
    addrs = await resolveHost(host);
  } catch {
    return u;
  }
  if (addrs.some(isPrivateAddress)) throw new Error(`Refusing ${host}: it resolves to a private address`);
  return u;
}

const MAX_REDIRECTS = 5;
export const DOWNLOAD_IDLE_TIMEOUT_MS = Number(process.env.VIDEO_SERVER_DOWNLOAD_IDLE_MS ?? 30_000);

/** GET a file, re-checking every redirect hop; the body is watched for stalls, not capped in time. */
export async function fetchFile(http: HttpClient, url: string, headers: Record<string, string> = {}, signal?: AbortSignal): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(current);
    const res = await http.raw(current, {
      headers: { accept: "*/*", ...headers },
      redirect: "manual",
      idleTimeoutMs: DOWNLOAD_IDLE_TIMEOUT_MS,
      signal,
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      await res.body?.cancel().catch(() => undefined);
      if (!loc) throw new Error(`Redirect without Location from ${current}`);
      current = new URL(loc, current).toString();
      // Credentials stay with the host they were meant for.
      if (new URL(current).host !== new URL(url).host) headers = withoutAuth(headers);
      continue;
    }
    return res;
  }
  throw new Error(`Too many redirects for ${url}`);
}

function withoutAuth(h: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(h).filter(([k]) => k.toLowerCase() !== "authorization"));
}

// ---------------------------------------------------------------------------
// Local downloads (stdio MCP / CLI)

export interface DownloadOptions {
  /** Abort when the download exceeds this many bytes. */
  maxBytes?: number;
  overwrite?: boolean;
  signal?: AbortSignal;
}

export interface DownloadedFile {
  path: string;
  bytes: number;
  role: ClipFile["role"];
}

export interface DownloadResult {
  directory: string;
  files: DownloadedFile[];
  bytes: number;
  /** True when only a small preview could be fetched. */
  previewOnly: boolean;
}

export const DEFAULT_MAX_DOWNLOAD_BYTES = Number(process.env.VIDEO_SERVER_MAX_DOWNLOAD_BYTES ?? 8 * 1024 ** 3);

/**
 * Where one clip goes inside the download folder, filed by category so a
 * project's footage folder stays browsable:
 * `nature/ocean/wikimediacommons-Waves_at_dusk Waves at dusk (1080p).webm`.
 */
export function clipPath(clip: Pick<ClipDetails, "provider" | "nativeId" | "title" | "category">, file: ClipFile): string {
  const slug = safeFilename(`${clip.provider}-${shortId(clip.nativeId)} ${clip.title}`.slice(0, 90)).replace(/\.[^.]*$/, "");
  const ext = file.format ? `.${file.format}` : extname(file.filename);
  const dir = clip.category.split(".").slice(0, 2).join("/");
  const res = resolutionLabel(file.width, file.height)?.replace(/^.* /, "");
  const suffix = file.role === "preview" ? " (preview)" : file.role === "poster" ? " (poster)" : res ? ` (${res})` : "";
  return `${dir}/${slug}${suffix}${ext}`;
}

function shortId(id: string): string {
  const s = id.replace(/[^\w-]+/g, "_");
  return s.length > 24 ? s.slice(-24) : s;
}

/** Download the chosen files of one clip into `destDir` (local mode only: never on the hosted server). */
export async function downloadClip(
  http: HttpClient,
  clip: ClipDetails,
  files: ClipFile[],
  destDir: string,
  opts: DownloadOptions = {},
): Promise<DownloadResult> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_DOWNLOAD_BYTES;
  const known = totalBytes(files);
  if (known !== undefined && known > maxBytes) {
    throw new Error(`Selection is ${formatBytes(known)}, above the ${formatBytes(maxBytes)} limit.`);
  }
  const root = resolve(destDir);
  await mkdir(root, { recursive: true });
  const written: DownloadedFile[] = [];
  let bytes = 0;

  for (const file of files) {
    const rel = safeRelative(clipPath(clip, file));
    const target = resolve(root, rel);
    if (target !== root && !target.startsWith(root + sep)) throw new Error(`Unsafe path: ${rel}`);
    if (!opts.overwrite && (await exists(target))) {
      written.push({ path: target, bytes: (await stat(target)).size, role: file.role });
      continue;
    }
    await mkdir(dirname(target), { recursive: true });
    const res = await fetchFile(http, file.url, file.headers, opts.signal);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${file.url}`);
    if (!res.body) throw new Error(`Empty response for ${file.url}`);
    let received = 0;
    const counter = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, ctrl) {
        received += chunk.byteLength;
        if (bytes + received > maxBytes) ctrl.error(new Error(`Download exceeded ${formatBytes(maxBytes)} limit`));
        else ctrl.enqueue(chunk);
      },
    });
    // Write to a temp name and rename, so an interrupted download never looks complete.
    const partial = `${target}.part`;
    try {
      await pipeline(Readable.fromWeb(res.body.pipeThrough(counter) as never), createWriteStream(partial));
      await rename(partial, target);
    } catch (e) {
      await rm(partial, { force: true });
      throw e;
    }
    bytes += received;
    written.push({ path: target, bytes: received, role: file.role });
  }
  return { directory: root, files: written, bytes, previewOnly: isPreviewOnly(files) };
}

// ---------------------------------------------------------------------------
// One zip for the browser (HTTP API)

export interface BundleEntry {
  path: string;
  url: string;
  headers?: Record<string, string>;
}

/**
 * Stream files as a single zip (no recompression: video doesn't compress).
 * The hosted server uses it for the credits bundle only (no video entries);
 * local callers may add files,
 * plus small generated entries (ATTRIBUTION.md, credits.json). Stops with an
 * error once `maxBytes` of source data have been streamed.
 */
export function zipStream(
  http: HttpClient,
  entries: BundleEntry[],
  folder: string,
  opts: { extra?: { path: string; content: string }[]; maxBytes?: number; signal?: AbortSignal } = {},
): ReadableStream<Uint8Array> {
  const prefix = safeRelative(folder);
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_DOWNLOAD_BYTES;
  let zip: Zip | undefined;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      zip = new Zip((err, chunk, final) => {
        if (err) return controller.error(err);
        controller.enqueue(chunk);
        if (final) controller.close();
      });
      let total = 0;
      try {
        for (const x of opts.extra ?? []) {
          const entry = new ZipPassThrough(`${prefix}/${safeRelative(x.path)}`);
          zip.add(entry);
          entry.push(new TextEncoder().encode(x.content), true);
        }
        const used = new Set<string>();
        for (const item of entries) {
          let path = safeRelative(item.path);
          for (let n = 2; used.has(path); n++) path = path.replace(/(\.[^./]*)?$/, ` (${n})$1`);
          used.add(path);
          const res = await fetchFile(http, item.url, item.headers, opts.signal);
          const entry = new ZipPassThrough(`${prefix}/${path}`);
          zip.add(entry);
          const reader = res.body!.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > maxBytes) {
              await reader.cancel();
              throw new Error(`Bundle exceeded ${formatBytes(maxBytes)} limit`);
            }
            entry.push(value);
          }
          entry.push(new Uint8Array(0), true);
        }
        zip.end();
      } catch (e) {
        zip.terminate();
        controller.error(e);
      }
    },
    cancel() {
      zip?.terminate();
    },
  });
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export function formatBytes(n: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
}

/** Folder name for a clip bundle: `<provider>-<slug>`. */
export function clipFolderName(clip: { provider: string; nativeId: string }): string {
  const slug = clip.nativeId.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "").slice(-80) || "clip";
  return `${clip.provider}-${slug}`;
}
