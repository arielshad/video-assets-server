---
title: "Using an AI agent to find and license stock footage"
seoTitle: "Use an AI agent to find and license footage"
description: "Connect Claude Code, Cursor or another agent to Video Assets Server over MCP, then ask for footage, sequences and credit lines under the licence rules."
answer: "Add the MCP server https://video.shep.bot/mcp to your agent under the name 'video' (in Claude Code: claude mcp add --transport http video https://video.shep.bot/mcp). The agent then gets search_videos, get_video, build_sequence and list_sources. Ask for footage the way you would brief an editor, including format and use (\"three 4K ocean shots for a client ad\"). It searches commercial-safe by default, reports every clip's licence verdict, flags editorial footage and gives you the credit lines."
section: AI agents
kind: howto
steps:
  - name: "Connect the MCP server"
    text: "Claude Code: claude mcp add --transport http video https://video.shep.bot/mcp. Cursor, VS Code, Windsurf, Codex CLI and Gemini CLI take the same URL; the docs have a snippet for each."
  - name: "Brief it like an editor"
    text: "Say what the shot shows, the format (vertical, 4K, at least 10 seconds) and what the video is for (ad, documentary, personal). The use decides which licences are acceptable."
  - name: "Review before downloading"
    text: "Ask to see the picks with their verdicts, editorial flags and watch links (https://video.shep.bot/search?clip=<id>) before anything goes into the project."
  - name: "Let it fetch the files and credits"
    text: "With a shell, the agent downloads the chosen rendition via the download link; a local MCP server (npx -y video-assets-server mcp) writes the files and ATTRIBUTION.md into ./footage itself."
faq:
  - q: "Will the agent use non-commercial footage by mistake?"
    a: "Searches are commercial-safe unless you say the project is personal or non-commercial, and the server instructs agents never to present non-commercial, unclear or editorial clips as cleared for advertising. Still read the verdicts it reports."
  - q: "Can the agent download video on the hosted server?"
    a: "The hosted server never writes to disk or streams video. It returns download links that redirect to the source, which an agent with a shell can fetch with curl. For direct downloads, run the MCP server locally."
  - q: "My agent can't use MCP. What then?"
    a: "Point it at https://video.shep.bot/AGENTS.md, which explains the REST API and the licence rules in a page, or install the skill from https://video.shep.bot/skill/SKILL.md in Claude Code."
searches:
  - { label: "Example: vertical ocean, commercial-safe", href: "/search?q=ocean+waves&orientation=portrait&commercial=true" }
collections: [free-ocean-footage, rocket-launch-footage]
related: [b-roll-sequence-from-shot-list, free-stock-footage-commercial-use, editorial-vs-commercial-footage]
cites:
  - { name: "Model Context Protocol", url: "https://modelcontextprotocol.io" }
  - { name: "Claude Code: connect to MCP servers", url: "https://docs.claude.com/en/docs/claude-code/mcp" }
published: 2026-10-28
updated: 2026-10-28
order: 9
---

## Prompts that work

```text
Find three 4K clips of ocean waves at sunset I can use in a client ad. No editorial clips. Show me each one's licence, a watch link and the credit line.
```

```text
Build a 20-second vertical b-roll sequence for a Reel: city skyline at night (4s), coffee pour close-up (3s), people walking in the rain, clouds timelapse. Give me concat.sh and ATTRIBUTION.md.
```

```text
For a history video, find 1950s newsreel footage of factories and tell me which clips are public domain and which are unverified uploads.
```

## What the tools do

- **search_videos** searches every source with the query and filters (categories, styles, orientation, minimum resolution, length, frame rate). It parses words like "4k", "vertical" and "10s" itself, and returns links into the stock sites it can't search.
- **get_video** returns one clip's licence, verdict, editorial flag, credit line, every rendition and a watch URL, plus a download link for the rendition closest to the height you want.
- **build_sequence** picks one clip per shot and returns the plan with an OpenTimelineIO timeline, an ffmpeg script, a Remotion clip list and the credits.
- **list_sources** lists the sources with their licences and how they are searched.
- **download_video** (local servers only) saves a rendition into `./footage/<category>/` and keeps `ATTRIBUTION.md` up to date.

## The licence rules agents get

Every agent that connects is told the same rules: search commercial-safe unless the user says otherwise; report each clip's verdict; never present a non-commercial, unclear or editorial clip as cleared for advertising; pass on credit lines; treat uploader-asserted licences as unverified; and for NASA footage, credit NASA and never imply endorsement or use the NASA logo. You can hold your agent to them.

## Running it locally

```bash
claude mcp add video-local -- npx -y video-assets-server mcp
```

The local server adds `download_video`, and `build_sequence` can download the picks and write the exports next to them, so the timeline and the ffmpeg script use the local files. No API keys are needed for any source.
