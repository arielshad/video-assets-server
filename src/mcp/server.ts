import { mkdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { clientFamily, noopAnalytics, type Analytics } from "../core/analytics.js";
import { recordCredits } from "../core/credits-file.js";
import { clipPath, downloadClip, formatBytes, pickPlayback, selectFiles, totalBytes } from "../core/download.js";
import { VERDICT_LABELS } from "../core/licence.js";
import { formatDuration } from "../core/query.js";
import { parseShotList, planSequence, sequenceExports, type MediaPaths, type SequencePlan } from "../core/sequence.js";
import { ClipService, errorMessage } from "../core/service.js";
import type { Clip, ClipDetails, ClipFile, Orientation } from "../core/types.js";
import { compact } from "../core/util.js";
import { CATEGORIES, ORIENTATIONS, VIDEO_STYLES, resolutionLabel, type Category } from "../core/vocab.js";
import { versionLabel } from "./attribution.js";

export interface McpOptions {
  /** Allow tools to write to the local filesystem (stdio / trusted local use). */
  allowLocalDownload: boolean;
  /** Default destination for downloads. */
  downloadDir?: string;
  /** Public base URL of the HTTP API, used to offer download and preview links. */
  publicBaseUrl?: string;
  /** Where tool calls are recorded (defaults to no-op). */
  analytics?: Analytics;
  /**
   * Client family of the caller, for analytics only. The HTTP endpoint sets it
   * per request (src/mcp/attribution.ts). Without it, the family of the name
   * the client declared when it connected is used (stdio).
   */
  client?: string;
  /** More about the HTTP caller, for analytics only. */
  attribution?: {
    network: string;
    consistency: string;
    /** True on this caller's first tool call today (counts distinct callers). */
    newCaller?: (client: string) => boolean;
  };
}

export const VERSION = "0.1.0";

const categoryEnum = z.enum(CATEGORIES as [Category, ...Category[]]);
const styleEnum = z.enum(VIDEO_STYLES);
const orientationEnum = z.enum(ORIENTATIONS);

const LICENCE_RULES =
  "Every result has license.verdict. 'yes' = usable in a commercial video; 'yes-with-credit' = usable if you credit the source " +
  "(use the `attribution` line in the description or end credits); 'restricted', 'clearance-required' and 'check-terms' = tell the user " +
  "to read the terms first; 'no' = non-commercial only. license.editorial=true means people, insignia or brands appear without releases: " +
  "fine for news, documentary and education, not for ads or anything implying endorsement. Never present a 'no', 'check-terms' or editorial " +
  "clip as cleared for advertising. Searches are commercial-safe by default (commercial_only=true); set commercial_only=false only when the " +
  "user says the project is personal, educational or non-commercial.";

/** "1080", "4k", 2160 → pixels of the short side. */
const resolutionParam = z
  .union([z.number().int().min(144).max(4320), z.enum(["720", "1080", "1440", "2160", "hd", "fullhd", "4k"])])
  .optional()
  .describe("Minimum resolution (short side): 720, 1080, 1440 or 2160 (4K). A vertical 1080×1920 clip counts as 1080.");

function resolutionPx(v: number | string | undefined): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v === "number") return v;
  return { hd: 720, fullhd: 1080, "4k": 2160 }[v] ?? Number(v);
}

export function createMcpServer(service: ClipService, opts: McpOptions): McpServer {
  const base = opts.publicBaseUrl?.replace(/\/$/, "");
  const providerNames = service
    .listProviders()
    .filter((p) => p.access !== "link")
    .map((p) => p.name)
    .join(", ");
  const server = new McpServer(
    { name: "video-assets-server", version: VERSION },
    {
      instructions: [
        "Search free stock video (b-roll, backgrounds, nature, cities, space, science, archive films) across many sources at once",
        `(${providerNames}), with deep links into stock sites that can't be searched automatically (Pexels, Pixabay, Shutterstock…).`,
        "Queries understand resolution, orientation, length, frame rate and style words ('4k vertical drone ocean 10s', 'timelapse city night 60fps').",
        ...(opts.allowLocalDownload
          ? [
              "Typical flow: search_videos -> get_video (licence, renditions, watch URL) -> download_video.",
              "build_sequence turns a shot list into a b-roll sequence in one call: picks a clip per shot, downloads them, and writes an OpenTimelineIO timeline, an ffmpeg script, a Remotion clip list and the credits.",
            ]
          : [
              "Typical flow: search_videos -> get_video -> fetch selection.downloadUrl (a redirect to the file on the source's CDN).",
              "This server cannot write to your disk: if you have a shell, download the file yourself",
              '(`curl -L -o "footage/<selection.filename>" "<selection.downloadUrl>"`); otherwise give the user the link.',
              "build_sequence plans a b-roll sequence from a shot list and returns an OpenTimelineIO timeline, an ffmpeg script and a Remotion clip list that read the media straight from the sources.",
            ]),
        LICENCE_RULES,
        "Results marked downloadable=false must be obtained from their `url` on the source site.",
      ].join(" "),
    },
  );

  const providerIds = service.listProviders().map((p) => p.id);
  const sourceNames = Object.fromEntries(service.listProviders().map((p) => [p.id, p.name]));
  const analytics = opts.analytics ?? noopAnalytics;
  /** The caller's client family: given per request (HTTP), or from the client's declared name (stdio). */
  const clientOf = () => opts.client ?? clientFamily(server.server.getClientVersion()?.name);

  // Over a connection that stays open (stdio), the declared client is known
  // once it has connected. The stateless HTTP endpoint reports connects itself.
  server.server.oninitialized = () => {
    const info = server.server.getClientVersion();
    if (!info || opts.client) return;
    const client = clientFamily(info.name);
    analytics.mcpConnect({ client, clientVersion: versionLabel(client, info.version), clientName: info.name.slice(0, 64) });
  };

  /** Wrap a tool handler so every call is counted and timed. */
  const timed =
    <A>(tool: string, handler: (args: A) => Promise<ToolResult>) =>
    async (args: A): Promise<ToolResult> => {
      const started = Date.now();
      let outcome: "ok" | "error" = "error";
      try {
        const res = await handler(args);
        outcome = res.isError ? "error" : "ok";
        return res;
      } finally {
        const client = clientOf();
        const a = opts.attribution;
        analytics.toolCall({
          tool,
          client,
          outcome,
          tookMs: Date.now() - started,
          network: a?.network,
          consistency: a?.consistency,
          newCaller: a?.newCaller?.(client),
        });
      }
    };

  const links = (c: Pick<Clip, "id">) =>
    base
      ? {
          download: `${base}/v1/clips/${encodeURIComponent(c.id)}/download`,
          credits: `${base}/v1/clips/${encodeURIComponent(c.id)}/credits`,
          share: `${base}/search?clip=${encodeURIComponent(c.id)}`,
        }
      : undefined;

  server.registerTool(
    "search_videos",
    {
      title: "Search stock video",
      description:
        "Search every video source at once. Write the query like an editor would: 'ocean waves at sunset', 'drone city skyline night', " +
        "'rocket launch slow motion', 'clouds timelapse', 'abstract particles loop', '1950s newsreel factory', 'earth from space 4k'. " +
        "Resolution ('4k', '1080p'), orientation ('vertical', '9:16', 'square'), length ('10s', 'under 30 seconds', '1-2 min') and frame rate ('60fps') " +
        "in the query become filters; you can also pass them explicitly. A single length like '10s' means 'at least 10 seconds' (so the clip covers a shot that long). " +
        "Filter with `categories` (e.g. nature.ocean, city.skyline, aerial, space.earth, space.launch, background.abstract, overlay.light, greenscreen, archive.newsreel; " +
        "a parent like 'nature' matches all nature) and `styles` (timelapse, slow-motion, loop, animation, visualization, black-white). " +
        "Results carry orientation, resolution, fps, duration, a poster image, a preview video URL (plays in a browser, straight from the source) and the licence verdict. " +
        "The response also lists deep links into stock sites that can't be searched automatically. " +
        LICENCE_RULES,
      inputSchema: {
        query: z.string().describe("What the footage shows, e.g. 'ocean waves at sunset', 'busy street timelapse', 'earth from space'."),
        categories: z.array(categoryEnum).optional().describe("Only these categories (parents match children)."),
        styles: z.array(styleEnum).optional().describe("Preferred styles; ranked first (only filtered with strict=true, since sources rarely tag them)."),
        orientation: orientationEnum.optional().describe("landscape (16:9), portrait (9:16, Reels/TikTok/Shorts) or square."),
        min_resolution: resolutionParam,
        min_duration: z.number().nonnegative().optional().describe("Minimum length in seconds."),
        max_duration: z.number().positive().optional().describe("Maximum length in seconds."),
        min_fps: z.number().min(1).max(480).optional().describe("Minimum frame rate (e.g. 50 or 60 for slow-motion headroom)."),
        has_audio: z.boolean().optional().describe("Only clips with (true) or without (false) a sound track."),
        commercial_only: z.boolean().optional().describe("Only clips usable in commercial videos (default true)."),
        free_only: z.boolean().optional().describe("Exclude paid clips."),
        downloadable_only: z.boolean().optional().describe("Only clips with direct file links."),
        strict: z.boolean().optional().describe("Drop clips whose orientation/resolution/length/fps is unknown when you filter on them."),
        providers: z.array(z.string()).optional().describe(`Only search these sources. Available: ${providerIds.join(", ")}.`),
        limit: z.number().int().min(1).max(50).optional().describe("Max results (default 12)."),
        offset: z.number().int().min(0).optional().describe("Per-source offset for paging (e.g. 12 for page 2)."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    timed("search_videos", async (args) => {
      try {
        const started = Date.now();
        const duration = args.min_duration !== undefined || args.max_duration !== undefined ? { min: args.min_duration, max: args.max_duration } : undefined;
        const res = await service.search({
          query: args.query,
          categories: args.categories,
          styles: args.styles,
          orientations: args.orientation ? [args.orientation] : undefined,
          minResolution: resolutionPx(args.min_resolution),
          duration,
          minFps: args.min_fps,
          hasAudio: args.has_audio,
          commercialOnly: args.commercial_only ?? true,
          freeOnly: args.free_only,
          downloadableOnly: args.downloadable_only,
          strict: args.strict,
          providers: args.providers,
          limit: args.limit ?? 12,
          offset: args.offset,
        });
        analytics.search({
          surface: "mcp",
          client: clientOf(),
          query: args.query,
          categories: res.filters.categories,
          orientations: res.filters.orientations,
          minResolution: res.filters.minResolution,
          freeOnly: args.free_only,
          downloadableOnly: args.downloadable_only,
          response: res,
          tookMs: Date.now() - started,
        });
        return json({
          query: res.query,
          filters: res.filters,
          results: res.results.map((c) => summarize(c)),
          sources: res.providers
            .filter((p) => p.status === "ok")
            .map((p) => `${p.provider}: ${p.count}${p.total !== undefined ? `/${p.total}` : ""}`)
            .join(", "),
          skipped: res.providers.filter((p) => p.status === "skipped").map((p) => `${p.provider} (${p.error})`).join(", ") || undefined,
          also_search_on: res.providers.filter((p) => p.status === "link" && p.searchUrl).map((p) => ({ provider: p.name, url: p.searchUrl })),
          unavailable: res.providers
            .filter((p) => p.status === "error" || p.status === "timeout")
            .map((p) => ({ provider: p.provider, reason: p.error, url: p.searchUrl })),
          hint: res.results.length
            ? undefined
            : "Nothing matched. Try fewer or more general words, drop the resolution/length filters, set commercial_only=false for personal projects, or open also_search_on links.",
        });
      } catch (e) {
        return fail(e);
      }
    }),
  );

  server.registerTool(
    "get_video",
    {
      title: "Get video details, renditions and watch link",
      description:
        "Full details for a clip id from search_videos (e.g. 'nasa:KSC-20240525-MH-RKL01-0001-Rocket_Lab_PREFIRE_1_Launch_1080p-M6988'): licence and credit line, " +
        "every rendition (size, container, codec), a `watch` URL that plays in a browser straight from the source, and the poster. " +
        (opts.allowLocalDownload
          ? "Use download_video to fetch it."
          : "selection.downloadUrl redirects to the chosen file on the source's CDN (follow redirects); pass `height` to pick a rendition."),
      inputSchema: {
        id: z.string().describe("Clip id in the form '<provider>:<id>'."),
        height: z.number().int().min(144).max(4320).optional().describe("Wanted resolution (short side): picks the smallest file at or above it."),
        format: z.string().optional().describe("Preferred container: mp4, webm, mov."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    timed("get_video", async (args) => {
      try {
        const clip = await service.getClip(args.id);
        analytics.clipView({ surface: "mcp", client: clientOf(), provider: args.id.split(":")[0] ?? "", found: Boolean(clip) });
        if (!clip) return fail(`Clip not found: ${args.id}`);
        const selected = clip.files.length ? selectFiles(clip, { height: args.height, format: args.format }) : [];
        const size = totalBytes(selected);
        const l = links(clip);
        const q = new URLSearchParams();
        if (args.height) q.set("height", String(args.height));
        if (args.format) q.set("format", args.format);
        const pick = selected[0];
        return json(
          compact({
            ...summarize(clip),
            description: clip.description?.slice(0, 600),
            watch: pickPlayback(clip)?.url,
            files: clip.files.filter((f) => f.role !== "poster").map(describeFile),
            selection: pick
              ? compact({
                  file: pick.filename,
                  resolution: pick.width ? `${pick.width}×${pick.height}` : undefined,
                  format: pick.format,
                  size: size !== undefined ? formatBytes(size) : undefined,
                  downloadUrl: l ? `${l.download}${q.size ? `?${q}` : ""}` : pick.url,
                  directUrl: pick.url,
                  filename: clipPath(clip, pick).split("/").pop(),
                })
              : undefined,
            credits: l?.credits,
            note: clip.files.length ? undefined : "No direct files: get it from the clip's page on the source site.",
            shareUrl: l?.share,
          }),
        );
      } catch (e) {
        return fail(e);
      }
    }),
  );

  if (opts.allowLocalDownload) {
    server.registerTool(
      "download_video",
      {
        title: "Download a video clip",
        description:
          "Download a clip to a local folder (default: ./footage), filed by category (footage/nature/ocean/…mp4). " +
          "ATTRIBUTION.md and credits.json in the folder are updated with every download so the credits for a project are always in one place. " +
          "Pass `height` to get a smaller rendition instead of the master (e.g. 1080 for a 4K clip). Only works for clips with downloadable=true.",
        inputSchema: {
          id: z.string().describe("Clip id from search_videos."),
          dest_dir: z.string().optional().describe("Destination folder (the project's footage folder)."),
          height: z.number().int().min(144).max(4320).optional().describe("Wanted resolution (short side), e.g. 1080."),
          format: z.string().optional().describe("Preferred container: mp4, webm, mov."),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      },
      timed("download_video", async (args) => {
        try {
          const clip = await service.getClip(args.id);
          if (!clip) return fail(`Clip not found: ${args.id}`);
          const files = selectFiles(clip, { height: args.height, format: args.format });
          if (!files.length) {
            return fail(
              clip.files.length
                ? `No downloadable files match. Files: ${JSON.stringify(clip.files.map(describeFile))}`
                : `${clip.title} has no direct downloads. Get it from ${clip.url}`,
            );
          }
          const dir = resolve(args.dest_dir ?? opts.downloadDir ?? "footage");
          const result = await downloadClip(service.http, clip, files, dir);
          await recordCredits(dir, [clip], sourceNames);
          analytics.download({ surface: "mcp", client: clientOf(), provider: clip.provider, kind: "local", quality: qualityOf(files[0]) });
          return json(
            compact({
              id: clip.id,
              title: clip.title,
              directory: result.directory,
              files: result.files.map((f) => f.path),
              downloaded: formatBytes(result.bytes),
              license: licenceSummary(clip),
              attribution: clip.attribution,
              credits: `${dir}/ATTRIBUTION.md`,
              source: clip.url,
            }),
          );
        } catch (e) {
          return fail(e);
        }
      }),
    );
  }

  server.registerTool(
    "build_sequence",
    {
      title: "Build a b-roll sequence from a shot list",
      description:
        "Pick one clip per shot in one call. Give the shots as a list ('sunrise over a city skyline', 'coffee pour close-up (3s)', 'people walking in the rain') " +
        "and the target format (orientation or width/height, fps, total length). Each pick matches the orientation, is at least 1080p where possible and long " +
        "enough for its shot, is commercial-safe by default and has direct files; alternatives are listed per shot. Returns the plan plus an OpenTimelineIO " +
        "timeline (opens in DaVinci Resolve, Kdenlive; OTIO adapters for Premiere/FCP), an ffmpeg script that renders the sequence, a Remotion clip list and the credits" +
        (opts.allowLocalDownload ? ". With download=true the clips are saved and every file is written to dest_dir." : ". Media URLs point at the sources."),
      inputSchema: {
        shots: z
          .union([z.array(z.string().min(2)).min(1).max(24), z.string().min(2)])
          .describe("Shot descriptions, as a list or as text with one shot per line. '(3s)' at the end of a shot sets its length."),
        orientation: orientationEnum.optional().describe("Target orientation (default landscape)."),
        width: z.number().int().min(160).max(7680).optional(),
        height: z.number().int().min(160).max(7680).optional(),
        fps: z.number().min(1).max(120).optional().describe("Target frame rate (default 30)."),
        total_duration: z.number().positive().max(3600).optional().describe("Total length in seconds, split over shots without their own length (default 4 s each)."),
        commercial_only: z.boolean().optional().describe("Default true."),
        providers: z.array(z.string()).optional(),
        alternatives: z.number().int().min(0).max(5).optional().describe("Alternatives per shot (default 3)."),
        name: z.string().max(60).optional().describe("Name of the sequence (file names)."),
        ...(opts.allowLocalDownload
          ? {
              download: z.boolean().optional().describe("Download the picks and write the exports (default false)."),
              dest_dir: z.string().optional().describe("Folder for the sequence (default ./footage/sequences/<name>)."),
            }
          : {}),
      },
      annotations: { readOnlyHint: !opts.allowLocalDownload, openWorldHint: true },
    },
    timed("build_sequence", async (args: Record<string, unknown>) => {
      try {
        const raw = args.shots as string[] | string;
        const shots = Array.isArray(raw) ? raw.flatMap((s) => parseShotList(s)) : parseShotList(raw);
        if (!shots.length) return fail("Give at least one shot description.");
        const plan = await planSequence(service, {
          shots,
          orientation: args.orientation as Orientation | undefined,
          width: args.width as number | undefined,
          height: args.height as number | undefined,
          fps: args.fps as number | undefined,
          totalDurationSec: args.total_duration as number | undefined,
          commercialOnly: (args.commercial_only as boolean | undefined) ?? true,
          providers: args.providers as string[] | undefined,
          alternatives: (args.alternatives as number | undefined) ?? 3,
        });
        const name = (args.name as string | undefined) ?? "sequence";
        let media: MediaPaths | undefined;
        let written: string | undefined;
        if (opts.allowLocalDownload && args.download) {
          const dir = resolve((args.dest_dir as string | undefined) ?? join(opts.downloadDir ?? "footage", "sequences", name.replace(/[^\w.-]+/g, "-")));
          media = await downloadSequence(service, plan, dir);
          const files = sequenceExports(plan, { name, sourceNames, media });
          await mkdir(dir, { recursive: true });
          for (const [file, content] of Object.entries(files)) await writeFile(join(dir, file), content, { mode: file.endsWith(".sh") ? 0o755 : 0o644 });
          written = dir;
          analytics.download({ surface: "mcp", client: clientOf(), provider: "sequence", kind: "local" });
        }
        const exportsOut = written ? undefined : sequenceExports(plan, { name, sourceNames });
        return json(
          compact({
            name,
            frame: `${plan.width}×${plan.height} @ ${plan.fps} fps`,
            duration: formatDuration(plan.durationSec),
            commercialSafe: plan.commercialSafe,
            shots: plan.shots.map((s) =>
              compact({
                shot: s.index,
                description: s.description,
                seconds: s.durationSec,
                in: s.inSec || undefined,
                pick: s.clip ? summarize(s.clip) : undefined,
                file: s.file ? compact({ url: s.file.url, resolution: s.file.width ? `${s.file.width}×${s.file.height}` : undefined, format: s.file.format }) : undefined,
                alternatives: s.alternatives.length ? s.alternatives.map((a) => ({ id: a.id, title: a.title, verdict: a.license?.verdict })) : undefined,
                note: s.note,
              }),
            ),
            directory: written,
            files: written ? ["timeline.otio", "concat.sh", "remotion.json", "ATTRIBUTION.md", "credits.json", "footage/…"] : undefined,
            exports: exportsOut
              ? {
                  "concat.sh": exportsOut["concat.sh"],
                  "timeline.otio": "Save the JSON below as timeline.otio",
                  timeline: JSON.parse(exportsOut["timeline.otio"]),
                  remotion: JSON.parse(exportsOut["remotion.json"]),
                  "ATTRIBUTION.md": exportsOut["ATTRIBUTION.md"],
                }
              : undefined,
          }),
        );
      } catch (e) {
        return fail(e);
      }
    }),
  );

  server.registerTool(
    "list_sources",
    {
      title: "List video sources",
      description: "Every video source with what it is best for, categories, pricing, licence and capabilities.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    timed("list_sources", async () =>
      json(
        service.listProviders().map((p) =>
          compact({
            id: p.id,
            name: p.name,
            bestFor: p.description,
            categories: p.categories,
            pricing: p.pricing,
            license: p.license ? `${p.license.name} (${p.license.verdict})` : "per clip",
            search: p.access === "link" ? "deep link only" : p.access,
            downloads: p.supportsDownload,
            enabled: p.enabled ? undefined : `needs ${p.apiKeyEnv}`,
          }),
        ),
      ),
    ),
  );

  return server;
}

/** Download every pick of a planned sequence into <dir>/footage and return the local path per shot (relative to dir). */
async function downloadSequence(service: ClipService, plan: SequencePlan, dir: string): Promise<MediaPaths> {
  const media: MediaPaths = {};
  const footage = join(dir, "footage");
  for (const s of plan.shots) {
    if (!s.clip || !s.file) continue;
    const details = await service.getClip(s.clip.id);
    const file = details?.files.find((f) => f.url === s.file!.url);
    if (!details || !file) continue;
    const res = await downloadClip(service.http, details, [file], footage);
    const path = res.files[0]?.path;
    if (path) media[s.index] = relative(dir, path);
  }
  return media;
}

function qualityOf(f: ClipFile | undefined): string | undefined {
  if (!f?.width || !f.height) return undefined;
  const s = Math.min(f.width, f.height);
  return s >= 2094 ? "uhd" : s >= 1396 ? "qhd" : s >= 1047 ? "fhd" : s >= 698 ? "hd" : "sd";
}

function licenceSummary(c: Clip) {
  return c.license
    ? compact({
        name: c.license.name,
        id: c.license.id,
        verdict: c.license.verdict,
        meaning: VERDICT_LABELS[c.license.verdict],
        editorial: c.license.editorial || undefined,
        note: c.license.note,
        url: c.license.url,
      })
    : { verdict: "check-terms", meaning: VERDICT_LABELS["check-terms"] };
}

export function summarize(c: Clip) {
  return compact({
    id: c.id,
    title: c.title,
    category: c.category,
    styles: c.styles?.length ? c.styles : undefined,
    orientation: c.orientation,
    resolution: c.width && c.height ? `${c.width}×${c.height}${resolutionLabel(c.width, c.height) ? ` (${resolutionLabel(c.width, c.height)})` : ""}` : undefined,
    fps: c.fps,
    duration: c.durationSec,
    audio: c.hasAudio,
    year: c.year,
    source: c.provider,
    url: c.url,
    poster: c.posterUrl,
    preview: c.previewUrl,
    license: licenceSummary(c),
    attribution: c.attribution,
    author: c.author,
    free: c.price ? c.price.free : undefined,
    formats: c.formats?.length ? c.formats : undefined,
    downloadable: c.downloadable,
    needsAccount: c.requiresAccount || undefined,
    tags: c.tags.length ? c.tags.slice(0, 8) : undefined,
    score: c.score,
  });
}

function describeFile(f: ClipFile) {
  return compact({
    filename: f.filename,
    role: f.role,
    format: f.format,
    resolution: f.width && f.height ? `${f.width}×${f.height}` : undefined,
    fps: f.fps,
    codec: f.codec,
    size: f.sizeBytes !== undefined ? formatBytes(f.sizeBytes) : undefined,
    needsLogin: f.requiresAuth || undefined,
  });
}

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

export function json(value: unknown): ToolResult {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 1) }] };
}

function fail(e: unknown): ToolResult {
  return { isError: true, content: [{ type: "text" as const, text: typeof e === "string" ? e : errorMessage(e) }] };
}

export type { ClipDetails };
