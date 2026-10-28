---
layout: ../../layouts/DocsLayout.astro
title: Self-hosting
crumb: Self-hosting
description: Run your own Video Assets Server with Docker or Node.js, protect it with an API key, let the MCP server download to disk, and expose Prometheus metrics.
---

# Self-hosting Video Assets Server

Video Assets Server is open source (Apache-2.0). Run your own copy to put it behind an API key, let the MCP server write footage to a shared disk, pick which sources it searches, or keep searches on your own network. No source needs an API key.

## Docker

```bash
docker run -p 8787:8787 ghcr.io/arielshad/video-assets-server
```

Open http://localhost:8787 for the website, `/v1/*` for the API and `/mcp` for MCP. Behind a TLS proxy, set `VIDEO_SERVER_PUBLIC_URL=https://video.example.com` so the links handed to MCP clients and share links use your public address.

## Node.js

```bash
git clone https://github.com/arielshad/video-assets-server
cd video-assets-server
npm ci && npm --prefix web ci && npm run build
npm start
```

Node 20 or newer (the Docker image uses Node 22).

## No video through the server

The server is light because it never handles video: it searches the sources, reads their metadata, decides licence verdicts and writes credit files. The website's posters, previews and player load straight from the sources, and `/v1/clips/{id}/download` answers with a `302` to the file on the source. Bandwidth and CPU stay low whatever people watch; only the MCP `download_video` tool and the CLI's `download` and `sequence --download` fetch video, and they write to the disk of whoever runs them.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` / `HOST` | `8787` / `0.0.0.0` | HTTP bind address. |
| `VIDEO_SERVER_API_KEY` | none | Require `Authorization: Bearer <key>` or `x-api-key` on `/v1/*` and `/mcp`. Keys are accepted in headers only, never in the URL. The website asks for it and sends it as a header. |
| `VIDEO_SERVER_PUBLIC_URL` | request origin | Base URL used in links handed to MCP clients and in share links. Set it behind a TLS proxy. |
| `VIDEO_SERVER_PROVIDERS` | all | Comma list to enable only some sources (e.g. `nasa,nasasvs,wikimediacommons`). |
| `VIDEO_DOWNLOAD_DIR` | `./footage` | Where MCP and CLI downloads go (`<dir>/<category>/…`, with `ATTRIBUTION.md` and `credits.json`). |
| `VIDEO_SERVER_HTTP_DOWNLOADS` | `false` | Expose `download_video` on the HTTP MCP endpoint (writes to the server's disk). |
| `VIDEO_SERVER_HTTP_MCP` | `true` | Set to `false` to turn off MCP over HTTP at `/mcp`. The website and `/v1` API keep working, and the stdio MCP server is unaffected. |
| `VIDEO_SERVER_PROVIDER_TIMEOUT_MS` | `12000` | Per-source search timeout. |
| `VIDEO_SERVER_HTTP_TIMEOUT_MS` | `15000` | Timeout for each request to a source. |
| `VIDEO_SERVER_CACHE_TTL_MS` | `600000` | How long source responses are cached in memory (10 minutes). |
| `VIDEO_SERVER_MAX_DOWNLOAD_BYTES` | 8 GiB | Cap for one local download. |
| `VIDEO_SERVER_DOWNLOAD_IDLE_MS` | `30000` | Abort a local download when no bytes arrive for this long. |
| `VIDEO_SERVER_USER_AGENT` | built in | The User-Agent sent to sources. Keep it descriptive with contact details: Wikimedia limits clients without one to about 10 requests a minute. |
| `VIDEO_SERVER_RATE_LIMIT` | `120` | Requests per client per window on `/v1/*` and `/mcp`, with RateLimit headers and `429` + `Retry-After` beyond it. `0` turns it off. |
| `VIDEO_SERVER_RATE_LIMIT_WINDOW` | `60` | Rate-limit window in seconds. |
| `METRICS_PORT` | off | Serve Prometheus metrics on this separate port at `/metrics`, and log one JSON line per search, download and tool call. |
| `PROMETHEUS_URL` | off | Prometheus that scrapes `METRICS_PORT`. `/v1/stats` and the `/stats` page then show the last 24 hours and 7 days; without it they count since the server started. |
| `MAXMIND_ACCOUNT_ID`, `MAXMIND_LICENSE_KEY` | off | With `METRICS_PORT`: download MaxMind's free GeoLite2-ASN database (refreshed weekly) to label MCP callers by network (ISP, AWS, Google Cloud, Azure, other hosting). |
| `VIDEO_SERVER_ASN_DB` | none | Path to a GeoLite2-ASN `.mmdb` file to use instead of downloading one. |
| `VIDEO_SERVER_SESSION_SECRET` | random | Signs the MCP session IDs that carry each client's declared name. Set it so sessions keep their label across restarts. |
| `VIDEO_SERVER_TELEMETRY` | off | `1` to send anonymous usage counts to the maintainers (also needs `VIDEO_SERVER_TELEMETRY_WEBSITE_ID`; see [Privacy](/privacy)). `DO_NOT_TRACK=1` always turns it off. |
| `UMAMI_WEBSITE_ID`, `UMAMI_HOST` | off | Add your own self-hosted Umami tracker to the website pages (cookieless page views). |

## Analytics

With `METRICS_PORT` set, the server exports Prometheus metrics with bounded labels only (surface, client family, source, status, tool):

- `video_server_searches_total`, `video_server_search_duration_seconds`, `video_server_search_results`
- `video_server_provider_requests_total` and `video_server_provider_duration_seconds` for each source's health and latency
- `video_server_clip_views_total`, `video_server_downloads_total`
- `video_server_mcp_tool_calls_total` and `video_server_mcp_tool_duration_seconds` by tool, client family (Claude Code, Cursor, VS Code, …), network and consistency (whether the declared client, User-Agent and network agree)
- `video_server_mcp_connects_total` and `video_server_mcp_new_callers_total` (first tool call of the day per caller, counted from a hash with a daily salt)
- `video_server_http_requests_total`, `video_server_http_request_duration_seconds`, `video_server_page_views_total`

The [/stats](/stats) page and `GET /v1/stats` read these counters back: from Prometheus when `PROMETHEUS_URL` is set, otherwise from this process since it started.

Each search also logs a JSON line (`{"event":"search","query":…,"results":…}`) for top-query and zero-result analysis. Nothing personal is recorded with it: no IP addresses, keys or cookies.

## Stdio MCP

```bash
node dist/cli.js mcp      # or: npx -y video-assets-server mcp
```

Runs the MCP server over stdio with `download_video` and `build_sequence` downloads (`download=true`) enabled, for desktop clients that launch a local process. Downloads go to `VIDEO_DOWNLOAD_DIR`.

## Content Security Policy

The website ships with a strict Content-Security-Policy (no inline scripts or styles except by hash or per-request nonce). Posters and previews load from the sources' CDNs, so `img-src` allows `https:` and `media-src` allows `https:` and `blob:`; keep that in mind if you put a proxy in front that rewrites headers.
