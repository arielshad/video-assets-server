---
layout: ../../layouts/DocsLayout.astro
title: Quick start
crumb: Docs
description: Get started with Video Assets Server in two minutes. Search free stock video in the browser, connect Claude Code or Cursor over MCP, or call the REST API.
---

# Video Assets Server quick start

**Video Assets Server** searches free stock video sites at once and tells you, for every clip, whether you can use it in a commercial video. NASA's Image and Video Library and Scientific Visualization Studio, Wikimedia Commons and the Internet Archive are searched directly; Pexels, Pixabay, Coverr, Mixkit, Europeana, the Library of Congress and the paid libraries (Shutterstock, Adobe Stock, Getty Images, Storyblocks…) get a deep link with the same search. Results cover b-roll, backgrounds, nature, cities, people, aerials, space, science and archive films, with resolution, orientation, frame rate and length where known, a poster, a preview and a licence verdict.

The public server at **https://video.shep.bot** is a free, non-commercial service and needs no account or API key.

## Pick how you want to use it

| You want to… | Use | Start here |
| --- | --- | --- |
| Browse, watch and download footage yourself | The web search | [/search](/search) |
| Turn a shot list into a b-roll edit (OTIO, ffmpeg, Remotion) | The sequence builder | [/sequence](/sequence) |
| Let Claude Code, Cursor, Copilot or another agent find footage | The MCP server at `https://video.shep.bot/mcp` | [Coding agents & MCP](/docs/mcp) |
| Call it from a script, a render pipeline or a backend | The REST API | [REST API guide](/docs/api) |
| Search and download from a terminal | The CLI (`npx video-assets-server`) | [CLI](/docs/cli) |
| Explore every endpoint and try requests | The interactive reference | [API reference](/docs/api/reference) |

## Connect your agent (30 seconds)

For **Claude Code**, run this once:

```bash
claude mcp add --transport http video https://video.shep.bot/mcp
```

Then ask for what you need:

```text
Find three 4K clips of ocean waves at sunset that I can use in a client ad.
Tell me their licences and the credit lines I need.
```

Cursor, VS Code, Windsurf, Codex CLI, Gemini CLI and the Claude apps take the same URL. See [Coding agents & MCP](/docs/mcp) for each one.

## Or call the API

```bash
# Vertical ocean clips, at least 1080p, cleared for commercial use
curl "https://video.shep.bot/v1/search?q=ocean+waves&orientation=portrait&min_resolution=1080&commercial=true&limit=5"

# Details, renditions, the credit line and a watch URL for one result
curl "https://video.shep.bot/v1/clips/nasa%3AGSFC_20161212_Tidal_m12450_Magnetic"

# Download the 1080p rendition (a redirect to the file on NASA's servers)
curl -L -o tides.mp4 "https://video.shep.bot/v1/clips/nasa%3AGSFC_20161212_Tidal_m12450_Magnetic/download?height=1080"
```

## What a search returns

Every search returns three things:

- **`results`**: clips merged from all sources and ranked by how well they match. Each has an `id` like `nasa:<nasa-id>`, a `category` (`nature.ocean`, `space.launch`, `archive.newsreel`…), `styles` (`timelapse`, `slow-motion`…), `orientation`, `width`, `height`, `fps`, `durationSec` and `year` when known, a `posterUrl` and a `previewUrl` that play in a browser straight from the source, a `license` with a `verdict` and an `editorial` flag, an `attribution` line when credit is required, and `downloadable`.
- **`filters`**: what the server understood. Words like "4k", "vertical", "10s", "60fps" or "timelapse" in the query become filters.
- **`providers`**: one status line per source (`ok`, `error`, `timeout`, `skipped` or `link`). Sites that can't be searched automatically come back as `link` with a `searchUrl` that runs the same search on their site.

A slow or broken source never fails the search.

## No video through the server

Video Assets Server never streams, proxies or re-hosts video. It searches the sources, reads their metadata, decides a licence verdict and writes credit files. Everything that moves pictures comes straight from the source's servers:

- **Posters and previews** in the search grid load from the source's CDN (`images-assets.nasa.gov`, `upload.wikimedia.org`, `archive.org`, `svs.gsfc.nasa.gov`).
- **The player** in a clip's detail view plays the source's file (the `watch` URL from `GET /v1/clips/{id}`).
- **Downloads** (`/v1/clips/{id}/download`) answer `302` with the file's URL on the source.
- **Sequences** (`POST /v1/sequences`) return OTIO, ffmpeg and Remotion files whose media URLs point at the sources.

So the server stays small and cheap, the sources see real viewers, and nothing is redistributed.

## Licences, in one line each

- **Commercial use OK** (`yes`): use it, no credit needed.
- **Commercial use OK with credit** (`yes-with-credit`): use it and credit the source with the `attribution` line.
- **Restricted**, **Needs a paid licence or releases**, **Unclear** (`restricted`, `clearance-required`, `check-terms`): read the terms first.
- **Non-commercial only** (`no`): study and personal projects, not ads or client work.
- **Editorial** (`license.editorial: true`): people, insignia or brands without releases. News and documentary yes, advertising no.

`commercial=true` keeps only the first two verdicts. The full explanation is in [Video licences explained](/docs/licences).

## For AI agents reading this

Machine-readable entry points:

- [/AGENTS.md](/AGENTS.md): how to use this service as an agent, including the licence rules
- [/llms.txt](/llms.txt) and [/llms-full.txt](/llms-full.txt): site index and full docs as plain text
- [/openapi.json](/openapi.json): OpenAPI 3.1 description of the REST API
