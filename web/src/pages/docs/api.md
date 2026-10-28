---
layout: ../../layouts/DocsLayout.astro
title: REST API guide
crumb: REST API guide
description: Search free stock video across many sites with one REST call, read licence verdicts and credit lines, get renditions from the source and plan b-roll sequences.
---

# Video Assets Server REST API guide

A small JSON API over HTTPS. No key is needed on `https://video.shep.bot`. Every endpoint is described in the [OpenAPI 3.1 spec](/openapi.json), which you can explore and try in the [interactive reference](/docs/api/reference).

**Base URL:** `https://video.shep.bot`

## The flow

1. `GET /v1/search`: find candidates across every source.
2. `GET /v1/clips/{id}`: read the licence verdict, credit line, video facts, renditions and the `watch` URL of one result.
3. `GET /v1/clips/{id}/download?height=1080`: a `302` to the file on the source.

Plus `GET /v1/clips/{id}/credits` for ATTRIBUTION.md, and `POST /v1/sequences` to plan a whole b-roll edit in one call.

No video passes through this server: posters, previews, `watch` URLs and downloads all point at the source's own servers.

## Search

```bash
curl "https://video.shep.bot/v1/search?q=ocean+waves&orientation=portrait&min_resolution=1080&commercial=true&limit=10"
```

| Parameter | Description |
| --- | --- |
| `q` | Free text, written like an editor would: `ocean waves at sunset`, `drone city skyline night`, `rocket launch slow motion`. Resolution (`4k`, `1080p`), orientation (`vertical`, `9:16`, `square`), length (`10s`, `under 30 seconds`, `1-2 min`), frame rate (`60fps`) and style (`timelapse`) words become filters. A single length like `10s` means at least 10 seconds. May be empty when `category` is set (browse). |
| `category` | Comma-separated dot-path categories. A parent matches its children: `nature` matches `nature.ocean` and `nature.sky`. See the `Category` schema for the full list (nature.ocean, nature.sky, city.skyline, aerial, space.earth, space.launch, science, background.abstract, overlay.light, greenscreen, archive.newsreel…). |
| `style` | Comma-separated: `timelapse`, `slow-motion`, `loop`, `animation`, `visualization`, `black-white`. Ranked first; filtered only with `strict=true`, because sources rarely tag them. |
| `orientation` | `landscape`, `portrait` or `square` (comma-separated for several). |
| `min_resolution` | Minimum short side in pixels: `720`, `1080`, `1440`, `2160` (or `hd`, `fhd`, `4k`). A vertical 1080×1920 clip counts as 1080. |
| `min_duration`, `max_duration` | Length in seconds. |
| `min_fps` | Minimum frame rate, e.g. `50` for slow-motion headroom. |
| `audio` | `true` or `false`: only clips with or without a sound track. |
| `commercial` | `true`: only clips whose licence allows commercial use (verdict `yes` or `yes-with-credit`). Editorial-only clips can still appear: check `license.editorial`. |
| `free` | `true`: exclude paid clips. |
| `downloadable` | `true`: only clips with direct file links. |
| `strict` | `true`: drop clips whose orientation, resolution, length, fps or audio is unknown when you filter on it (by default they are kept, ranked lower). |
| `providers` | Comma-separated source ids from `/v1/providers`, e.g. `nasa,wikimediacommons`. |
| `limit` | Max results, 1–100 (default 24). |
| `offset` | Per-source offset for the next page (e.g. `24`). |

The response (shortened):

```json
{
  "query": "ocean waves",
  "filters": { "orientations": ["portrait"], "minResolution": 1080, "commercialOnly": true },
  "results": [
    {
      "id": "nasa:GSFC_20161212_Tidal_m12450_Magnetic",
      "provider": "nasa",
      "title": "Ocean Tides and Magnetic Fields",
      "url": "https://images.nasa.gov/details/GSFC_20161212_Tidal_m12450_Magnetic",
      "category": "nature.ocean",
      "orientation": "landscape",
      "width": 1920, "height": 1080, "fps": 29.97, "durationSec": 53, "hasAudio": true, "year": 2016,
      "posterUrl": "https://images-assets.nasa.gov/video/…/…~large.jpg",
      "previewUrl": "https://images-assets.nasa.gov/video/…/…~preview.mp4",
      "previewType": "video/mp4",
      "license": {
        "id": "LicenseRef-NASA-Media", "name": "NASA media (public domain in the US)",
        "attributionRequired": true, "editorial": true, "assertedBy": "source",
        "verdict": "yes-with-credit",
        "note": "Generally not copyrighted in the US; credit NASA. Do not imply NASA endorses you…"
      },
      "attribution": "“Ocean Tides and Magnetic Fields” by NASA GSFC (…) (NASA Image and Video Library), https://images.nasa.gov/details/…",
      "downloadable": true
    }
  ],
  "providers": [
    { "provider": "nasa", "name": "NASA Image and Video Library", "status": "ok", "count": 6, "tookMs": 412 },
    { "provider": "pexels", "name": "Pexels", "status": "link", "count": 0, "searchUrl": "https://www.pexels.com/search/videos/ocean%20waves/" }
  ]
}
```

`posterUrl` and `previewUrl` are meant for `<img>` and `<video>` tags in a browser: they load straight from the source. Some results have no `previewUrl` (Internet Archive search results, until their file list is read) or no `posterUrl` (some NASA visualisation pages).

## Licence verdicts

Every `license` has a `verdict` that answers one question: can this go into a commercial video (an ad, a monetised channel, a client project)?

| `verdict` | Meaning |
| --- | --- |
| `yes` | Commercial use OK, no credit required (CC0, public domain). |
| `yes-with-credit` | Commercial use OK with a credit line: use `attribution` (CC BY, NASA media). |
| `restricted` | Conditions that usually rule out a normal project (share-alike). |
| `clearance-required` | Paid stock, or footage that needs releases per use. |
| `check-terms` | Unclear: no licence stated, uploader-asserted, or possibly third-party footage. |
| `no` | Non-commercial or no-derivatives only. |

`license.editorial: true` means people, insignia or brands appear without releases: fine for news, documentary and education, not for advertising. `license.assertedBy` says who stated the licence: `source` (the site records it per item), `site` (one licence for the whole site) or `uploader` (an unverified claim; such licences are never better than `check-terms`). More in [Video licences explained](/docs/licences).

## Clip details

```bash
curl "https://video.shep.bot/v1/clips/nasa%3AGSFC_20161212_Tidal_m12450_Magnetic"
```

Ids contain `:` and sometimes spaces or slashes: URL-encode them. Returns the clip plus:

- `files[]`: every file the source offers, each with `url`, `filename`, `format` (`mp4`, `webm`, `ogv`, `mov`, `jpg`…), `mime`, `role` (`original`, `rendition`, `preview`, `poster`, `captions`), `width`, `height`, `fps`, `codec` and `sizeBytes` when known.
- `watch`: `{ url, type, width, height }`, the file a browser should play (a browser-playable container close to 720p). Put it in a `<video>` tag; it streams from the source.
- `shareUrl`: a link that opens the clip on the website (`/search?clip=<id>`), which unfurls with its own preview card.

## Choose files

```bash
curl "https://video.shep.bot/v1/clips/<id>/files?height=1080&format=mp4"
```

The file a download would pick: with `height`, the smallest file whose short side reaches it (a 1080p rendition rather than a 4K master), else the biggest below it; `format` prefers a container, `role` a kind of file. Returns `totalBytes`, the licence and the credit line. `all=true` returns every file.

## Download

```bash
curl -L -o clip.mp4 "https://video.shep.bot/v1/clips/<id>/download?height=1080"
```

Always a `302` redirect to the chosen file on the source's CDN (so use `-L`), with `X-License` and `X-Attribution` headers. The same `height`, `format` and `role` parameters as `/files` choose the file. Clips without direct files answer `409` with the clip's `url`.

## Credits

```bash
curl "https://video.shep.bot/v1/clips/<id>/credits"               # ATTRIBUTION.md
curl "https://video.shep.bot/v1/clips/<id>/credits?format=json"   # credits.json
curl -o credits.zip "https://video.shep.bot/v1/clips/<id>/credits?format=zip"
```

The zip holds `ATTRIBUTION.md` and `credits.json` only, never the video.

## Plan a sequence

```bash
curl -X POST "https://video.shep.bot/v1/sequences" -H "content-type: application/json" \
  -d '{"shots":["city skyline at night (4s)","coffee pour close-up (3s)","people walking in the rain"],"orientation":"portrait","fps":30,"totalDuration":15,"name":"promo"}'
```

`shots` is a list, or text with one shot per line ("(3s)" at the end sets a shot's length; the others share `totalDuration`, or get 4 s each). Optional: `orientation` or `width`/`height`, `fps` (default 30), `commercialOnly` (default `true`), `providers`, `alternatives` (0–5, default 3), `name`. Up to 24 shots.

The response is `{ plan, exports }`. `plan.shots[]` has, per shot, `index`, `description`, `durationSec`, `inSec` (the in-point; long archive films skip their opening), `clip`, `file` (the rendition the exports use), `alternatives` and a `note` when the pick is shorter, smaller or a different shape. `plan.commercialSafe` is true when every pick is `yes` or `yes-with-credit`. `exports` holds the text of `timeline.otio`, `concat.sh`, `remotion.json`, `ATTRIBUTION.md` and `credits.json`. The [sequence builder](/sequence) is a page on top of this endpoint.

## List sources

```bash
curl "https://video.shep.bot/v1/providers"
```

## Usage statistics and source health

```bash
curl "https://video.shep.bot/v1/stats"
```

Aggregate usage (searches by surface, clip views, downloads, MCP tool calls, top clients and categories) for the last 24 hours and 7 days, plus each source's success rate and p50/p95 latency. The same data is on the [statistics](/stats) page. `GET /v1/catalog` returns the daily count of what each source holds.

## Examples

### JavaScript / TypeScript

```ts
const base = "https://video.shep.bot";
const res = await fetch(`${base}/v1/search?` + new URLSearchParams({ q: "clouds timelapse", min_resolution: "1080", commercial: "true" }));
const { results } = await res.json();
const pick = results.find((c) => c.downloadable && !c.license?.editorial);
console.log(pick.title, pick.license.verdict, pick.attribution ?? "no credit needed");

// Play it in the page, straight from the source
const details = await (await fetch(`${base}/v1/clips/${encodeURIComponent(pick.id)}`)).json();
const video = Object.assign(document.createElement("video"), { src: details.watch.url, poster: pick.posterUrl, controls: true, playsInline: true });
document.body.append(video);
```

### Python

```python
import requests

base = "https://video.shep.bot"
r = requests.get(f"{base}/v1/search", params={"q": "rocket launch", "min_resolution": "1080", "commercial": "true"})
clip = next(c for c in r.json()["results"] if c["downloadable"])

# The download endpoint redirects to the file on the source; requests follows it.
with requests.get(f"{base}/v1/clips/{requests.utils.quote(clip['id'], safe='')}/download", params={"height": 1080}, stream=True) as dl:
    dl.raise_for_status()
    with open("launch.mp4", "wb") as f:
        for chunk in dl.iter_content(1 << 20):
            f.write(chunk)
print(clip.get("attribution", "no credit needed"))
```

### ffmpeg

```bash
# A 5-second cut from the 1080p rendition, read straight from the source (ffmpeg follows the redirect)
ffmpeg -ss 2 -i "https://video.shep.bot/v1/clips/<id>/download?height=1080" -t 5 -c:v libx264 -crf 18 -an cut.mp4
```

## Errors

Errors are JSON: `{ "error": "message" }`.

| Status | Meaning |
| --- | --- |
| `400` | Bad parameter (e.g. an unknown category or an unreadable `min_resolution`) or unknown source id. |
| `401` | API key required (self-hosted servers with `VIDEO_SERVER_API_KEY` only). |
| `404` | Unknown clip, or no file matches the height/format/role. |
| `409` | The source has no direct downloads for this clip; use the returned `url`. |
| `429` | Rate limit exceeded; wait `Retry-After` seconds. |
| `502` | The source site failed. |

## Authentication (self-hosted)

The public server is open. If you run your own with `VIDEO_SERVER_API_KEY`, send the key as `Authorization: Bearer <key>` or `x-api-key: <key>`. Keys are accepted in headers only, never as a URL parameter, so they stay out of logs, browser history and `Referer` headers.

## Rate limits and versioning

The public server allows 120 requests per minute per client. Every response carries `RateLimit-Policy` and `RateLimit` headers (plus `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset`); going over returns `429` with `Retry-After`. The API is versioned in the path (`/v1`), only grows additively within a version, and announces deprecations with `Deprecation` and `Sunset` headers at least 90 days ahead. Details: [Versioning, deprecation & rate limits](/docs/api/versioning).

## Fair use

Cache results on your side for repeated queries, keep requests to a human pace, and respect each clip's licence and each source's terms. Don't use the API to mirror a source's catalogue. The server already caches source responses for a few minutes and deduplicates identical in-flight requests. Video Assets Server is a free, non-commercial service and does not re-host or resell video.
