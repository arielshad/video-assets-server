---
layout: ../../layouts/DocsLayout.astro
title: MCP server for AI agents
crumb: Coding agents & MCP
description: Connect Claude Code, Cursor, VS Code, Windsurf, Codex or Gemini CLI to the Video Assets Server MCP server so your agent finds, vets and fetches stock footage.
---

# Video Assets Server MCP server for AI agents

Video Assets Server is a [Model Context Protocol](https://modelcontextprotocol.io) server. Connect it once and your agent can search every video source, check licences, pick the right rendition and cut b-roll sequences while it works on your video, site or app.

**MCP endpoint:** `https://video.shep.bot/mcp` (Streamable HTTP, no authentication). Register it under the name **`video`**.

## Claude Code

```bash
claude mcp add --transport http video https://video.shep.bot/mcp
```

Add `--scope user` to make it available in every project, or `--scope project` to share it with your team through `.mcp.json`. Check it with `claude mcp list`, or `/mcp` inside a session.

## Cursor

Add this to `.cursor/mcp.json` in your project, or to `~/.cursor/mcp.json` for every project (the [home page](/#agents) has a one-click "Add to Cursor" button):

```json
{
  "mcpServers": {
    "video": { "url": "https://video.shep.bot/mcp" }
  }
}
```

## VS Code (GitHub Copilot)

Add to `.vscode/mcp.json`, then use Copilot Chat in **Agent** mode:

```json
{
  "servers": {
    "video": { "type": "http", "url": "https://video.shep.bot/mcp" }
  }
}
```

Or from a terminal: `code --add-mcp '{"name":"video","type":"http","url":"https://video.shep.bot/mcp"}'`

## Claude desktop app and claude.ai

Open **Settings → Connectors → Add custom connector**, name it *Video Assets Server* and paste `https://video.shep.bot/mcp`.

## Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "video": { "serverUrl": "https://video.shep.bot/mcp" }
  }
}
```

## OpenAI Codex CLI

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.video]
url = "https://video.shep.bot/mcp"
```

## Gemini CLI

```bash
gemini mcp add --transport http video https://video.shep.bot/mcp
```

## Any other client

Clients that only support stdio servers can bridge to the HTTP endpoint with [`mcp-remote`](https://www.npmjs.com/package/mcp-remote):

```json
{
  "mcpServers": {
    "video": { "command": "npx", "args": ["-y", "mcp-remote", "https://video.shep.bot/mcp"] }
  }
}
```

## Tools your agent gets

| Tool | What it does |
| --- | --- |
| `search_videos` | Search every source. Arguments: `query` (editor words work: "ocean waves at sunset", "4k vertical drone city 10s", "timelapse city night 60fps"), `categories` (e.g. `nature.ocean`, `aerial`, `space.launch`, `background.abstract`, `archive.newsreel`), `styles` (`timelapse`, `slow-motion`, `loop`, `animation`, `visualization`, `black-white`), `orientation`, `min_resolution` (720, 1080, 1440, 2160), `min_duration`, `max_duration`, `min_fps`, `has_audio`, `commercial_only` (default **true**), `free_only`, `downloadable_only`, `strict`, `providers`, `limit`, `offset`. Also returns `also_search_on`: deep links into the stock sites that can't be searched automatically. |
| `get_video` | Details for one `id`: licence, verdict, editorial flag and credit line, every rendition (size, container, codec), a `watch` URL that plays in a browser straight from the source, and `selection.downloadUrl` for the file closest to `height` (and `format`). |
| `build_sequence` | Turns a shot list (a list, or text with one shot per line and "(3s)" lengths) into a b-roll sequence: one clip per shot matching `orientation` (or `width`/`height`), `fps` and `total_duration`, commercial-safe by default, with alternatives, plus `timeline.otio`, an ffmpeg `concat.sh`, a Remotion clip list and `ATTRIBUTION.md`. |
| `list_sources` | Every source with what it is best for, categories, pricing, licence and whether it is searched or linked. |
| `download_video` | **Local servers only**: writes the chosen rendition into `./footage/<category>/` and keeps `ATTRIBUTION.md` and `credits.json` up to date. |

The hosted server never writes to its own disk, so agents with a shell download through the links it returns (the download URL redirects to the file on the source):

```bash
mkdir -p footage
curl -L -o footage/launch.mp4 "https://video.shep.bot/v1/clips/<id>/download?height=1080"
```

## Licence rules the agent follows

Stock footage licences have traps, so the server tells every agent the same rules, and you can expect them to be followed:

- Searches are **commercial-safe by default** (`commercial_only=true`). The agent turns that off only when you say the project is personal, educational or non-commercial.
- It **reports the verdict** of every clip it suggests, and never presents a `no` (non-commercial), `check-terms` (unclear) or **editorial** clip as cleared for advertising.
- `license.editorial: true` means people, insignia or brands appear without releases: fine for news, documentary and education, not for ads or anything that implies endorsement. All NASA footage carries it.
- When a clip needs credit (`yes-with-credit`), it gives you the exact `attribution` line; local downloads and sequences collect them in `ATTRIBUTION.md`.
- Uploader-asserted licences (most of the Internet Archive) are flagged as unverified.

Details: [Video licences explained](/docs/licences).

## Prompts that work well

```text
Find three 4K clips of ocean waves at sunset for a client ad. Commercial-safe only, no editorial clips. Show me each one's licence and credit line first.
```

```text
Build a 30-second vertical b-roll sequence for an Instagram Reel: city skyline at night (4s), coffee pour close-up (3s), people walking in the rain, clouds timelapse. Give me the ffmpeg script and ATTRIBUTION.md.
```

```text
I'm making a documentary about the space race. Find 1960s rocket launch footage and archive newsreels, and tell me which ones are public domain.
```

Tips for agents and the people prompting them:

- Describe the shot, not the file: "drone shot over a forest at sunrise", "slow motion rocket engine", "abstract particles loop".
- Put the format in the words or the filters: "vertical", "4k", "at least 10 seconds", "60fps".
- Results with `downloadable: false` must be fetched from their `url` on the source site. Internet Archive results have no preview until `get_video` reads their file list.

## Local mode: downloads straight to disk

For `download_video` and sequence downloads into your project, run the server locally over stdio:

```bash
claude mcp add video-local -- npx -y video-assets-server mcp
```

Or with Docker, mounting your footage folder:

```bash
claude mcp add video-local -- docker run -i --rm \
  --user "$(id -u):$(id -g)" -v "$PWD/footage:/app/footage" \
  ghcr.io/arielshad/video-assets-server node dist/cli.js mcp
```

Files land in `./footage/<category>/` (set `VIDEO_DOWNLOAD_DIR` to change it), with `ATTRIBUTION.md` and `credits.json` next to them. `build_sequence` with `download=true` saves the picks into `./footage/sequences/<name>/footage/` and writes the exports next to them, pointing at the local files. No source needs an API key.

## Agents without MCP

Any agent that can fetch URLs can use the REST API directly. Point it at [/AGENTS.md](/AGENTS.md); it has the whole workflow and the licence rules in a few lines. In Claude Code you can also install the ready-made skill:

```bash
mkdir -p ~/.claude/skills/video
curl -fsSL https://video.shep.bot/skill/SKILL.md -o ~/.claude/skills/video/SKILL.md
```
