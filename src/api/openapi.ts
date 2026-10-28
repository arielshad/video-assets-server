import { COMMERCIAL_VERDICTS } from "../core/types.js";
import { VERDICT_LABELS } from "../core/licence.js";
import { CATEGORIES, ORIENTATIONS, TOP_CATEGORIES, VIDEO_STYLES } from "../core/vocab.js";
import { allProviders } from "../providers/index.js";

const DEFAULT_PUBLIC_URL = "https://video.shep.bot";

const NATIVE_FILTERS = ["categories", "styles", "orientation", "resolution", "duration", "fps", "audio", "commercialOnly", "freeOnly"] as const;
const FILE_ROLES = ["original", "rendition", "preview", "poster", "captions"] as const;

/** OpenAPI 3.1 description of the HTTP API (served at /openapi.json, rendered at /docs/api/reference). */
export function openApiSpec(baseUrl?: string) {
  const server = (baseUrl ?? DEFAULT_PUBLIC_URL).replace(/\/$/, "");
  const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
  const json = (schema: object, example?: unknown) => ({
    "application/json": { schema, ...(example !== undefined ? { example } : {}) },
  });
  const errorResponse = (description: string, example?: unknown) => ({ description, content: json(ref("Error"), example) });
  const verdicts = COMMERCIAL_VERDICTS.map((v) => `\`${v}\` (${VERDICT_LABELS[v].toLowerCase()})`).join(", ");

  const idParam = {
    name: "id",
    in: "path",
    required: true,
    description: "Clip id `<provider>:<nativeId>` (URL-encode it: ids can contain spaces and slashes).",
    schema: { type: "string" },
    example: "wikimediacommons:Ocean_in_Sommaroy.webm",
  };
  const fileQuery = [
    { name: "height", in: "query", description: "Wanted resolution as the short side in pixels (720, 1080, 2160): the smallest file at or above it, else the biggest below.", schema: { type: "integer", minimum: 144, maximum: 4320 } },
    { name: "format", in: "query", description: "Preferred container: mp4, webm, mov, ogv.", schema: { type: "string" } },
    { name: "role", in: "query", description: `Only files with this role: ${FILE_ROLES.join(", ")}.`, schema: { type: "string", enum: FILE_ROLES } },
  ];
  const bool = (name: string, description: string) => ({ name, in: "query", description, schema: { type: "boolean" } });

  const exampleLicense = {
    id: "CC0-1.0",
    name: "CC0 1.0",
    url: "https://creativecommons.org/publicdomain/zero/1.0/",
    commercialUse: true,
    attributionRequired: false,
    redistribution: true,
    assertedBy: "source",
    verdict: "yes",
  };
  const exampleClip = {
    id: "wikimediacommons:Ocean_in_Sommaroy.webm",
    provider: "wikimediacommons",
    nativeId: "Ocean_in_Sommaroy.webm",
    title: "Ocean in Sommaroy",
    url: "https://commons.wikimedia.org/wiki/File:Ocean_in_Sommaroy.webm",
    tags: [],
    category: "nature.ocean",
    categoryEvidence: { by: "rules", confidence: 0.77 },
    orientation: "landscape",
    width: 1920,
    height: 1080,
    durationSec: 15.47,
    hasAudio: true,
    posterUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5d/Ocean_in_Sommaroy.webm/960px--Ocean_in_Sommaroy.webm.jpg",
    previewUrl: "https://upload.wikimedia.org/wikipedia/commons/transcoded/5/5d/Ocean_in_Sommaroy.webm/Ocean_in_Sommaroy.webm.360p.vp9.webm",
    previewType: "video/webm",
    formats: ["webm", "mov"],
    license: exampleLicense,
    price: { free: true },
    downloadable: true,
    score: 0.81,
  };
  const exampleFiles = [
    { url: "https://upload.wikimedia.org/wikipedia/commons/5/5d/Ocean_in_Sommaroy.webm", filename: "Ocean_in_Sommaroy.webm", format: "webm", mime: "video/webm", role: "original", width: 1920, height: 1080, codec: "vp9", sizeBytes: 2928602 },
    { url: "https://upload.wikimedia.org/wikipedia/commons/transcoded/5/5d/Ocean_in_Sommaroy.webm/Ocean_in_Sommaroy.webm.480p.vp9.webm", filename: "Ocean_in_Sommaroy.webm.480p.vp9.webm", format: "webm", mime: "video/webm", role: "rendition", width: 854, height: 480, codec: "vp9" },
  ];

  const spec = {
    openapi: "3.1.0",
    info: {
      title: "Video Assets Server API",
      version: "0.1.0",
      summary: "One search API for free stock video: b-roll, backgrounds, nature, cities, space and archive films, with licence verdicts.",
      description: [
        `Search ${allProviders.length} video sites at once (NASA, NASA's Scientific Visualization Studio, Wikimedia Commons, Internet Archive,`,
        "and deep links into Pexels, Pixabay, Shutterstock and more), get each clip's licence with a plain verdict on commercial use,",
        "watch it, and download the rendition you need with its credits. **No video passes through this server:** posters and previews",
        "load from the sources, and downloads are redirects to the file on the source's CDN.",
        "",
        "**Typical flow:** `GET /v1/search` → `GET /v1/clips/{id}` → `GET /v1/clips/{id}/download?height=1080`. To cut a b-roll",
        "sequence from a shot list in one call, `POST /v1/sequences`.",
        "",
        `**Licence verdicts:** every clip's \`license.verdict\` answers "can this go into a video I publish commercially?": ${verdicts}.`,
        "`license.editorial=true` means people, insignia or brands appear without releases (fine for news and documentary, not for ads).",
        "`commercial=true` keeps only `yes` and `yes-with-credit`. Verdicts are a summary, not legal advice: read the licence before publishing.",
        "",
        "**Authentication:** the public server at video.shep.bot is open. Self-hosted servers can require a key",
        "(`VIDEO_SERVER_API_KEY`); send it as `Authorization: Bearer <key>` or `x-api-key: <key>`. Keys are accepted in headers",
        "only, never in the URL, so they stay out of logs, browser history and Referer headers.",
        "",
        "**For AI agents:** the same capabilities are exposed as MCP tools at `/mcp` (Streamable HTTP).",
        "See [Use with coding agents](/docs/mcp).",
        "",
        "**Rate limits:** 120 requests per minute per client on `/v1/*` and `/mcp`. Every response carries",
        "`RateLimit-Policy` and `RateLimit` (IETF RateLimit header fields) plus `RateLimit-Limit`,",
        "`RateLimit-Remaining` and `RateLimit-Reset`; a `429` adds `Retry-After` (seconds).",
        "",
        "**Versioning:** the major version is in the path (`/v1`). Breaking changes only ship in a new major",
        "version; deprecated endpoints announce themselves with `Deprecation` and `Sunset` headers at least",
        "90 days ahead. See [Versioning & deprecation](/docs/api/versioning).",
      ].join("\n"),
      contact: { name: "Video Assets Server", url: "https://github.com/arielshad/video-assets-server" },
      license: { name: "Apache-2.0", identifier: "Apache-2.0" },
    },
    externalDocs: { description: "Guides: quick start, MCP setup, API usage", url: `${server}/docs` },
    "x-api-lifecycle": { versioning: "path (/v1)", deprecationPolicy: `${server}/docs/api/versioning`, minimumSunsetNoticeDays: 90 },
    servers: [{ url: server, description: "This server" }],
    tags: [
      { name: "Search", description: "Find clips across every source in one call." },
      { name: "Clips", description: "Details, renditions, downloads and credits for one clip." },
      { name: "Sequences", description: "Turn a shot list into a b-roll sequence in one call." },
      { name: "Sources", description: "The video sites this server searches, what they hold, and how the server is used." },
      { name: "MCP", description: "Model Context Protocol endpoint for AI agents." },
      { name: "System", description: "Health and machine-readable descriptions." },
    ],
    security: [{}, { bearer: [] }, { apiKey: [] }],
    components: {
      securitySchemes: {
        bearer: { type: "http", scheme: "bearer", description: "Only when the server sets VIDEO_SERVER_API_KEY." },
        apiKey: { type: "apiKey", in: "header", name: "x-api-key", description: "Same key, as a header. Query parameters are not accepted." },
      },
      headers: {
        RateLimit: { description: 'Current quota, e.g. `"default";r=117;t=42` (r = requests remaining, t = seconds until reset).', schema: { type: "string" } },
        "RateLimit-Policy": { description: 'Quota policy, e.g. `"default";q=120;w=60` (q = requests per window, w = window seconds).', schema: { type: "string" } },
        "RateLimit-Limit": { description: "Requests allowed per window.", schema: { type: "integer" } },
        "RateLimit-Remaining": { description: "Requests left in the current window.", schema: { type: "integer" } },
        "RateLimit-Reset": { description: "Seconds until the window resets.", schema: { type: "integer" } },
        "Retry-After": { description: "Seconds to wait before retrying (on 429).", schema: { type: "integer" } },
        "X-License": { description: "The clip's licence id and verdict, e.g. `CC-BY-4.0; verdict=yes-with-credit; editorial`.", schema: { type: "string" } },
        "X-Attribution": { description: "The credit line to publish with your video (ASCII), when the licence asks for one.", schema: { type: "string" } },
      },
      responses: {
        TooManyRequests: {
          description: "Rate limit exceeded. Wait `Retry-After` seconds.",
          headers: {
            "Retry-After": { $ref: "#/components/headers/Retry-After" },
            RateLimit: { $ref: "#/components/headers/RateLimit" },
            "RateLimit-Policy": { $ref: "#/components/headers/RateLimit-Policy" },
          },
          content: json(ref("Error"), { error: "Rate limit exceeded: 120 requests per 60s. Retry after 12s.", retryAfter: 12 }),
        },
      },
      schemas: {
        Category: { type: "string", enum: CATEGORIES, description: "Dot-path category; a parent (`nature`) matches its children (`nature.ocean`)." },
        VideoStyle: { type: "string", enum: VIDEO_STYLES },
        Orientation: { type: "string", enum: ORIENTATIONS },
        CommercialVerdict: { type: "string", enum: COMMERCIAL_VERDICTS, description: `Can this go into a commercially published video? ${verdicts}.` },
        NativeFilter: { type: "string", enum: NATIVE_FILTERS },
        License: {
          type: "object",
          required: ["id", "name", "assertedBy", "verdict"],
          properties: {
            id: { type: "string", description: "SPDX id where one exists (CC0-1.0, CC-BY-4.0…), else LicenseRef-*." },
            name: { type: "string" },
            url: { type: "string", format: "uri" },
            commercialUse: { type: "boolean" },
            attributionRequired: { type: "boolean" },
            shareAlike: { type: "boolean" },
            redistribution: { type: "boolean", description: "May the clip itself be re-uploaded or passed on?" },
            editorial: { type: "boolean", description: "People, insignia or brands without releases: fine for news and documentary, not for ads." },
            assertedBy: { type: "string", enum: ["source", "site", "uploader"], description: "`uploader` = an unverified claim (verdict capped at check-terms)." },
            verdict: ref("CommercialVerdict"),
            note: { type: "string" },
          },
          example: exampleLicense,
        },
        Price: { type: "object", required: ["free"], properties: { free: { type: "boolean" }, amount: { type: "number" }, currency: { type: "string" } } },
        Clip: {
          type: "object",
          required: ["id", "provider", "nativeId", "title", "url", "tags", "category", "downloadable"],
          properties: {
            id: { type: "string", description: "`<provider>:<nativeId>`" },
            provider: { type: "string" },
            nativeId: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            url: { type: "string", format: "uri", description: "The clip's page on the source site." },
            author: { type: "string" },
            authorUrl: { type: "string", format: "uri" },
            tags: { type: "array", items: { type: "string" } },
            category: ref("Category"),
            categoryEvidence: { type: "object", properties: { by: { type: "string", enum: ["source", "rules"] }, confidence: { type: "number" } } },
            styles: { type: "array", items: ref("VideoStyle") },
            orientation: ref("Orientation"),
            width: { type: "integer", description: "Frame width of the best version." },
            height: { type: "integer" },
            fps: { type: "number" },
            durationSec: { type: "number" },
            hasAudio: { type: "boolean" },
            year: { type: "integer", description: "Year the footage was made (archive films)." },
            posterUrl: { type: "string", format: "uri", description: "Still frame, on the source's CDN." },
            previewUrl: { type: "string", format: "uri", description: "Small playable version (mp4/webm) on the source's CDN." },
            previewType: { type: "string", example: "video/mp4" },
            formats: { type: "array", items: { type: "string" } },
            license: ref("License"),
            attribution: { type: "string", description: "Ready-to-paste credit line when the licence asks for one." },
            price: ref("Price"),
            requiresAccount: { type: "boolean" },
            downloadable: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
            popularity: { type: "number" },
            sameAs: { type: "array", items: { type: "string" } },
            score: { type: "number" },
          },
          example: exampleClip,
        },
        ClipFile: {
          type: "object",
          required: ["url", "filename", "format", "role"],
          properties: {
            url: { type: "string", format: "uri" },
            filename: { type: "string" },
            format: { type: "string", description: "Container: mp4, webm, mov, ogv, mpeg… (Commons originals are WebM/Ogg, never MP4)." },
            mime: { type: "string" },
            role: { type: "string", enum: FILE_ROLES },
            width: { type: "integer" },
            height: { type: "integer" },
            fps: { type: "number" },
            codec: { type: "string" },
            sizeBytes: { type: "integer" },
            bitrate: { type: "integer" },
            requiresAuth: { type: "boolean" },
          },
        },
        ClipDetails: {
          allOf: [
            ref("Clip"),
            {
              type: "object",
              properties: {
                files: { type: "array", items: ref("ClipFile") },
                watch: {
                  type: "object",
                  description: "What a browser player should stream (straight from the source): mp4/webm near 720p.",
                  properties: { url: { type: "string", format: "uri" }, type: { type: "string" }, width: { type: "integer" }, height: { type: "integer" } },
                },
                shareUrl: { type: "string", format: "uri" },
              },
            },
          ],
          example: { ...exampleClip, files: exampleFiles, watch: { url: exampleFiles[1]!.url, type: "video/webm", width: 854, height: 480 } },
        },
        ClipFilters: {
          type: "object",
          properties: {
            categories: { type: "array", items: ref("Category") },
            styles: { type: "array", items: ref("VideoStyle") },
            orientations: { type: "array", items: ref("Orientation") },
            minResolution: { type: "integer", description: "Short side in pixels." },
            duration: { type: "object", properties: { min: { type: "number" }, max: { type: "number" } } },
            minFps: { type: "number" },
            hasAudio: { type: "boolean" },
            commercialOnly: { type: "boolean" },
            freeOnly: { type: "boolean" },
          },
        },
        ProviderSearchReport: {
          type: "object",
          required: ["provider", "name", "status", "count", "tookMs"],
          properties: {
            provider: { type: "string" },
            name: { type: "string" },
            status: { type: "string", enum: ["ok", "error", "timeout", "skipped", "link"], description: "`link` = the source can only be searched on its own site: open `searchUrl`." },
            count: { type: "integer" },
            total: { type: "integer" },
            searchUrl: { type: "string", format: "uri" },
            error: { type: "string" },
            filteredLocally: { type: "array", items: ref("NativeFilter") },
            tookMs: { type: "integer" },
          },
        },
        SearchResponse: {
          type: "object",
          required: ["query", "filters", "results", "providers"],
          properties: {
            query: { type: "string", description: "The words searched after the filters were parsed out." },
            filters: ref("ClipFilters"),
            results: { type: "array", items: ref("Clip") },
            providers: { type: "array", items: ref("ProviderSearchReport") },
          },
        },
        Provider: {
          type: "object",
          required: ["id", "name", "homepage", "description", "categories", "access", "pricing", "supportsDownload"],
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            homepage: { type: "string", format: "uri" },
            description: { type: "string" },
            categories: { type: "array", items: ref("Category"), description: "Top-level categories the source carries." },
            access: {
              type: "string",
              enum: ["api", "static", "scrape", "link"],
              description: "`api` official API; `static` a curated manifest filtered locally; `scrape` public pages; `link` deep links only (paid/partner API, no key yet, or terms that forbid aggregation).",
            },
            pricing: { type: "string", enum: ["free", "freemium", "paid"] },
            license: ref("License"),
            apiKeyEnv: { type: "string", description: "Environment variable holding the source's API key on a self-hosted server." },
            supportsDownload: { type: "boolean" },
            nativeFilters: { type: "array", items: ref("NativeFilter"), description: "Filters the source applies itself; the rest are applied locally." },
            enabled: { type: "boolean" },
          },
        },
        FileSelection: {
          type: "object",
          required: ["id", "files"],
          properties: {
            id: { type: "string" },
            license: ref("License"),
            attribution: { type: "string" },
            totalBytes: { type: "integer" },
            files: { type: "array", items: ref("ClipFile") },
          },
        },
        SequenceRequest: {
          type: "object",
          required: ["shots"],
          properties: {
            shots: {
              oneOf: [
                { type: "array", items: { type: "string" }, maxItems: 24 },
                { type: "string", description: "One shot per line; `(3s)` at the end sets that shot's length." },
              ],
            },
            orientation: ref("Orientation"),
            width: { type: "integer" },
            height: { type: "integer" },
            fps: { type: "number", default: 30 },
            totalDuration: { type: "number", description: "Seconds, split over shots without their own length (default 4 s each)." },
            commercialOnly: { type: "boolean", default: true },
            providers: { type: "array", items: { type: "string" } },
            alternatives: { type: "integer", minimum: 0, maximum: 5, default: 3 },
            name: { type: "string" },
          },
          example: { shots: ["sunrise over a city skyline (3s)", "coffee pour close-up", "people walking in the rain"], orientation: "portrait", totalDuration: 12 },
        },
        SequenceShot: {
          type: "object",
          required: ["index", "description", "durationSec", "inSec", "alternatives"],
          properties: {
            index: { type: "integer" },
            description: { type: "string" },
            durationSec: { type: "number" },
            inSec: { type: "number", description: "In-point in the source clip (skips title cards on long films)." },
            clip: ref("Clip"),
            file: ref("ClipFile"),
            alternatives: { type: "array", items: ref("Clip") },
            note: { type: "string" },
          },
        },
        SequenceResponse: {
          type: "object",
          required: ["plan", "exports"],
          properties: {
            plan: {
              type: "object",
              properties: {
                width: { type: "integer" },
                height: { type: "integer" },
                fps: { type: "number" },
                durationSec: { type: "number" },
                commercialSafe: { type: "boolean" },
                shots: { type: "array", items: ref("SequenceShot") },
              },
            },
            exports: {
              type: "object",
              description: "File contents, ready to save: an OpenTimelineIO timeline, an ffmpeg render script, a Remotion clip list and the credits. Media URLs point at the sources.",
              properties: {
                "timeline.otio": { type: "string" },
                "concat.sh": { type: "string" },
                "remotion.json": { type: "string" },
                "ATTRIBUTION.md": { type: "string" },
                "credits.json": { type: "string" },
              },
            },
          },
        },
        CountWithBound: {
          type: "object",
          required: ["count"],
          properties: { count: { type: "integer" }, atLeast: { type: "boolean", description: "The count is a lower bound." } },
        },
        SourceCensus: {
          type: "object",
          required: ["id", "name", "homepage", "total", "byCategory", "method", "countedAt"],
          properties: {
            id: { type: "string", example: "nasa" },
            name: { type: "string", example: "NASA Image and Video Library" },
            homepage: { type: "string", format: "uri" },
            license: { type: "string", description: "The source's single licence id, when uniform." },
            pricing: { type: "string", enum: ["free", "freemium", "paid"] },
            supportsDownload: { type: "boolean" },
            total: { type: "integer", description: "Listings on the source (free and paid)." },
            atLeast: { type: "boolean" },
            free: { type: "integer" },
            byCategory: {
              type: "object",
              description: "Listings per top-level category; each listing counts once.",
              additionalProperties: { type: "integer" },
              example: { drums: 182000, fx: 240000, ambience: 96000, vocals: 41000 },
            },
            byLicense: { type: "object", additionalProperties: { type: "integer" } },
            categories: { type: "object", additionalProperties: { type: "integer" }, description: "The source's own categories or tags (may overlap)." },
            unit: { type: "string", enum: ["clips", "packs"] },
            addedLast30Days: { type: "integer" },
            downloads: { type: "integer", description: "Total downloads, when the source publishes them." },
            highlights: {
              type: "array",
              items: {
                type: "object",
                required: ["label", "title", "url"],
                properties: { label: { type: "string" }, title: { type: "string" }, url: { type: "string", format: "uri" }, value: { type: "integer" } },
              },
            },
            method: { type: "string", description: "How the source was counted." },
            countedAt: { type: "string", format: "date-time" },
            stale: { type: "object", properties: { since: { type: "string", format: "date-time" }, error: { type: "string" } } },
          },
        },
        Catalog: {
          type: "object",
          required: ["countedAt", "totals", "byCategory", "byLicense", "sources"],
          properties: {
            countedAt: { type: "string", format: "date-time" },
            totals: {
              type: "object",
              properties: {
                listings: ref("CountWithBound"),
                free: ref("CountWithBound"),
                cc0: ref("CountWithBound"),
                directDownload: ref("CountWithBound"),
                addedLast30Days: { type: "integer" },
                sourcesCounted: { type: "integer" },
                sourcesLinked: { type: "integer" },
              },
            },
            byCategory: { type: "object", additionalProperties: ref("CountWithBound"), description: "Listings per top-level category across sources." },
            byLicense: { type: "object", additionalProperties: { type: "integer" } },
            sources: { type: "array", items: ref("SourceCensus") },
            linked: { type: "array", items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, homepage: { type: "string" } } } },
          },
        },
        UsageWindow: {
          type: "object",
          required: ["key", "label", "searches", "searchesWithResults", "bySurface", "clipViews", "downloads", "toolCalls", "pageViews"],
          properties: {
            key: { type: "string", description: "`24h`, `7d`, or `process` (since the last restart).", example: "24h" },
            label: { type: "string", example: "Last 24 hours" },
            searches: { type: "integer" },
            searchesWithResults: { type: "integer" },
            bySurface: {
              type: "object",
              required: ["web", "api", "mcp"],
              properties: { web: { type: "integer" }, api: { type: "integer" }, mcp: { type: "integer" } },
            },
            clipViews: { type: "integer" },
            downloads: { type: "integer" },
            toolCalls: { type: "integer", description: "MCP tool calls." },
            pageViews: { type: "integer", description: "Website pages served." },
          },
        },
        Ranked: { type: "object", required: ["name", "count"], properties: { name: { type: "string" }, count: { type: "integer" } } },
        ProviderHealth: {
          type: "object",
          required: ["provider", "requests", "ok", "errors", "timeouts", "okRate", "p50Ms", "p95Ms"],
          properties: {
            provider: { type: "string", example: "nasa" },
            requests: { type: "integer", description: "Searches that reached the source." },
            ok: { type: "integer" },
            errors: { type: "integer" },
            timeouts: { type: "integer" },
            okRate: { type: ["number", "null"], minimum: 0, maximum: 1 },
            p50Ms: { type: ["integer", "null"] },
            p95Ms: { type: ["integer", "null"] },
          },
        },
        Stats: {
          type: "object",
          required: ["generatedAt", "source", "windows", "breakdownLabel", "clients", "tools", "assetTypes", "providers", "catalog"],
          properties: {
            generatedAt: { type: "string", format: "date-time" },
            source: { type: "string", enum: ["prometheus", "process"] },
            since: { type: "string", format: "date-time", description: "Start of counting for `source: process`." },
            windows: { type: "array", items: ref("UsageWindow") },
            breakdownLabel: { type: "string", description: "Period covered by `clients`, `tools` and `assetTypes`.", example: "Last 7 days" },
            clients: { type: "array", items: ref("Ranked"), description: "Searches by client family (claude-code, cursor, browser, curl…)." },
            tools: { type: "array", items: ref("Ranked"), description: "MCP tool calls by tool." },
            assetTypes: { type: "array", items: ref("Ranked"), description: "Searches by category filter (`any` = no filter)." },
            providers: { type: "array", items: ref("ProviderHealth"), description: "Per-source health over the last 24 hours." },
            catalog: {
              type: "object",
              required: ["sources", "directDownload", "byAccess", "byPricing"],
              properties: {
                sources: { type: "integer" },
                directDownload: { type: "integer" },
                byAccess: { type: "object", additionalProperties: { type: "integer" } },
                byPricing: { type: "object", additionalProperties: { type: "integer" } },
              },
            },
          },
        },
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: { type: "string" },
            url: { type: "string", format: "uri", description: "The clip's page on the source, when the file must be fetched there." },
            requiresAccount: { type: "boolean" },
            retryAfter: { type: "integer" },
          },
        },
      },
    },
    paths: {
      "/v1/search": {
        get: {
          operationId: "searchClips",
          tags: ["Search"],
          summary: "Search every source",
          description:
            "Fans out to every enabled source in parallel (each with its own timeout), then merges and ranks. Words like " +
            "`4k`, `1080p`, `vertical`, `9:16`, `10s`, `under 30 seconds`, `60fps`, `timelapse` in `q` become filters (see `filters` in the response); " +
            "explicit parameters win. A single length (`10s`) means at least that long. Unknown orientation, resolution, length or fps stay in the list, " +
            "ranked below known matches, unless `strict=true`. A slow or failing source never fails the search: it shows up in `providers` with its status.",
          parameters: [
            { name: "q", in: "query", description: "Short query, written like an editor would.", schema: { type: "string", maxLength: 300 }, examples: { ocean: { value: "ocean waves at sunset" }, vertical: { value: "4k vertical drone city night" }, archive: { value: "1950s newsreel factory" } } },
            {
              name: "category",
              in: "query",
              description: `Comma-separated categories; a parent includes its children. Top level: ${TOP_CATEGORIES.join(", ")}; children like \`nature.ocean\`, \`city.skyline\`, \`space.launch\`, \`overlay.light\`.`,
              schema: { type: "string" },
              example: "nature.ocean",
            },
            { name: "style", in: "query", description: `Comma-separated styles (ranked first; filtered only with strict=true): ${VIDEO_STYLES.join(", ")}.`, schema: { type: "string" }, example: "timelapse" },
            { name: "orientation", in: "query", description: `Comma-separated: ${ORIENTATIONS.join(", ")}.`, schema: { type: "string" }, example: "portrait" },
            { name: "min_resolution", in: "query", description: "Short side at least: 720, 1080, 1440, 2160, or hd / fhd / 4k.", schema: { type: "string" }, example: "1080" },
            { name: "min_duration", in: "query", description: "Minimum length in seconds.", schema: { type: "number", minimum: 0 } },
            { name: "max_duration", in: "query", description: "Maximum length in seconds.", schema: { type: "number", minimum: 0 } },
            { name: "min_fps", in: "query", description: "Minimum frame rate.", schema: { type: "number", minimum: 1 } },
            bool("audio", "Only clips with (true) or without (false) a sound track."),
            bool("commercial", "Only clips whose licence verdict is `yes` or `yes-with-credit`."),
            bool("free", "Only free clips."),
            bool("downloadable", "Only clips with direct file links."),
            bool("strict", "Drop clips whose orientation, resolution, length, fps or audio is unknown when that filter is set."),
            { name: "providers", in: "query", description: "Comma-separated source ids (see /v1/providers).", schema: { type: "string" }, example: "nasa,wikimediacommons" },
            { name: "limit", in: "query", description: "Max results (default 24).", schema: { type: "integer", minimum: 1, maximum: 100 } },
            { name: "offset", in: "query", description: "Per-source offset for paging (e.g. 24 for page 2).", schema: { type: "integer", minimum: 0, maximum: 1000 } },
          ],
          responses: {
            200: { description: "Ranked results, the filters in force and a per-source report.", content: json(ref("SearchResponse")) },
            400: errorResponse("Invalid parameters or unknown source id.", { error: '✖ min_resolution must be 720, 1080, 1440, 2160 or hd/fhd/4k, got "8k"' }),
            401: errorResponse("API key required (self-hosted servers only)."),
          },
        },
      },
      "/v1/clips/{id}": {
        get: {
          operationId: "getClip",
          tags: ["Clips"],
          summary: "Clip details, renditions and watch URL",
          description: "Full metadata, the licence with its verdict and credit line, every file (master, renditions, preview, poster, captions) and the file a browser player should stream.",
          parameters: [idParam],
          responses: {
            200: { description: "The clip and its files.", content: json(ref("ClipDetails")) },
            400: errorResponse("Malformed id or unknown source."),
            404: errorResponse("Unknown clip."),
            501: errorResponse("The source has no detail pages here; open `url` on the source site."),
            502: errorResponse("The source site failed."),
          },
        },
      },
      "/v1/clips/{id}/files": {
        get: {
          operationId: "selectFiles",
          tags: ["Clips"],
          summary: "Pick the right file",
          description: "The best file for a resolution and container (the master by default), or every file with `all=true`, with sizes and the licence.",
          parameters: [idParam, ...fileQuery, bool("all", "Every file, including posters and captions.")],
          responses: {
            200: { description: "Selected files and total size.", content: json(ref("FileSelection")) },
            404: errorResponse("Unknown clip."),
          },
        },
      },
      "/v1/clips/{id}/download": {
        get: {
          operationId: "downloadClip",
          tags: ["Clips"],
          summary: "Download (redirect to the source)",
          description:
            "Answers 302 to the chosen file on the source's CDN: the video never passes through this server. `height` picks a rendition " +
            "(the smallest at or above it), `format` a container. The licence and credit line come back as `X-License` and `X-Attribution` headers; " +
            "get the credits as files from `/v1/clips/{id}/credits`.",
          parameters: [idParam, ...fileQuery],
          responses: {
            302: {
              description: "Redirect to the file.",
              headers: { Location: { schema: { type: "string", format: "uri" } }, "X-License": { $ref: "#/components/headers/X-License" }, "X-Attribution": { $ref: "#/components/headers/X-Attribution" } },
            },
            404: errorResponse("Unknown clip, or no file matches."),
            409: errorResponse("No direct download: get it from the source page.", { error: "This clip has no direct download here; get it from the source page.", url: "https://…", requiresAccount: false }),
          },
        },
      },
      "/v1/clips/{id}/credits": {
        get: {
          operationId: "clipCredits",
          tags: ["Clips"],
          summary: "Credits for a clip",
          description: "ATTRIBUTION.md (default), credits.json, or a zip holding both. No video inside.",
          parameters: [idParam, { name: "format", in: "query", schema: { type: "string", enum: ["md", "json", "zip"], default: "md" } }],
          responses: {
            200: {
              description: "The credits.",
              content: { "text/markdown": { schema: { type: "string" } }, "application/json": { schema: { type: "object" } }, "application/zip": { schema: { type: "string", format: "binary" } } },
            },
            404: errorResponse("Unknown clip."),
          },
        },
      },
      "/v1/sequences": {
        post: {
          operationId: "planSequence",
          tags: ["Sequences"],
          summary: "Plan a b-roll sequence from a shot list",
          description:
            "One clip per shot, matching the target orientation, at least 1080p where possible, long enough for its shot, commercial-safe by default " +
            "and directly downloadable; alternatives per shot. Returns the plan and the files to save: an OpenTimelineIO timeline, an ffmpeg script that " +
            "renders the sequence, a Remotion clip list and the credits.",
          requestBody: { required: true, content: json(ref("SequenceRequest")) },
          responses: {
            200: { description: "The plan and its exports.", content: json(ref("SequenceResponse")) },
            400: errorResponse("Invalid body."),
          },
        },
      },
      "/v1/providers": {
        get: {
          operationId: "listProviders",
          tags: ["Sources"],
          summary: "List sources",
          description: "Every clip site with the categories it carries, pricing, licence, the filters it applies itself and whether files can be downloaded directly.",
          responses: {
            200: {
              description: "Sources.",
              content: json({ type: "object", required: ["providers"], properties: { providers: { type: "array", items: ref("Provider") } } }),
            },
          },
        },
      },
      "/v1/catalog": {
        get: {
          operationId: "getCatalog",
          tags: ["Sources"],
          summary: "Catalog census",
          description:
            "How many clips every source holds, counted once a day: listings per source, by top-level category, licence and the " +
            "source's own categories, free counts, listings added in the last 30 days, and highlights such as the most downloaded " +
            "clip. `atLeast: true` marks lower bounds (sources that cap their counts). Sources whose count failed today keep their " +
            "last good numbers with `stale`. The same file is at `/catalog.json`; one point per day is in `/catalog-history.json`.",
          responses: {
            200: { description: "Catalog census.", content: json(ref("Catalog")) },
            404: errorResponse("The census has not been built on this server."),
          },
        },
      },
      "/v1/stats": {
        get: {
          operationId: "getStats",
          tags: ["Sources"],
          summary: "Usage statistics",
          description:
            "Aggregate usage of this server: searches by surface (web, API, MCP), downloads, MCP tool calls, the client families " +
            "and categories searched most, and per-source health (success rate, p50/p95 latency). Counts come from Prometheus " +
            "(`source: prometheus`, last 24 hours and 7 days) or, when it is unavailable, from this process since it started " +
            "(`source: process`). No queries, IPs or user agents are exposed. Cached for 60 seconds.",
          responses: {
            200: { description: "Usage statistics.", content: json(ref("Stats")) },
          },
        },
      },
      "/mcp": {
        post: {
          operationId: "mcp",
          tags: ["MCP"],
          summary: "MCP endpoint (Streamable HTTP)",
          description:
            "Stateless Model Context Protocol endpoint for AI agents. Tools: `search_videos`, `get_video`, `build_sequence`, " +
            "`list_sources` (and `download_video` on local installs, which saves files with their credits). " +
            "Point any MCP client at this URL; see /docs/mcp for per-client setup.",
          requestBody: {
            required: true,
            content: json(
              { type: "object", description: "JSON-RPC 2.0 request" },
              { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "search_videos", arguments: { query: "ocean waves at sunset", orientation: "portrait", min_resolution: 1080, commercial_only: true } } },
            ),
          },
          responses: { 200: { description: "JSON-RPC 2.0 response.", content: json({ type: "object" }) } },
        },
      },
      "/health": {
        get: {
          operationId: "health",
          tags: ["System"],
          summary: "Health check",
          security: [{}],
          responses: { 200: { description: "OK", content: json({ type: "object", properties: { ok: { type: "boolean" } } }, { ok: true }) } },
        },
      },
      "/openapi.json": {
        get: {
          operationId: "openapi",
          tags: ["System"],
          summary: "This OpenAPI document",
          security: [{}],
          responses: { 200: { description: "OpenAPI 3.1", content: json({ type: "object" }) } },
        },
      },
    },
  };

  // Every rate-limited operation documents its headers and the 429 response.
  const limited = { 429: { $ref: "#/components/responses/TooManyRequests" } };
  const rateHeaders = Object.fromEntries(
    ["RateLimit", "RateLimit-Policy", "RateLimit-Limit", "RateLimit-Remaining", "RateLimit-Reset"].map((h) => [h, { $ref: `#/components/headers/${h}` }]),
  );
  for (const [path, item] of Object.entries(spec.paths)) {
    if (!path.startsWith("/v1/") && path !== "/mcp") continue;
    for (const op of Object.values(item) as { responses: Record<string, Record<string, unknown>> }[]) {
      for (const res of Object.values(op.responses)) if (!("$ref" in res)) res.headers = { ...(res.headers as object), ...rateHeaders };
      Object.assign(op.responses, limited);
    }
  }
  return spec;
}
