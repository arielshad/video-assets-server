#!/usr/bin/env node
import { serve } from "@hono/node-server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createApp } from "./api/app.js";
import type { UmamiOptions } from "./api/site.js";
import { Gauge } from "prom-client";
import { PrometheusAnalytics, noopAnalytics, type Analytics } from "./core/analytics.js";
import { recordCredits } from "./core/credits-file.js";
import { downloadClip, formatBytes, selectFiles } from "./core/download.js";
import { createHttpClient } from "./core/http.js";
import { NetworkClassifier, startNetworkData } from "./core/network.js";
import { formatDuration } from "./core/query.js";
import { parseShotList, planSequence, sequenceExports } from "./core/sequence.js";
import { ClipService } from "./core/service.js";
import { teeAnalytics } from "./core/stats.js";
import { TELEMETRY_HOST, TELEMETRY_NOTICE, TELEMETRY_WEBSITE_ID, UmamiTelemetry, telemetryDisabled } from "./core/telemetry.js";
import type { Orientation } from "./core/types.js";
import { resolutionLabel } from "./core/vocab.js";
import { VERSION, createMcpServer } from "./mcp/server.js";
import { allProviders } from "./providers/index.js";

const HELP = `video-assets-server — search & download free stock video from many sources

Usage:
  video-assets-server serve      Start the HTTP API + website (+ MCP at /mcp)
  video-assets-server mcp        Run the MCP server over stdio (for Claude Desktop/Code, Cursor, ...)
  video-assets-server search <query> [--category nature.ocean] [--style timelapse] [--orientation portrait]
                       [--min-resolution 1080] [--min-duration 5] [--max-duration 30] [--commercial] [--free]
                       [--providers nasa,wikimediacommons] [--limit N]
  video-assets-server download <id> [--height 1080] [--format mp4] [--dir ./footage]
  video-assets-server sequence <shots.txt | "shot 1; shot 2; ..."> [--orientation portrait] [--size 1080x1920]
                       [--fps 30] [--total 30] [--download] [--dir ./footage/sequences/<name>] [--name promo]

  Queries understand resolution, orientation, length and frame rate:
    video-assets-server search "4k vertical drone ocean 10s"

Environment:
  PORT                         HTTP port (default 8787)
  HOST                         Bind address (default 0.0.0.0)
  VIDEO_SERVER_API_KEY         Require this key on /v1 and /mcp
  VIDEO_SERVER_PUBLIC_URL      Public base URL used in links
  VIDEO_SERVER_PROVIDERS       Comma list to enable a subset of providers
  VIDEO_DOWNLOAD_DIR           Default folder for MCP downloads (default ./footage)
  VIDEO_SERVER_HTTP_DOWNLOADS  "true" to expose download_video on the HTTP MCP endpoint (writes to the server's disk)
  VIDEO_SERVER_HTTP_MCP        "false" to turn off MCP at /mcp (website and /v1 API stay up)
  VIDEO_SERVER_USER_AGENT      User-Agent for source requests (include contact details; Wikimedia requires it)
  VIDEO_SERVER_RATE_LIMIT      Requests per client per window on /v1 and /mcp (default 120, 0 = off)
  VIDEO_SERVER_RATE_LIMIT_WINDOW  Window in seconds (default 60)
  METRICS_PORT                 Serve Prometheus metrics on this port at /metrics and log
                               one JSON line per search/download/tool call (off when unset)
  PROMETHEUS_URL               Prometheus that scrapes METRICS_PORT; /v1/stats then reports
                               the last 24 hours and 7 days (default: counts since start)
  MAXMIND_ACCOUNT_ID, MAXMIND_LICENSE_KEY
                               With METRICS_PORT: download MaxMind GeoLite2-ASN (free) to label
                               MCP callers by network (isp, aws, gcp, ...). Refreshed weekly
  VIDEO_SERVER_ASN_DB          Use this GeoLite2-ASN .mmdb file instead of downloading one
  VIDEO_SERVER_SESSION_SECRET  Signs MCP session IDs used to label tool calls by client
                               (random per process when unset)
  VIDEO_SERVER_TELEMETRY       "1" to send anonymous usage telemetry (off by default; also needs
                               VIDEO_SERVER_TELEMETRY_WEBSITE_ID; event counts only, see /privacy)
  DO_NOT_TRACK                 "1" always turns telemetry off
  UMAMI_WEBSITE_ID, UMAMI_HOST Send web page views to your own Umami instead
`;

function buildService(): ClipService {
  const only = process.env.VIDEO_SERVER_PROVIDERS?.split(",").map((s) => s.trim()).filter(Boolean);
  const providers = only?.length ? allProviders.filter((p) => only.includes(p.id)) : allProviders;
  return new ClipService({ providers, http: createHttpClient() });
}

async function main(argv: string[]): Promise<void> {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case "serve": {
      const service = buildService();
      const port = Number(process.env.PORT ?? 8787);
      const hostname = process.env.HOST ?? "0.0.0.0";
      const telemetry = startTelemetry("http");
      const metrics = startMetrics(hostname);
      const analytics = telemetry ? teeAnalytics(metrics.analytics, telemetry) : metrics.analytics;
      const httpMcpDisabled = process.env.VIDEO_SERVER_HTTP_MCP === "false";
      const app = createApp(service, {
        analytics,
        networks: metrics.networks,
        mcpSessionSecret: process.env.VIDEO_SERVER_SESSION_SECRET,
        rateLimit: {
          limit: Number(process.env.VIDEO_SERVER_RATE_LIMIT ?? 120),
          windowSec: Number(process.env.VIDEO_SERVER_RATE_LIMIT_WINDOW ?? 60),
        },
        apiKey: process.env.VIDEO_SERVER_API_KEY,
        publicBaseUrl: process.env.VIDEO_SERVER_PUBLIC_URL,
        allowServerDownloads: process.env.VIDEO_SERVER_HTTP_DOWNLOADS === "true",
        httpMcpDisabled,
        downloadDir: process.env.VIDEO_DOWNLOAD_DIR,
        prometheus: process.env.PROMETHEUS_URL ? { url: process.env.PROMETHEUS_URL } : undefined,
        umami: umamiFromEnv() ?? (telemetry ? { websiteId: TELEMETRY_WEBSITE_ID, host: TELEMETRY_HOST, anonymous: true } : undefined),
      });
      serve({ fetch: app.fetch, port, hostname }, (info) => {
        console.log(`video-assets-server listening on http://${hostname}:${info.port}${httpMcpDisabled ? "" : " (MCP at /mcp)"}`);
      });
      return;
    }
    case "mcp": {
      const service = buildService();
      const telemetry = startTelemetry("stdio");
      const server = createMcpServer(service, {
        analytics: telemetry,
        allowLocalDownload: true,
        downloadDir: process.env.VIDEO_DOWNLOAD_DIR,
        publicBaseUrl: process.env.VIDEO_SERVER_PUBLIC_URL,
      });
      await server.connect(new StdioServerTransport());
      // stdout is the protocol channel; log to stderr only.
      console.error("video-assets-server MCP running on stdio");
      return;
    }
    case "search": {
      const service = buildService();
      const flags = parseFlags(rest);
      const num = (v?: string) => (v ? Number(v) : undefined);
      const res = await service.search({
        query: flags.positional.join(" "),
        categories: flags.category?.split(",") as never,
        styles: flags.style?.split(",") as never,
        orientations: flags.orientation?.split(",") as never,
        minResolution: flags["min-resolution"] ? Number(flags["min-resolution"].replace(/^4k$/i, "2160").replace(/p$/i, "")) : undefined,
        duration: flags["min-duration"] || flags["max-duration"] ? { min: num(flags["min-duration"]), max: num(flags["max-duration"]) } : undefined,
        commercialOnly: flags.commercial !== undefined,
        freeOnly: flags.free !== undefined,
        providers: flags.providers?.split(","),
        limit: flags.limit ? Number(flags.limit) : 15,
      });
      if (Object.keys(res.filters).length) console.log(`Filters: ${JSON.stringify(res.filters)}\n`);
      for (const c of res.results) {
        const facts = [c.category, resolutionLabel(c.width, c.height), c.orientation, formatDuration(c.durationSec), c.fps ? `${c.fps}fps` : "", c.year ? String(c.year) : ""]
          .filter(Boolean)
          .join(" · ");
        const verdict = `${c.license?.verdict ?? "?"}${c.license?.editorial ? "*" : ""}`;
        console.log(`${c.score?.toFixed(2)}  ${verdict.padEnd(16)} ${c.id}\n      ${c.title} (${facts})\n      ${c.previewUrl ?? c.url}`);
      }
      if (res.results.some((c) => c.license?.editorial)) console.log("\n  * editorial: people, insignia or brands without releases; not for ads.");
      console.log("\nSources:");
      for (const p of res.providers) {
        console.log(`  ${p.provider.padEnd(18)} ${p.status.padEnd(8)} ${p.count} ${p.error ?? ""} ${p.status === "link" ? p.searchUrl : ""}`);
      }
      return;
    }
    case "download": {
      const flags = parseFlags(rest);
      const id = flags.positional[0];
      if (!id) throw new Error("Usage: video-assets-server download <id> [--height 1080] [--format mp4] [--dir ./footage]");
      const service = buildService();
      const clip = await service.getClip(id);
      if (!clip) throw new Error(`Clip not found: ${id}`);
      const files = selectFiles(clip, { height: flags.height ? Number(flags.height) : undefined, format: flags.format });
      if (!files.length) throw new Error(`${clip.title} has no direct downloads. Get it from ${clip.url}`);
      const dir = flags.dir ?? process.env.VIDEO_DOWNLOAD_DIR ?? "footage";
      const res = await downloadClip(service.http, clip, files, dir);
      await recordCredits(dir, [clip], Object.fromEntries(service.listProviders().map((p) => [p.id, p.name])));
      for (const f of res.files) console.log(`${f.path} (${formatBytes(f.bytes)})`);
      console.log(`Licence: ${clip.license?.name ?? "unknown"} (${clip.license?.verdict ?? "check-terms"})${clip.attribution ? `\nCredit: ${clip.attribution}` : ""}\nCredits: ${dir}/ATTRIBUTION.md`);
      return;
    }
    case "sequence": {
      const flags = parseFlags(rest);
      const arg = flags.positional.join(" ");
      if (!arg) throw new Error('Usage: video-assets-server sequence <shots.txt | "shot 1; shot 2"> [--orientation portrait] [--total 30]');
      const { existsSync, readFileSync } = await import("node:fs");
      const text = existsSync(arg) ? readFileSync(arg, "utf8") : arg;
      const size = /^(\d+)x(\d+)$/.exec(flags.size ?? "");
      const service = buildService();
      const name = flags.name ?? "sequence";
      const plan = await planSequence(service, {
        shots: parseShotList(text),
        orientation: flags.orientation as Orientation | undefined,
        width: size ? Number(size[1]) : undefined,
        height: size ? Number(size[2]) : undefined,
        fps: flags.fps ? Number(flags.fps) : undefined,
        totalDurationSec: flags.total ? Number(flags.total) : undefined,
        commercialOnly: flags["non-commercial"] === undefined,
      });
      const { join, relative, resolve } = await import("node:path");
      const { mkdir, writeFile } = await import("node:fs/promises");
      const dir = resolve(flags.dir ?? join(process.env.VIDEO_DOWNLOAD_DIR ?? "footage", "sequences", name.replace(/[^\w.-]+/g, "-")));
      const sourceNames = Object.fromEntries(service.listProviders().map((p) => [p.id, p.name]));
      const media: Record<number, string> = {};
      if (flags.download !== undefined) {
        for (const s of plan.shots) {
          if (!s.clip || !s.file) continue;
          const details = await service.getClip(s.clip.id);
          const file = details?.files.find((f) => f.url === s.file!.url);
          if (!details || !file) continue;
          const r = await downloadClip(service.http, details, [file], join(dir, "footage"));
          if (r.files[0]) media[s.index] = relative(dir, r.files[0].path);
        }
      }
      await mkdir(dir, { recursive: true });
      for (const [file, content] of Object.entries(sequenceExports(plan, { name, sourceNames, media }))) {
        await writeFile(join(dir, file), content, { mode: file.endsWith(".sh") ? 0o755 : 0o644 });
      }
      for (const s of plan.shots) {
        console.log(`${String(s.index).padStart(2)}. ${s.description} (${s.durationSec}s)\n    ${s.clip ? `${s.clip.id}: ${s.clip.title}` : "— nothing found"}${s.note ? `\n    note: ${s.note}` : ""}`);
      }
      console.log(`\n${plan.width}x${plan.height} @ ${plan.fps}fps, ${formatDuration(plan.durationSec)}, commercial-safe: ${plan.commercialSafe}\nWrote ${dir}/{timeline.otio,concat.sh,remotion.json,ATTRIBUTION.md,credits.json}\nRender: sh ${join(dir, "concat.sh")}`);
      return;
    }
    default:
      console.log(HELP);
      if (cmd && cmd !== "help" && cmd !== "--help") process.exitCode = 1;
  }
}

function parseFlags(args: string[]): { positional: string[] } & Record<string, string | undefined> {
  const out: { positional: string[] } & Record<string, string | undefined> = { positional: [] } as never;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else out[key] = "";
    } else out.positional.push(a);
  }
  return out;
}

main(process.argv.slice(2)).catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Analytics are opt-in: with METRICS_PORT set, metrics are served on that
 * separate port (kept off the public listener) and product events are
 * logged as JSON lines. MCP callers are then also labelled by network
 * (src/core/network.ts): OpenAI's published ranges are fetched, and the ASN
 * database is used when one is configured.
 */
function startMetrics(hostname: string): { analytics: Analytics; networks?: NetworkClassifier } {
  const port = Number(process.env.METRICS_PORT);
  if (!port) return { analytics: noopAnalytics };
  const analytics = new PrometheusAnalytics();
  const networks = new NetworkClassifier();
  startNetworkData({
    classifier: networks,
    asnDbPath: process.env.VIDEO_SERVER_ASN_DB,
    maxmindAccountId: process.env.MAXMIND_ACCOUNT_ID,
    maxmindLicenseKey: process.env.MAXMIND_LICENSE_KEY,
  });
  new Gauge({
    name: "video_server_asn_db_build_timestamp_seconds",
    help: "When the ASN database behind the MCP `network` label was built (0 = none loaded, ISP and cloud show as unknown).",
    registers: [analytics.registry],
    collect() {
      this.set(networks.asnBuiltAt);
    },
  });
  new Gauge({
    name: "video_server_openai_ranges",
    help: "OpenAI egress ranges loaded for the MCP `network` label (0 = none).",
    registers: [analytics.registry],
    collect() {
      this.set(networks.openaiRanges);
    },
  });
  serve(
    {
      port,
      hostname,
      fetch: async (req) => {
        if (new URL(req.url).pathname !== "/metrics") return new Response("not found", { status: 404 });
        return new Response(await analytics.registry.metrics(), {
          headers: { "content-type": analytics.registry.contentType },
        });
      },
    },
    (info) => console.error(`metrics on http://${hostname}:${info.port}/metrics`),
  );
  return { analytics, networks };
}

/**
 * Anonymous usage telemetry (src/core/telemetry.ts), off unless the user opted
 * in. The notice goes to stderr: in stdio mode stdout is the MCP channel.
 */
function startTelemetry(mode: "http" | "stdio"): UmamiTelemetry | undefined {
  if (telemetryDisabled()) return undefined;
  console.error(TELEMETRY_NOTICE);
  const telemetry = new UmamiTelemetry({ version: VERSION, mode });
  telemetry.started();
  return telemetry;
}

/**
 * Your own web analytics: with UMAMI_WEBSITE_ID and UMAMI_HOST set, every page
 * loads that Umami's tracker (instead of the telemetry one). Visits only count
 * on the hostname of VIDEO_SERVER_PUBLIC_URL when it is set.
 */
function umamiFromEnv(): UmamiOptions | undefined {
  const websiteId = process.env.UMAMI_WEBSITE_ID;
  const host = process.env.UMAMI_HOST;
  if (!websiteId || !host) return undefined;
  const publicUrl = process.env.VIDEO_SERVER_PUBLIC_URL;
  return { websiteId, host, domain: publicUrl ? new URL(publicUrl).hostname : undefined };
}
