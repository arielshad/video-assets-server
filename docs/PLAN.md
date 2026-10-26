# video-assets-server: plan to production

> **Status (2026-10-26):** plan only. Nothing is built yet.

**Goal:** search many stock-video sites at once and download the clip you pick. The clips are
b-roll, backgrounds, drone shots, overlays, green screen and archive footage, used by video
editors, content creators and AI agents that make videos (Remotion, ffmpeg, editors driven over
MCP). It should work the way [3d-asset-server](https://github.com/arielshad/3d-asset-server)
(3d.shep.bot) and [sound-server](https://github.com/arielshad/sound-server) (sound.shep.bot) do:
an HTTP API, an MCP server, a CLI and a web UI. It also gets the same production setup: a
`*.shep.bot` domain, ArgoCD deploy, a Grafana dashboard, Loki query logs, Umami analytics, a
public `/stats` page and the daily automation.

Research behind this plan (checked 2026-10-26):

| File | What it covers |
|---|---|
| [`research/sources.md`](research/sources.md) | About 30 video sources, live-checked from a cloud IP: API, auth, rate limits, licence, terms (hotlinking, AI use, aggregators), catalogue size, recommendation |
| §8 below | How 3d.shep.bot and sound.shep.bot are deployed and measured, file by file, and the exact copy for video |

---

## 1. Decisions in one screen

1. **Copy sound-server, not 3d-asset-server.**
   - sound-server is itself a copy of 3d-asset-server. It already carries the fixes that copy made (sound-server `docs/PLAN.md` §4):
     - downloads streamed with an idle timeout
     - SSRF re-check after DNS lookup and after every redirect
     - API key compared in constant time
     - `X-Forwarded-For` trusted from the edge only
     - `media-src` in the CSP
     - opt-in telemetry
     - secrets re-read from files, so a key added in Infisical works without a restart
     - Infisical ExternalSecret, and de-duplication across sites
   - Strip the audio parts: analysis, CLAP, MIDI, kits, the sound map and `wavchunks`.
   - The shared core package that both sibling plans mention is still "later". A third copy makes that case stronger, but it should not block this launch (§9).
2. **New data model: a clip is not an asset or a sample.** A clip has these fields:
   - orientation: landscape, portrait or square
   - width × height, fps and duration
   - whether it has an audio track, an alpha channel, or loops
   - a category (nature, city, people, aerial, abstract/background, overlay/VFX, green screen, archive…)
   - a list of **renditions** (one MP4 per resolution) and a preview (poster image plus a small MP4)
3. **The cluster never carries video bytes by default.** This is the main difference from the siblings.
   - 3d and sound stream zips through the pod. Video files are 10–1000× bigger, and the cluster is one home box behind Caddy.
   - `/v1/clips/:id/download` answers with a **302 to the chosen rendition on the source's CDN**. 3d-asset-server already does this for single files.
   - Thumbnails and preview videos load in the browser straight from the source CDN.
   - The pod proxies only what must be proxied (a source that needs a header), with a size cap.
   - Zips never include video. A "credits bundle" endpoint returns only `ATTRIBUTION.md` and `credits.json`.
   - MCP `download_video` writes files only in local (stdio/CLI) mode. On the hosted server it returns the direct URL and the credits.
4. **Licence-first, commercial-safe by default for agents.** Every result gets the sound-server verdict (`yes | yes-with-credit | restricted | clearance-required | check-terms | no`), plus two video flags:
   - `editorial`: news footage, or identifiable people, brands or landmarks without a release
   - `uploaderAsserted`: Internet Archive and Wikimedia, where the uploader states the licence

   Every download writes `ATTRIBUTION.md` and `credits.json`.
5. **Stateless in v1**, like 3d-asset-server: in-memory cache only, and no PVC until v2 adds embeddings.
6. **Node 22, ffmpeg/ffprobe in the image** (Alpine package, as in sound-server).
   - `ffprobe` reads only the container header over an HTTP range request. That fills in duration, fps, codec and audio track when a source omits them.
   - No server-side transcoding.
7. **The difference from a stock site's own search is the agent workflow.** The equivalent of sound-server's `build_kit` is `build_sequence`:
   - Input: a script or shot list (e.g. "30 s vertical reel: sunrise city skyline, coffee pour close-up, people walking in rain").
   - It picks one clip per shot, with matching orientation, minimum resolution and fps, and a duration that covers the shot.
   - It downloads the clips (locally) and writes the edit files listed in §5.

---

## 2. Sources

Tiers as in the siblings: **api**, **scrape**, **link** (a deep link to the site's own search),
**static** (a curated catalogue indexed from a manifest). Full table with terms and URLs:
[`research/sources.md`](research/sources.md).

### v1 launch set (6 searchable + about 12 link-only)

| # | Source | Tier | Best for | Downloads | Licence verdict |
|---|---|---|---|---|---|
| 1 | **Pixabay** | api (free key) | General b-roll, backgrounds, 4K; native minimum-size and category filters | Direct MP4 at 4 sizes (tiny → 4K) | Pixabay Content License: `yes`, no credit needed (we still show the source) |
| 2 | **Pexels** | api (key; **new keys are paused**) | Best-quality modern b-roll, vertical clips | Direct MP4 sd/hd/4K with fps | Pexels License: `yes`; the API requires a visible Pexels link and creator credit |
| 3 | **Wikimedia Commons** | api (no key, contact UA) | Nature, science, history, 415k files | WebM VP9 240p–2160p + JPG poster (not MP4) | Per file: CC0/PD `yes`, CC-BY `yes-with-credit`, CC-BY-SA `restricted`; `uploaderAsserted` |
| 4 | **Internet Archive** | api (no key) | Public-domain films, Prelinger archive, newsreels, stock_footage | Usually one h.264 MP4 (often 480p) + thumbnails | **PD/CC `licenseurl` only**, labelled `uploaderAsserted`; Prelinger PD |
| 5 | **NASA Image and Video Library** | api (no key) | Space, launches, Earth from orbit, about 8.8k videos | MP4 orig/large/medium/small/preview | `yes-with-credit` (credit NASA); `editorial` for insignia and people; no implied endorsement |
| 6 | **NASA SVS** | api (no key) | 4K data visualisations, motion backgrounds (Earth, Sun, Moon) | MP4/frames, often 4K | Public domain, `yes-with-credit` |

**Link-only at launch.** These need a paid plan, a partner contract or a key we can't get, or
their terms forbid automated access or aggregation. Each still appears in every search as a link
to the same query on its own site: Shutterstock, Adobe Stock, Getty/iStock, Storyblocks, Pond5
(including its public-domain set), Envato Elements, Magnific (ex-Freepik, which now hosts
Videvo and Mazwai), **Mixkit** (terms 9.4–9.10 ban aggregation, bots and framing; sound-server
made Mixkit link-only for the same reason), Videezy, ActionVFX, FootageCrate and Dareful.

**v1.1 candidates:**
- Coverr: a free key at 50 req/hr. Its terms require a logo link and ban "competing" services, so check with them first. It also runs its own MCP server.
- Europeana: free key, restricted to `reusability=open` items that have a direct MP4 (about 13k).
- Library of Congress: 20 req/min, with a 1 h block if exceeded.
- Vecteezy: a free tier of 500 downloads/month.
- ESA footage through its Commons mirrors.

**Skipped:**
- Openverse has no video.
- Life of Vids appears dead.
- NOAA video is on YouTube/Vimeo.
- LottieFiles is vector animation, not video; it could become a separate "animation" type later.

**Rules carried over from the siblings:**
- One or two requests per search, and nothing fetched per result inside `search`.
- Honour robots.txt and terms. A source whose terms forbid automated access is link-only, even when scraping would work.
- Never mirror or re-host clips. Download from the source on the user's behalf.
- Send a descriptive User-Agent with contact details everywhere (Wikimedia allows 10 req/min without one and 200 with one). Back off on 429s.
- **Pexels and Pixabay: API only.** Their websites answer 403 to cloud IPs anyway. Their census uses the `total` field of a search, never a crawl. Pixabay responses are cached for 24 h, as its API terms require.
- Never offer bulk or "download everything" modes. Pixabay's API "is made for real human requests", and Pexels and Pixabay ban automated collection for machine learning.

---

## 3. Data model (replaces `src/core/types.ts`)

```ts
export type Orientation = "landscape" | "portrait" | "square";

/** Dot-path category, e.g. "nature.ocean", "city.timelapse", "people.business", "aerial.drone",
 *  "background.abstract", "overlay.light-leak", "overlay.particles", "greenscreen", "archive.newsreel". */
export type Category = (typeof CATEGORIES)[number];

export type CommercialVerdict =
  | "yes" | "yes-with-credit" | "restricted" | "clearance-required" | "check-terms" | "no";

export interface License {          // same as sound-server, plus `editorial`
  id: string;                       // SPDX where it exists (CC0-1.0, CC-BY-4.0…), else LicenseRef-pexels, LicenseRef-pixabay…
  name: string;
  url?: string;
  commercialUse?: boolean;
  attributionRequired?: boolean;
  shareAlike?: boolean;
  redistribution?: boolean;         // can the clip itself be passed on? almost always false
  editorial?: boolean;              // people, brands or news without releases: not for ads
  assertedBy: "source" | "site" | "uploader";
  verdict: CommercialVerdict;
  attribution?: string;             // ready-to-paste credit line
}

export interface Rendition {
  url: string;                      // direct file URL on the source CDN
  width: number;
  height: number;
  fps?: number;
  codec?: string;                   // h264, hevc, vp9, prores…
  container: string;                // mp4, webm, mov (Commons is WebM, never assume MP4)
  mime: string;
  sizeBytes?: number;
  quality?: "sd" | "hd" | "fhd" | "uhd";
  requiresAuth?: boolean;
  headers?: Record<string, string>;
}

export interface Clip {
  id: string;                       // `${provider}:${nativeId}`
  provider: string;
  nativeId: string;
  title: string;
  description?: string;
  url: string;                      // page on the source site
  author?: string;
  authorUrl?: string;
  tags: string[];
  category?: Category;
  orientation?: Orientation;
  width?: number;                   // best rendition
  height?: number;
  fps?: number;
  durationSec?: number;
  hasAudio?: boolean;
  hasAlpha?: boolean;               // overlays: ProRes 4444 / VP9 alpha
  loopable?: boolean;
  posterUrl?: string;               // still image
  previewUrl?: string;              // small muted MP4 for hover-play
  renditions?: Rendition[];         // filled by getClip; search may return only the best one
  license?: License;
  price?: { free: boolean; amount?: number; currency?: string };
  requiresAccount?: boolean;
  downloadable: boolean;
  createdAt?: string;
  score?: number;
}

export interface ClipQuery {
  query: string;                    // "4k vertical drone ocean sunset 10s" is parsed into the filters below
  categories?: Category[];
  orientation?: Orientation;
  minHeight?: number;               // 720 / 1080 / 2160
  duration?: { min?: number; max?: number };
  fps?: { min?: number };
  hasAlpha?: boolean;
  withoutPeople?: boolean;          // keyword-based in v1
  commercialOnly?: boolean;         // agent default: true
  freeOnly?: boolean;
  limit: number;
  offset?: number;
}
```

The `Provider` interface (`search`, `getAsset` → `getClip`, `buildSearchUrl`, `census`,
`isEnabled`) and `HttpClient` stay as they are. Each provider declares which filters it handles
natively (Pexels handles orientation and size; Pixabay handles minimum width and height).
Duration and the rest are filtered locally. The service applies the rest
locally, and each site's status line says which filters that site couldn't apply.

---

## 4. What we take from sound-server

| Keep (copy, rename) | Adapt | Remove / write new |
|---|---|---|
| `core/http.ts`, `census.ts`, `analytics.ts`, `stats.ts`, `network.ts`, `secrets.ts`, `telemetry.ts` (opt-in) | `core/types.ts` → the model above | Audio: `analyze.ts`, `wavchunks.ts`, `embeddings.ts`, `similar.ts`, `soundmap.ts`, `kit.ts`, `midi.ts`, `notes.ts`, `instrument.ts`, `classify.ts` audio rules |
| `api/ratelimit.ts`, `negotiate.ts`, `site.ts`, `og.ts`, `mcp/attribution.ts` | `core/service.ts`: new filters; ranking boosts for orientation, resolution and duration fit | All 26 providers, their fixtures and collections (Wikimedia Commons, Internet Archive and Mixkit become video versions) |
| `core/licence.ts`, `credits.ts`, `credits-file.ts` (verdicts and credit text) | `core/download.ts`: rendition picker (closest ≥ requested height, h264 MP4 first); redirect, never zip video | **new** `core/probe.ts`: ffprobe over an HTTP range request for missing metadata |
| `providers/link.ts`, `linked.ts`, `test/helpers.ts`, fakes | `core/query.ts`: parse "4k", "vertical", "10s", "60fps", "slow motion", "no people" | **new** `core/sequence.ts`: `build_sequence` and the timeline exports |
| Dockerfile (default Alpine stage only), CI, release, census, collection and discovery workflows, prompts and gates | `api/app.ts`, `openapi.ts`, `mcp/server.ts`, `cli.ts`: tool names, params, docs | **new** OG card: poster frame plus duration and resolution badge |
| `deploy/` (minus `pvc.yaml`, with `strategy: RollingUpdate` back) | `web/`: same shell; a grid with hover-play instead of waveform rows | |

---

## 5. Agent surface (MCP, HTTP API, CLI)

**MCP tools:**

| Tool | What it does |
|---|---|
| `search_videos` | Free text plus filters. Each result has orientation, resolution, fps, duration, licence verdict, poster and preview URLs. Each site gets a status line. |
| `get_video` | Full detail and every rendition. Missing metadata is filled in by ffprobe (cached). |
| `download_video` | Local mode: writes the chosen rendition to `VIDEO_DOWNLOAD_DIR/<category>/`, plus ATTRIBUTION.md and credits.json. Hosted mode: returns the direct URL and the credits. |
| `build_sequence` | Shot list plus target format (e.g. 1080×1920, 30 fps, 30 s), with `commercialOnly`. Picks one clip per shot and writes the edit files below. |
| `list_sources` | Same as the siblings. |
| `find_similar` (v2) | Image embeddings of poster frames (SigLIP/CLIP). |

`build_sequence` writes these files:
- `timeline.otio` (OpenTimelineIO, which opens in DaVinci Resolve, Premiere and Kdenlive)
- `timeline.fcpxml`
- `concat.sh` (ffmpeg: trim, scale or crop, then concat)
- `remotion.json`, the clip list for a Remotion `<Series>`
- credits

**HTTP API** (`/v1`):
- `/v1/search` and `/v1/clips/:id`.
- `/v1/clips/:id/download?height=1080`: a 302 to the source rendition.
- `/v1/clips/:id/credits`: ATTRIBUTION.md, credits.json, or a zip of both.
- `/v1/sources`, `/v1/stats`, `/v1/catalog`.
- `POST /v1/sequences`: returns the edit files. The URLs in them point at the sources.

**CLI:**
- `video-assets-server search "drone ocean sunset" --vertical --min-height 2160 --commercial`
- `video-assets-server sequence shots.txt --size 1080x1920 --fps 30`

**Agent files:** copied from the siblings (AGENTS.md, llms.txt, SKILL.md, a Markdown copy of every
docs page). They gain a "licensing for video" section:
- report the verdict
- never present `editorial` clips as cleared for ads
- people and brands in frame need releases

---

## 6. Web UI

- Reuse the sibling Astro + React + Tailwind + shadcn/ui shell, layouts, docs pages and `/stats`.
- **Search page:**
  - Responsive grid of poster frames. Hover or focus plays the muted preview (`preload="none"`, with one preview playing at a time to keep page weight down).
  - Chips for orientation, minimum resolution (HD / Full HD / 4K), duration range and category.
  - A "commercial-safe" switch and a "no people" switch.
  - Verdict badges.
- **Detail sheet:**
  - The player.
  - A rendition picker (resolution, fps, size).
  - The licence explanation and a credit line to copy.
  - curl, ffmpeg and agent snippets.
- **Collections/SEO hubs** come from the same daily census and weekly drafting jobs. Examples: "free 4K drone footage", "free vertical videos for Reels/TikTok", "free green screen", "free ocean b-roll", "free light leaks", "public-domain newsreels".

---

## 7. Milestones

Each milestone ends with green CI and something running.

| # | Milestone | Done when |
|---|---|---|
| **M0** | **Scaffold** (≈1 day). Copy sound-server and rename everything: package `video-assets-server`, env prefix `VIDEO_SERVER_*`, metric prefix `video_server_`, image `ghcr.io/arielshad/video-assets-server`, domain `video.shep.bot`. Remove the audio modules and all providers except one link provider. | `npm test`, build and typecheck pass; `serve` shows an empty search page; the Docker image builds. |
| **M1** | **Core model + API sources:** new types, query parser, licence verdicts with `editorial`, ranking. Pixabay, Wikimedia Commons, NASA, Internet Archive (and Pexels if a key exists). Offline fixture tests per source; live tests behind `LIVE=1`. | `search_videos "drone ocean"` returns ranked results with verdicts and renditions from at least 3 sources. |
| **M2** | **Download path:** rendition picker, 302 download, credits endpoint, ffprobe over range requests, size-capped proxy for header-gated sources, local MCP download. | A 4K Pixabay clip, a Wikimedia WebM and an Internet Archive MP4 download end to end with credits, with no video bytes through the pod. |
| **M3** | **Remaining v1 sources** (NASA SVS) and the link-only set, plus `integrations/registry.json`. | Every source has fixture tests; `npm run test:live` is green from the cluster's network. |
| **M4** | **`build_sequence`** with OTIO, FCPXML, ffmpeg and Remotion exports. | An agent turns a 5-shot list into a vertical reel that renders with `concat.sh`. |
| **M5** | **Web UI:** grid, hover-play, detail sheet, docs, agent files, OpenAPI, collections. | Lighthouse ≥ 90 with previews lazy; works at phone width. |
| **M6** | **Production:** the checklist in §8, done in both repos. | video.shep.bot serves search, MCP and downloads; it appears in Grafana, Umami and `/stats`. |
| **M7** | **Automation:** daily census, collection drafting and review, daily source discovery (prompts adapted to video sources and the licence rules). | First automated collection merged. |

**v2:**
- Poster-frame embeddings (SigLIP via `@huggingface/transformers`, in the `ml` image variant sound-server already has). These give find-similar, text-to-video re-ranking, cross-site de-duplication (Pexels and Pixabay share many uploaders) and a "no people" detector.
- Shot-boundary detection for long archive films, so search finds a single shot inside them.

---

## 8. Deploy, domain and visibility: same as 3d and sound

How the siblings run today:
- **App repo:** each app repo owns its Kubernetes manifests in `deploy/`.
- **CI:** builds `ghcr.io/arielshad/<repo>:sha-<commit>` on every push to `main` and commits the tag into `deploy/kustomization.yaml`. That commit is the deploy.
- **ArgoCD:** in `shep-ai/shep-infra`, it syncs `deploy/`.
- **Domain:** DNS is the `*.shep.bot` wildcard. The edge Caddy issues the TLS cert on demand because an Ingress declares the host (`infra/edge-tls-ask`). Adding a domain needs nothing outside git.
- **Logs:** pod logs reach Loki through Alloy for every namespace, with no per-app config.

### 8.1 In this repo (`deploy/`, copied from sound-server)

| File | Video values |
|---|---|
| `deployment.yaml` | Namespace `video-assets-server`, app label `video-assets-server`, `strategy: RollingUpdate` (no PVC in v1). Env: `PORT=8787`, `VIDEO_SERVER_PUBLIC_URL=https://video.shep.bot`, `VIDEO_SERVER_USER_AGENT="video-assets-server/0.1 (+https://video.shep.bot; https://github.com/arielshad/video-assets-server)"`, `METRICS_PORT=9464`, `PROMETHEUS_URL=http://kube-prometheus-stack-prometheus.monitoring.svc:9090`, `UMAMI_WEBSITE_ID=<new uuid>`, `UMAMI_HOST=https://stats.shep.bot`, `VIDEO_SERVER_TELEMETRY=0`, `VIDEO_SERVER_SECRETS_DIR=/var/run/secrets/video-assets-server`. Resources as 3d (25m / 128Mi request, 1 CPU / 512Mi limit). |
| `service.yaml` | Ports `http` 80 → 8787 and `metrics` 9464. |
| `ingress.yaml` | Host `video.shep.bot`, class nginx. Timeouts can drop to 60 s, since the pod does not stream video. |
| `servicemonitor.yaml` | `/metrics` on port `metrics`, every 30 s. |
| `externalsecret.yaml` | `video-assets-server-env` from the `infisical` ClusterSecretStore: `/video-assets-server/PEXELS_API_KEY`, `/video-assets-server/PIXABAY_API_KEY` (plus any other v1 keys). The pod starts without them, and those sources show as disabled. |
| `kustomization.yaml` | Namespace, the resources above, `images: ghcr.io/arielshad/video-assets-server`, with `newTag` pinned by CI. |

Metrics use the sibling names with the `video_server_` prefix: searches, search duration and
results, per-source requests and latency, clip views, downloads by kind, MCP connects, tool calls,
new callers, HTTP requests and page views. The search event log line (query, filters, result
count) goes to Loki for the top-queries and zero-result tables. Two new bounded labels:
`orientation` and `min_height` on searches, and `quality` on downloads.

### 8.2 In `shep-ai/shep-infra` (one PR, merged after this repo's `main` has a real image tag)

| File | Change |
|---|---|
| `bootstrap/apps/89-video-assets-server.yaml` (**new**) | ArgoCD Application: repo `https://github.com/arielshad/video-assets-server`, path `deploy`, `targetRevision: main`, namespace `video-assets-server`, `CreateNamespace=true`, `ServerSideApply=true`, automated prune and self-heal. Copy of `94-sound-server.yaml`. 92–99 are taken, so it uses 89. |
| `projects/apps.yaml` | Add `https://github.com/arielshad/video-assets-server` to `sourceRepos`. |
| `apps/umami/manifests/website-video-shep-bot-job.yaml` (**new**) | PostSync Job that inserts website `<new uuid>` "Video Assets Server" / `video.shep.bot`, owned like the other sites. Copy of the sound job. |
| `apps/umami/manifests/websites-configmap.yaml` | Add the line for the new site **in the same PR**. Without it the Job never runs: that is how sound.shep.bot got "Website not found." |
| `infra/kube-prometheus-stack/manifests/dashboard-video-assets-server.yaml` (**new**) | Grafana dashboard "Video Assets Server" (uid `video-assets-server`, tags `video-assets-server`, `product`). Copy of the sound dashboard with `sound_server_` → `video_server_` and namespace `sound-server` → `video-assets-server`. Swap the audio panels for: searches by orientation, by minimum resolution, downloads by quality, and redirect vs proxied downloads. |
| `README.md` | Add a `video.shep.bot` row to the hostname table, and mention it on the `stats.shep.bot` row. |
| (optional) `PrometheusRule` | Per-source error-rate alert. Neither sibling has one yet; this could be added for all three. |

### 8.3 Outside git (manual, once)

- **Infisical** (vault.shep.bot, project `shep-infra`, env `prod`): create the folder `/video-assets-server` with `PEXELS_API_KEY` and `PIXABAY_API_KEY`.
- **GitHub repo secrets** for the automation workflows:
  - `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` (discovery and collection drafting)
  - the same API keys (census and live tests)
- **GHCR:** the package becomes public after the first push (or keep `ghcr-pull`, as the siblings do).
- **npm:** the first `npx video-assets-server` release uses `NPM_TOKEN`; switch to trusted publishing after that.

### 8.4 Visibility (the same public surface as the siblings)

- Public repo, Apache-2.0, README with banner and architecture SVGs, `context7.json`.
- `claude mcp add --transport http video https://video.shep.bot/mcp`, plus the agent files and the OpenAPI spec at `/openapi.json`.
- The public `/stats` page reads 24h and 7d totals from Prometheus. Catalogue counts and history come from the daily census.
- SEO/GEO: collections, guides, glossary and FAQ, following the siblings' `SEO-GEO-AUDIT.md`.
- New, optional: a "sister sites" link between 3d, sound and video in all three footers. None of them link to each other today.

---

## 9. Risks and open questions

| Risk | Plan |
|---|---|
| **"Competing service" clauses.** Pexels and Pixabay (both Canva-owned; terms updated 2026-10-20) forbid using content "to replicate a similar or competing service", and Pexels adds "may not copy core functionality". | Present the site as a search tool that sends people to the sources, not a stock site. API only, a visible source link and creator credit on every result, no catalogue copies, short caches. Ask Pexels and Pixabay before launch, as sound-server planned for Freesound. If either says no, it becomes link-only and v1 still has four keyless sources. |
| **Pexels has paused new API keys.** | Use an existing key if you have one; otherwise launch without Pexels (link-only) and apply when issuance reopens. |
| **Bandwidth on the home cluster.** One 4K download can be hundreds of MB. | The hosted server never streams video (§1.3). Downloads are 302s, previews load from the source CDNs, and the only proxy is size-capped. Grafana tracks redirect vs proxied downloads, so a mistake shows up. |
| **Hotlinking.** Pixabay allows embedding video but not permanent image hotlinking. Coverr URLs are signed. | Posters are only shown inside search results (temporary display is allowed), with no long-lived embeds. Collection pages store ids and fetch fresh URLs at build time. |
| **AI use.** Pixabay says the API is "for real human requests"; Pexels and Pixabay ban collection for machine learning; NASA forbids "according to NASA" wording. | Every agent call is a person's request through their agent. No bulk download, no training sets. The agent files tell agents to credit NASA without that phrase. |
| **Rights reliability.** Internet Archive and Commons rights are uploader-asserted. Public-domain footage can still show trademarks and identifiable people. | `uploaderAsserted` and `editorial` flags; such items are never `yes` for ads; a "verify before commercial use" note; agents default to `commercialOnly`; a takedown contact on `/contact`. |
| **Formats.** Commons is WebM VP9 and Internet Archive is often 480p. | `container`/`mime` per rendition; the picker prefers h264 MP4 and says when only WebM exists. `concat.sh` re-encodes, so mixed inputs still work. |
| **Scraped and API changes.** | As in the siblings: the failure stays in that site's status line, live tests run nightly from the cluster, and the census flags drops. |
| **Cloud-IP blocks.** The Pexels and Pixabay websites, LoC search, Pond5 and ActionVFX block cloud IPs. | All v1 sources answered from a cloud IP through their APIs. Live tests run from the cluster before M6. |

**Questions for you:**
1. **Domain:** `video.shep.bot` (my default, matching `3d.` and `sound.`)?
2. **Bandwidth:** do you agree the hosted server should never stream video (302 to the source only)? That is my default.
3. **API keys:** do you already have a Pexels key (new keys are paused)? Will you create a Pixabay key? Both go in Infisical `/video-assets-server`.
4. **Terms check:** should I draft the emails to Pexels and Pixabay describing the service before launch?
5. **Code sharing:** copy sound-server now and extract a shared core after launch (my recommendation), or extract the core first, now that there are three copies?
