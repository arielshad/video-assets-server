---
layout: ../../layouts/DocsLayout.astro
title: Video Assets Server CLI
crumb: CLI
description: Use the video-assets-server command line tool to search stock video sites from a terminal, download renditions, build b-roll sequences or run the MCP server.
---

# Video Assets Server CLI

The `video-assets-server` command searches every source from a terminal, downloads clips with their credits, turns a shot list into a b-roll sequence, runs the MCP server over stdio for desktop agents, and starts the HTTP server. It is the same code that runs https://video.shep.bot, and needs no API keys.

```bash
npx video-assets-server search "4k vertical drone ocean"
```

## Commands

```text
video-assets-server search <query> [--category nature.ocean] [--style timelapse] [--orientation portrait]
                     [--min-resolution 1080] [--min-duration 5] [--max-duration 30] [--commercial] [--free]
                     [--providers nasa,wikimediacommons] [--limit N]
video-assets-server download <id> [--height 1080] [--format mp4] [--dir ./footage]
video-assets-server sequence <shots.txt | "shot 1; shot 2; ..."> [--orientation portrait] [--size 1080x1920]
                     [--fps 30] [--total 30] [--download] [--dir ./footage/sequences/<name>] [--name promo]
video-assets-server mcp     # MCP server over stdio, with download_video writing to ./footage
video-assets-server serve   # HTTP API + website + MCP at /mcp on port 8787
```

## Search

Queries understand resolution, orientation, length and frame rate, so `"4k vertical drone ocean 10s"` filters exactly like `--min-resolution 2160 --orientation portrait --min-duration 10`. `--commercial` keeps only clips whose licence allows commercial use (verdict `yes` or `yes-with-credit`).

`search` prints the filters it read from your query, then ranked results (score, licence verdict and clip id; then the title with its category, resolution, orientation, length, frame rate and year; then the preview URL), followed by one status line per source. A `*` after the verdict marks editorial footage (people, insignia or brands without releases):

```text
$ npx video-assets-server search "vertical ocean" --limit 3
Filters: {"orientations":["portrait"]}

0.94  yes-with-credit* nasa:GSFC_20111012_BF_m10849_Bottom_Ocean
      Meanwhile, At the Bottom of the Ocean (nature.ocean · 2011)
      https://images-assets.nasa.gov/video/GSFC_20111012_BF_m10849_Bottom_Ocean/GSFC_20111012_BF_m10849_Bottom_Ocean~preview.mp4
…

  * editorial: people, insignia or brands without releases; not for ads.

Sources:
  nasa               ok       3
  internetarchive    ok       3
  pexels             link     0  https://www.pexels.com/search/videos/ocean/
```

Clips whose frame size the source only reports on the clip's own page (NASA search results, for example) stay in the list, ranked below clips known to match; open one with `get_video` or `/v1/clips/{id}` for its full facts.

## Download

```bash
npx video-assets-server download "nasa:GSFC_20161212_Tidal_m12450_Magnetic" --height 1080
```

Saves the smallest file that reaches `--height` (a 1080p rendition rather than a 4K master) into `./footage/<category>/`, and adds the clip to `ATTRIBUTION.md` and `credits.json` in that folder. It prints the licence and the credit line.

## Sequence

```bash
cat > shots.txt <<'TXT'
City skyline at night (4s)
Coffee pour close-up (3s)
People walking in the rain
Clouds timelapse
TXT
npx video-assets-server sequence shots.txt --orientation portrait --total 20 --name promo
sh footage/sequences/promo/concat.sh
```

Picks one clip per shot (commercial-safe unless you pass `--non-commercial`), prints the plan with a note for each shot that is cropped, upscaled or shorter than planned, and writes `timeline.otio`, `concat.sh`, `remotion.json`, `ATTRIBUTION.md` and `credits.json` into `./footage/sequences/<name>/`. With `--download` the picks are saved into its `footage/` folder and the exports use those local files; without it they read the media straight from the sources.

## Run it with Docker (no install)

```bash
docker run --rm ghcr.io/arielshad/video-assets-server node dist/cli.js search "rocket launch slow motion" --commercial
```

As a local MCP server that writes downloads into your project:

```bash
docker run -i --rm --user "$(id -u):$(id -g)" -v "$PWD/footage:/app/footage" \
  ghcr.io/arielshad/video-assets-server node dist/cli.js mcp
```

## Run it from source

```bash
git clone https://github.com/arielshad/video-assets-server
cd video-assets-server && npm ci && npm run build:server
node dist/cli.js search "clouds timelapse" --min-resolution 1080 --commercial
```

## Environment

| Variable | Purpose |
| --- | --- |
| `VIDEO_SERVER_PROVIDERS` | Comma list to search only some sources (e.g. `nasa,nasasvs`). |
| `VIDEO_DOWNLOAD_DIR` | Where `download`, `sequence` and `mcp` downloads go (default `./footage`). |
| `VIDEO_SERVER_USER_AGENT` | User-Agent sent to sources. Wikimedia requires contact details in it. |
| `NODE_USE_ENV_PROXY` | Set to `1` so Node honours `HTTPS_PROXY`. |

See [Self-hosting](/docs/self-hosting) for every server setting.
