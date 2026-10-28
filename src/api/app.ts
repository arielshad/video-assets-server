import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Hono, type Context } from "hono";
import { compress } from "hono/compress";
import { cors } from "hono/cors";
import { z } from "zod";
import { clientFamily, noopAnalytics, type Analytics, type Surface } from "../core/analytics.js";
import { creditsJson, creditsMarkdown } from "../core/credits.js";
import { assertPublicUrl, clipFolderName, clipPath, pickPlayback, selectFiles, totalBytes, zipStream } from "../core/download.js";
import { HttpError } from "../core/http.js";
import { parseShotList, planSequence, sequenceExports } from "../core/sequence.js";
import {
  ClipService,
  InvalidClipIdError,
  UnknownProviderError,
  UnsupportedError,
  errorMessage,
} from "../core/service.js";
import { LocalStats, PrometheusStats, cachedStats, teeAnalytics, type StatsSource } from "../core/stats.js";
import type { ClipDetails, ClipFile, DurationRange } from "../core/types.js";
import { CATEGORIES, ORIENTATIONS, VIDEO_STYLES, resolutionTier, type Category } from "../core/vocab.js";
import type { NetworkClassifier } from "../core/network.js";
import { DailyCallers, SessionTokens, checkConsistency, pickClient, versionLabel } from "../mcp/attribution.js";
import { createMcpServer } from "../mcp/server.js";
import { prefersMarkdown } from "./negotiate.js";
import { openApiSpec } from "./openapi.js";
import { RATE_LIMIT_HEADERS, clientIp, rateLimit, type RateLimitOptions } from "./ratelimit.js";
import { OgImages } from "./og.js";
import { clipMeta, searchMeta, searchShare, shareableClipId, type HeadMeta } from "./search-meta.js";
import { Site, rewriteHead, type ServeOptions, type UmamiOptions } from "./site.js";

export interface AppOptions {
  /** Require this key as `Authorization: Bearer <key>` or `x-api-key` on /v1 and /mcp. */
  apiKey?: string;
  /** Externally reachable base URL (for links handed to MCP clients). */
  publicBaseUrl?: string;
  /** Allow the MCP download tool to write to this server's disk. Off by default for HTTP. */
  allowServerDownloads?: boolean;
  /** Turn off MCP over Streamable HTTP at /mcp (on when unset). The website and /v1 API are unaffected. */
  httpMcpDisabled?: boolean;
  downloadDir?: string;
  /** Product analytics sink (metrics + event log). Defaults to no-op. */
  analytics?: Analytics;
  /** Built website root (web/dist copied to dist/web). Defaults to ../web next to this file. */
  siteRoot?: string;
  /** Per-client limit on /v1/* and /mcp (with RateLimit headers). Off when unset. */
  rateLimit?: RateLimitOptions;
  /**
   * Prometheus that scrapes this server's metrics, for /v1/stats over 24 hours
   * and 7 days. Without it, /v1/stats counts this process since it started.
   */
  prometheus?: { url: string; fetch?: typeof fetch };
  /** Add the self-hosted Umami tracker to every page (cookieless visit counts). Off when unset. */
  umami?: UmamiOptions;
  /** Labels MCP callers by network (src/core/network.ts). Without it, the label is `unknown`. */
  networks?: NetworkClassifier;
  /**
   * Signs the MCP session IDs that carry the client's declared name
   * (analytics only). Random per process when unset, so sessions from before
   * a restart then count as `bad_session`.
   */
  mcpSessionSecret?: string;
}

/** Short, guessable URLs for developer resources. */
const ALIASES: Record<string, string> = {
  "/api": "/docs/api",
  "/api-docs": "/docs/api/reference",
  "/reference": "/docs/api/reference",
  "/developers": "/docs",
  "/about-us": "/about",
  "/privacy-policy": "/privacy",
};

const DEFAULT_SITE_ROOT = fileURLToPath(new URL("../web", import.meta.url));

/** The bundled website marks its API calls so analytics can tell it apart from other API users. */
const WEB_CLIENT_HEADER = "x-video-client";

/** Bounded route label for metrics (never the raw path). */
function routeLabel(path: string): string {
  if (path === "/v1/search" || path === "/v1/providers" || path === "/v1/stats" || path === "/v1/catalog" || path === "/mcp" || path === "/openapi.json" || path === "/health") {
    return path;
  }
  if (path.startsWith("/v1/clips/")) {
    for (const tail of ["download", "files", "credits"]) if (path.endsWith(`/${tail}`)) return `/v1/clips/:id/${tail}`;
    return "/v1/clips/:id";
  }
  if (path === "/v1/sequences") return path;
  if (path.startsWith("/v1/")) return "/v1/other";
  if (path === "/og/query.png" || path === "/og/clip.png") return path;
  if (path.startsWith("/_astro/") || path.startsWith("/scalar/") || path.startsWith("/fonts/") || path.startsWith("/og/")) return "static-asset";
  return "site";
}

function tally(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}

const csv = z
  .string()
  .optional()
  .transform((s) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean) : undefined));
const bool = z
  .enum(["true", "false", "1", "0", "yes", "no"])
  .optional()
  .transform((v) => (v === undefined ? undefined : ["true", "1", "yes"].includes(v)));

const num = z.coerce.number().finite().optional();

/** "1080", "4k", "hd" → pixels of the short side. */
const resolutionParam = z
  .string()
  .optional()
  .transform((v, ctx): number | undefined => {
    if (!v?.trim()) return undefined;
    const t = v.trim().toLowerCase().replace(/p$/, "");
    const named: Record<string, number> = { hd: 720, fhd: 1080, fullhd: 1080, "full-hd": 1080, qhd: 1440, "2k": 1440, "4k": 2160, uhd: 2160 };
    const n = named[t] ?? Number(t);
    if (!Number.isFinite(n) || n < 144 || n > 4320) {
      ctx.addIssue({ code: "custom", message: `min_resolution must be 720, 1080, 1440, 2160 or hd/fhd/4k, got "${v}"` });
      return z.NEVER;
    }
    return n;
  });

const searchParams = z.object({
  q: z.string().max(300).default(""),
  category: csv.pipe(z.array(z.enum(CATEGORIES as [Category, ...Category[]])).optional()),
  style: csv.pipe(z.array(z.enum(VIDEO_STYLES)).optional()),
  orientation: csv.pipe(z.array(z.enum(ORIENTATIONS)).optional()),
  min_resolution: resolutionParam,
  min_duration: num,
  max_duration: num,
  min_fps: num,
  audio: bool,
  commercial: bool,
  free: bool,
  downloadable: bool,
  strict: bool,
  providers: csv,
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).max(1000).optional(),
});

const sequenceBody = z.object({
  shots: z.union([z.array(z.string().min(2).max(300)).min(1).max(24), z.string().min(2).max(6000)]),
  orientation: z.enum(ORIENTATIONS).optional(),
  width: z.number().int().min(160).max(7680).optional(),
  height: z.number().int().min(160).max(7680).optional(),
  fps: z.number().min(1).max(120).optional(),
  totalDuration: z.number().positive().max(3600).optional(),
  commercialOnly: z.boolean().optional(),
  providers: z.array(z.string()).max(40).optional(),
  alternatives: z.number().int().min(0).max(5).optional(),
  name: z.string().max(60).optional(),
});

const fileParams = z.object({
  /** Wanted resolution (short side): the smallest file at or above it. */
  height: z.coerce.number().int().min(144).max(4320).optional(),
  format: z.string().max(10).optional(),
  role: z.enum(["original", "rendition", "preview", "poster", "captions"]).optional(),
  all: bool,
});

/** Never hand source request headers (Referer, a caller's token) back to clients. */
export function publicFiles(files: ClipFile[]): Omit<ClipFile, "headers">[] {
  return files.map(({ headers: _h, ...f }) => f);
}

export function publicClip<T extends ClipDetails>(s: T): Omit<T, "files"> & { files: Omit<ClipFile, "headers">[] } {
  return { ...s, files: publicFiles(s.files) };
}

function sameSecret(given: string | undefined, key: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Header-safe (ASCII) version of a string. */
function headerValue(s: string): string {
  return s.normalize("NFKD").replace(/[^\x20-\x7e]/g, "").slice(0, 900);
}

/**
 * Per-request page rewrites:
 * - /search gets a CSP nonce (its sheet's scroll lock injects a <style> tag and
 *   reads the nonce from <meta property="csp-nonce">) and unique metadata for
 *   query variants;
 * - the Scalar API playground injects styles at runtime, so it alone gets
 *   inline styles (it is noindex and disallowed for crawlers).
 */
/**
 * Per-request page changes. /search gets a CSP nonce, and for share links
 * (query variants or `?clip=`) a unique title, description, share card and
 * og:url; `pre` carries metadata looked up ahead of time (the clip).
 */
function pageRewrite(route: string, params: URLSearchParams, origin: string, pre?: HeadMeta): ServeOptions["rewrite"] {
  if (route === "/search") {
    const meta = pre ?? searchMeta(params);
    const share = pre ? `clip=${encodeURIComponent(params.get("clip") ?? "")}` : searchShare(params)?.key;
    return (html) => {
      const nonce = randomBytes(16).toString("base64");
      const withNonce = html.replace("<head>", `<head><meta property="csp-nonce" content="${nonce}">`);
      if (!meta) return { html: withNonce, styleNonce: nonce };
      const head = { ...meta, image: meta.image && origin + meta.image, url: share ? `${origin}/search?${share}` : undefined };
      return { html: rewriteHead(withNonce, head), styleNonce: nonce };
    };
  }
  if (route === "/docs/api/playground") return (html) => ({ html, inlineStyles: true });
  return undefined;
}

const OG_HEADERS = { "content-type": "image/png", "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff" };
/** Clip lookups for share-link metadata must not hold a page load for long. */
const SHARE_LOOKUP_MS = 3500;

export function createApp(service: ClipService, opts: AppOptions = {}): Hono {
  const app = new Hono();
  // Every event also feeds the in-process tallies behind /v1/stats.
  const localStats = new LocalStats();
  const analytics = teeAnalytics(opts.analytics ?? noopAnalytics, localStats);
  const httpMcp = !opts.httpMcpDisabled;
  const stats: StatsSource = opts.prometheus
    ? cachedStats(new PrometheusStats({ ...opts.prometheus, fallback: localStats }), 60_000)
    : localStats;
  const site = Site.load(opts.siteRoot ?? DEFAULT_SITE_ROOT, { umami: opts.umami });
  const who = (c: Context): { surface: Surface; client: string } => ({
    surface: c.req.header(WEB_CLIENT_HEADER) === "web" ? "web" : "api",
    client: clientFamily(c.req.header("user-agent")),
  });

  app.use("*", async (c, next) => {
    const started = Date.now();
    await next();
    if (c.req.path === "/health") return; // probes would drown everything else
    analytics.httpRequest({ route: routeLabel(c.req.path), method: c.req.method, status: c.res.status, tookMs: Date.now() - started });
  });

  // HSTS on every HTTPS response (TLS terminates at the edge proxy, which sets X-Forwarded-Proto).
  const httpsOrigin = opts.publicBaseUrl?.startsWith("https://") ?? false;
  app.use("*", async (c, next) => {
    await next();
    if (httpsOrigin || c.req.header("x-forwarded-proto") === "https") {
      c.res.headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
    }
  });

  // Gzip/deflate text responses that aren't already encoded (site files are
  // Brotli-compressed by Site). Zip downloads are not compressible, so they
  // stream through untouched.
  app.use("*", compress());

  // CORS only where cross-origin reads make sense: the API, MCP and the
  // machine-readable files. HTML pages don't send Access-Control-Allow-Origin.
  const corsMw = cors({ origin: "*", exposeHeaders: ["mcp-session-id", ...RATE_LIMIT_HEADERS] });
  app.use("*", (c, next) => {
    const p = c.req.path;
    const machine = p.startsWith("/v1/") || p === "/mcp" || p === "/health" || /\.(json|md|txt|xml)$/i.test(p);
    return machine ? corsMw(c, next) : next();
  });
  if (opts.rateLimit && opts.rateLimit.limit > 0) {
    const limiter = rateLimit(opts.rateLimit);
    app.use("/v1/*", limiter);
    app.use("/mcp", limiter);
    app.use("/og/query.png", limiter);
    app.use("/og/clip.png", limiter);
  }

  if (opts.apiKey) {
    const key = opts.apiKey;
    const guard = async (c: Context, next: () => Promise<void>) => {
      const auth = c.req.header("authorization");
      // Headers only: a key in the URL would end up in logs, history and Referer headers.
      const given = auth?.startsWith("Bearer ") ? auth.slice(7) : c.req.header("x-api-key");
      if (!sameSecret(given, key)) return c.json({ error: "unauthorized" }, 401);
      await next();
    };
    app.use("/v1/*", guard);
    app.use("/mcp", guard);
  }

  app.onError((err, c) => {
    if (err instanceof UnknownProviderError || err instanceof InvalidClipIdError || err instanceof z.ZodError) {
      return c.json({ error: err instanceof z.ZodError ? z.prettifyError(err) : err.message }, 400);
    }
    if (err instanceof UnsupportedError) return c.json({ error: err.message }, 501);
    if (err instanceof HttpError) return c.json({ error: `Upstream error: ${err.message}` }, err.status === 404 ? 404 : 502);
    console.error(err);
    return c.json({ error: errorMessage(err) }, 500);
  });

  /**
   * Serve a site file, or the 404 page; undefined when there is no site.
   * Pages negotiate HTML vs Markdown on Accept (`/` -> /AGENTS.md, `/docs/mcp`
   * -> /docs/mcp.md) and say so with `Vary: Accept`; unknown paths answer a
   * Markdown 404 to agents and the HTML 404 page to browsers.
   */
  const origin = (c: Context) => (opts.publicBaseUrl ?? new URL(c.req.url).origin).replace(/\/$/, "");
  const serveSite = (c: Context, path: string, pre?: HeadMeta): Response | undefined => {
    if (!site) return undefined;
    const markdown = prefersMarkdown(c.req.header("accept"));
    const route = path.length > 1 ? path.replace(/\/+$/, "") : path;
    const negotiated = site.isPage(route);
    const twin = markdown && negotiated ? site.markdownFor(route) : undefined;
    const serveOpts: ServeOptions = {
      ifNoneMatch: c.req.header("if-none-match"),
      acceptEncoding: c.req.header("accept-encoding"),
      rewrite: twin ? undefined : pageRewrite(route, new URL(c.req.url).searchParams, origin(c), pre),
    };
    let hit = site.resolve(twin ?? path, serveOpts);
    if (markdown && (!hit || ("status" in hit && hit.status === 404))) {
      hit = site.markdownNotFound(path, opts.publicBaseUrl ?? new URL(c.req.url).origin);
    }
    if (!hit) return undefined;
    if ("redirect" in hit) return c.redirect(hit.redirect + (new URL(c.req.url).search || ""), 301);
    const headers = { ...hit.headers };
    if (negotiated && !/\bAccept\b/.test(headers.vary ?? "")) headers.vary = headers.vary ? `Accept, ${headers.vary}` : "Accept";
    if (hit.page && hit.status === 200) analytics.pageView({ page: hit.page });
    else if (twin && hit.status === 200) analytics.pageView({ page: `${route} (markdown)` });
    if (c.req.method === "HEAD") return new Response(null, { status: hit.status, headers });
    return new Response(hit.status === 304 ? null : new Uint8Array(hit.body), { status: hit.status, headers });
  };

  app.get("/", (c) => {
    const accept = c.req.header("accept") ?? "";
    if (site && (accept.includes("text/html") || accept.includes("text/markdown"))) return serveSite(c, "/")!;
    // The same URL serves HTML, Markdown or this JSON index depending on Accept.
    c.header("vary", "Accept");
    return c.json({
      name: "video-assets-server",
      description: "Search and download free stock video (b-roll, backgrounds, nature, cities, space, science, archive films) across many sources, with licence verdicts for commercial use.",
      agents: {
        instructions: "/AGENTS.md",
        llms: "/llms.txt",
        ...(httpMcp && { mcp: `claude mcp add --transport http video ${(opts.publicBaseUrl ?? new URL(c.req.url).origin).replace(/\/$/, "")}/mcp` }),
      },
      endpoints: {
        providers: "/v1/providers",
        stats: "/v1/stats",
        catalog: "/v1/catalog",
        search: "/v1/search?q=ocean+waves&orientation=portrait&min_resolution=1080&commercial=true",
        clip: "/v1/clips/{provider}:{id}",
        files: "/v1/clips/{provider}:{id}/files",
        download: "/v1/clips/{provider}:{id}/download?height=1080 (302 to the file on the source)",
        credits: "/v1/clips/{provider}:{id}/credits?format=md|json|zip",
        sequences: "POST /v1/sequences",
        ...(httpMcp && { mcp: "/mcp (Streamable HTTP)" }),
        openapi: "/openapi.json",
        docs: "/docs",
        apiReference: "/docs/api/reference",
        ui: "/ (open in a browser)",
      },
    });
  });
  app.get("/health", (c) => c.json({ ok: true }));
  app.get("/openapi.json", (c) => c.json(openApiSpec(opts.publicBaseUrl)));

  app.get("/v1/providers", (c) => c.json({ providers: service.listProviders() }));

  // Daily catalog census (scripts/census.mjs), shipped with the website build.
  let catalogBody: string | null | undefined;
  app.get("/v1/catalog", (c) => {
    if (catalogBody === undefined) {
      const hit = site?.resolve("/catalog.json", {});
      catalogBody = hit && !("redirect" in hit) && hit.status === 200 ? hit.body.toString("utf8") : null;
    }
    if (!catalogBody) return c.json({ error: "catalog not built" }, 404);
    c.header("cache-control", "public, max-age=3600");
    return c.body(catalogBody, 200, { "content-type": "application/json; charset=utf-8" });
  });

  app.get("/v1/stats", async (c) => {
    const providers = service.listProviders();
    const usage = await stats.snapshot();
    c.header("cache-control", "public, max-age=60");
    return c.json({
      ...usage,
      catalog: {
        sources: providers.length,
        directDownload: providers.filter((p) => p.supportsDownload).length,
        byAccess: tally(providers.map((p) => p.access)),
        byPricing: tally(providers.map((p) => p.pricing)),
      },
    });
  });

  app.get("/v1/search", async (c) => {
    const p = searchParams.parse(c.req.query());
    const started = Date.now();
    const duration: DurationRange | undefined = p.min_duration !== undefined || p.max_duration !== undefined ? { min: p.min_duration, max: p.max_duration } : undefined;
    const res = await service.search({
      query: p.q,
      categories: p.category,
      styles: p.style,
      orientations: p.orientation,
      minResolution: p.min_resolution,
      duration,
      minFps: p.min_fps,
      hasAudio: p.audio,
      commercialOnly: p.commercial,
      freeOnly: p.free,
      downloadableOnly: p.downloadable,
      strict: p.strict,
      providers: p.providers,
      limit: p.limit,
      offset: p.offset,
    });
    analytics.search({
      ...who(c),
      query: p.q,
      categories: res.filters.categories,
      orientations: res.filters.orientations,
      minResolution: res.filters.minResolution,
      freeOnly: p.free,
      downloadableOnly: p.downloadable,
      response: res,
      tookMs: Date.now() - started,
    });
    return c.json(res);
  });

  const lookup = async (c: Context): Promise<ClipDetails | null> => service.getClip(c.req.param("id")!);

  app.get("/v1/clips/:id", async (c) => {
    const id = c.req.param("id");
    const clip = await lookup(c);
    analytics.clipView({ ...who(c), provider: id.split(":")[0] ?? "", found: Boolean(clip) });
    if (!clip) return c.json({ error: "not found" }, 404);
    // `watch` plays in a browser straight from the source (this server never streams video).
    return c.json({ ...publicClip(clip), watch: pickPlayback(clip), shareUrl: `${origin(c)}/search?clip=${encodeURIComponent(clip.id)}` });
  });

  app.get("/v1/clips/:id/files", async (c) => {
    const p = fileParams.parse(c.req.query());
    const clip = await lookup(c);
    if (!clip) return c.json({ error: "not found" }, 404);
    const files = selectFiles(clip, { height: p.height, format: p.format, role: p.role, all: p.all });
    return c.json({ id: clip.id, license: clip.license, attribution: clip.attribution, totalBytes: totalBytes(files), files: publicFiles(files) });
  });

  /**
   * Download: always a redirect to the chosen file on the source's CDN, so no
   * video bytes pass through this server. `height` picks a rendition, `format`
   * a container. The licence and credit line come back as headers.
   */
  app.get("/v1/clips/:id/download", async (c) => {
    const p = fileParams.parse(c.req.query());
    const clip = await lookup(c);
    if (!clip) return c.json({ error: "not found" }, 404);
    const fetchable = clip.files.filter((f) => !f.requiresAuth && !f.headers);
    if (!fetchable.length) {
      return c.json({ error: "This clip has no direct download here; get it from the source page.", url: clip.url, requiresAccount: clip.requiresAccount ?? false }, 409);
    }
    const file = selectFiles({ files: fetchable }, { height: p.height, format: p.format, role: p.role })[0];
    if (!file) return c.json({ error: "No file matches the requested height/format/role." }, 404);
    if (clip.license) c.header("x-license", headerValue(`${clip.license.id}; verdict=${clip.license.verdict}${clip.license.editorial ? "; editorial" : ""}`));
    if (clip.attribution) c.header("x-attribution", headerValue(clip.attribution));
    assertPublicUrl(file.url);
    analytics.download({ ...who(c), provider: clip.provider, kind: "redirect", quality: resolutionTier(file.width, file.height) ?? "unknown" });
    return c.redirect(file.url, 302);
  });

  /** Credits for one clip: ATTRIBUTION.md (default), credits.json, or a zip with both (no video inside). */
  app.get("/v1/clips/:id/credits", async (c) => {
    const clip = await lookup(c);
    if (!clip) return c.json({ error: "not found" }, 404);
    const names = Object.fromEntries(service.listProviders().map((x) => [x.id, x.name]));
    const format = c.req.query("format") ?? "md";
    if (format === "json") return c.json(creditsJson([clip], { sourceNames: names }));
    if (format === "zip") {
      analytics.download({ ...who(c), provider: clip.provider, kind: "credits" });
      const folder = clipFolderName(clip);
      const body = zipStream(service.http, [], folder, {
        extra: [
          { path: "ATTRIBUTION.md", content: creditsMarkdown([clip], names) },
          { path: "credits.json", content: JSON.stringify(creditsJson([clip], { sourceNames: names }), null, 2) },
        ],
      });
      return new Response(body, { headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${folder}-credits.zip"` } });
    }
    return c.body(creditsMarkdown([clip], names), 200, { "content-type": "text/markdown; charset=utf-8" });
  });

  /** Plan a b-roll sequence: one clip per shot with alternatives, plus OTIO, ffmpeg, Remotion and credits. */
  app.post("/v1/sequences", async (c) => {
    const body = sequenceBody.parse(await c.req.json().catch(() => ({})));
    const shots = Array.isArray(body.shots) ? body.shots.flatMap((s) => parseShotList(s)) : parseShotList(body.shots);
    if (!shots.length) return c.json({ error: "Give at least one shot description." }, 400);
    const plan = await planSequence(service, {
      shots,
      orientation: body.orientation,
      width: body.width,
      height: body.height,
      fps: body.fps,
      totalDurationSec: body.totalDuration,
      commercialOnly: body.commercialOnly ?? true,
      providers: body.providers,
      alternatives: body.alternatives,
    });
    const names = Object.fromEntries(service.listProviders().map((x) => [x.id, x.name]));
    return c.json({ plan, exports: sequenceExports(plan, { name: body.name, sourceNames: names }) });
  });

  if (!httpMcp) {
    app.all("/mcp", (c) => c.json({ error: "MCP over HTTP is turned off on this server." }, 404));
  } else {
    // Opening the MCP URL in a browser leads to the setup guide instead of a JSON-RPC error.
    app.get("/mcp", async (c, next) => {
      const accept = c.req.header("accept") ?? "";
      if (accept.includes("text/html") && !accept.includes("text/event-stream")) return c.redirect("/docs/mcp", 302);
      await next();
    });

    // MCP over Streamable HTTP, stateless: a fresh server+transport per request.
    // Who is calling is worked out per request for analytics only
    // (src/mcp/attribution.ts); it never changes the response.
    const sessions = new SessionTokens(opts.mcpSessionSecret);
    const callers = new DailyCallers();
    app.all("/mcp", async (c) => {
      const ua = c.req.header("user-agent");
      const uaFamily = clientFamily(ua);
      const ip = clientIp(c);
      const network = opts.networks?.classify(ip) ?? "unknown";
      const sessionId = c.req.header("mcp-session-id");
      const session = sessions.verify(sessionId);
      const server = createMcpServer(service, {
        allowLocalDownload: opts.allowServerDownloads ?? false,
        downloadDir: opts.downloadDir,
        publicBaseUrl: opts.publicBaseUrl ?? new URL(c.req.url).origin,
        analytics,
        client: pickClient(session ? clientFamily(session.name) : undefined, uaFamily),
        attribution: {
          network,
          consistency: checkConsistency({ sessionSent: Boolean(sessionId), session, uaFamily, network }),
          newCaller: (client) => callers.firstToday(ip, ua, client),
        },
      });
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await server.connect(transport);
      const res = await transport.handleRequest(c.req.raw);
      // Set only when this request was `initialize`.
      const info = server.server.getClientVersion();
      // Stateless: release the per-request server once the response is produced.
      void server.close().catch(() => undefined);
      if (!info) return res;
      const declared = clientFamily(info.name);
      analytics.mcpConnect({
        client: pickClient(declared, uaFamily),
        clientVersion: versionLabel(declared, info.version),
        clientName: info.name.slice(0, 64),
        network,
      });
      if (!res.ok) return res;
      // Clients echo the session ID on every later request, so tool calls can
      // be labelled with the client they declared here.
      const headers = new Headers(res.headers);
      headers.set("mcp-session-id", sessions.issue(info));
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    });
  }

  // Share cards for search and clip links (static pages have pre-rendered /og/<page>.png files).
  const providerIds = service.listProviders().map((p) => p.id);
  const og = new OgImages(service, { site: new URL(opts.publicBaseUrl ?? "https://video.shep.bot").host });
  const png = (c: Context, body: Buffer | null) =>
    body ? new Response(c.req.method === "HEAD" ? null : new Uint8Array(body), { headers: OG_HEADERS }) : c.json({ error: "not found" }, 404);
  app.on(["GET", "HEAD"], "/og/query.png", async (c) => png(c, await og.query(new URL(c.req.url).searchParams)));
  app.on(["GET", "HEAD"], "/og/clip.png", async (c) => {
    const id = shareableClipId(c.req.query("id"), providerIds);
    return png(c, id ? await og.clip(id) : null);
  });

  /** Title, description and card for `/search?clip=<id>` share links (undefined if the clip can't be found quickly). */
  const sampleShareMeta = async (c: Context): Promise<HeadMeta | undefined> => {
    const id = shareableClipId(c.req.query("clip"), providerIds);
    if (!id) return undefined;
    const found = service.getClip(id).catch(() => null);
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), SHARE_LOOKUP_MS).unref());
    const clip = await Promise.race([found, timeout]);
    return clip ? clipMeta(clip) : undefined;
  };

  // Everything else is the website (pages, /_astro assets, robots.txt, sitemap, llms.txt, ...).
  app.on(["GET", "HEAD"], "*", async (c) => {
    if (c.req.path.startsWith("/v1/")) return c.json({ error: "not found" }, 404);
    const alias = ALIASES[c.req.path.replace(/\/+$/, "").toLowerCase()];
    if (alias) return c.redirect(alias, 301);
    const pre = c.req.path.replace(/\/+$/, "") === "/search" ? await sampleShareMeta(c) : undefined;
    return serveSite(c, c.req.path, pre) ?? c.json({ error: "not found" }, 404);
  });
  // Paths the router can't match (e.g. with encoded control characters) get the same 404 treatment.
  app.notFound((c) => (c.req.path.startsWith("/v1/") ? undefined : serveSite(c, c.req.path)) ?? c.json({ error: "not found" }, 404));

  return app;
}
