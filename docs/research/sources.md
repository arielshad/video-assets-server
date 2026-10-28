# Video sources (checked 2026-10-26)

Checked by web fetch and by calling each API directly from a cloud IP on 2026-10-26. Counts are
live API results unless marked "est." (estimated).

## Free and open sources

| Source | API | Auth | Rate limit | Licence and terms | MP4s at several sizes, plus previews? | Video count | Rec |
|---|---|---|---|---|---|---|---|
| **Pexels** pexels.com | Official REST (`/v1/videos/search`) | Free key. **The API page says new key issuance is paused.** | 200/hr and 20k/mo. Unlimited free if you meet the terms | Pexels License, no attribution needed. The API requires a prominent link to Pexels and credit to the creator. Rules: "may not copy core functionality", no "competing service", no stock redistribution | Yes: `video_files[]` (sd/hd/4K with width, height, fps, link), `image`, `video_pictures` | No official count; est. hundreds of thousands | **v1 if a key is already on hand**, otherwise later |
| **Pixabay** pixabay.com | Official REST (`/api/videos/`) | Free key | 100 per 60 s. Responses **must be cached 24 h** | Content License, no attribution needed. The API asks you to show the source. "API is made for real human requests"; "systematic mass downloads not allowed"; videos may be embedded (images must not be hotlinked permanently) | Yes: large (4K) / medium / small / tiny, each with url, size and thumbnail | est. hundreds of thousands | **v1** |
| **Wikimedia Commons** | MediaWiki API (`prop=videoinfo`, search `filetype:video`) | None. Needs a User-Agent with contact info | **10/min without a proper UA, 200/min with one** (new 2026 limits) | Per file: CC0, PD, CC-BY, CC-BY-SA. `extmetadata` gives the licence and whether attribution is required | Partly: WebM VP9 transcodes 240p–2160p plus a 360p mpeg4 .mov, and a JPG poster. Not true MP4 | 415k files | **v1** (keyless) |
| **Internet Archive** | `advancedsearch.php` plus `/metadata/{id}`; `rows=0` gives a free census | None | Unpublished; "be reasonable" | Rights are self-declared per item (`licenseurl`). Filtered: about 448k public-domain and 1.19M CC "movies" items. Older terms say "scholarship and research purposes" | Usually one h.264 MP4 derivative (often 480p), plus thumbnails and an animated GIF | 17.5M movies items; 10.5k Prelinger; 2k stock_footage | **v1**, filtered to PD/CC collections |
| **NASA Image and Video Library** | `images-api.nasa.gov` (official) | None | Not stated | Generally not copyrighted in the US. Must credit NASA; no implied endorsement; insignia restricted; some third-party copyrighted items. **AI clause:** AI products may not say "according to NASA" | Yes: `collection.json` lists orig/large/medium/small/mobile/preview MP4s plus JPG thumbnails | about 8.8k (sum of centers) | **v1** |
| **NASA SVS** svs.gsfc.nasa.gov | `/api/search`, `/api/{id}` (JSON) | None | Not stated | Public domain, credit NASA | MP4/frames per media group (often 4K) | 10.6k pages | **v1/later** (great motion backgrounds) |
| **Coverr** | Official REST **plus an official MCP server** (mcp.coverr.co) | Free key (account) | **Demo key 50/hr.** Production (2,000/hr) needs a paid Pro plan | Free licence, no attribution for downloads, but **the API requires a clickable Coverr logo**. **Licence bans AI training and "similar or competing" services.** API free only if "you don't charge… or use the videos for commercial use" | One MP4 at max res plus a preview MP4 (token URLs), poster, thumbnail | est. low thousands | **later** (key, low quota, conflicting terms) |
| **Europeana** | Search API (`qf=TYPE:VIDEO`, `reusability=open`) | Free key (demo key `api2demo`) | Not stated | Per-item rights statements (PDM, CC) | Mixed: some direct MP4 (Open Beelden), many YouTube/Vimeo or provider pages. Thumbnail API available | 389k video records; **13k "open"** | **later** |
| **Library of Congress** | loc.gov JSON (`/film-and-videos/?fo=json`) | None | **20/min, 1 h block if exceeded.** `/search/` hit a **Cloudflare challenge** from the cloud IP; collection endpoints worked | Per item, mostly PD or no known restrictions | MP4 on some items; many not online | 81k | **later** |
| **Openverse** | — | — | — | — | **Images and audio only (no `/video/` endpoint)** | 0 | skip |
| **Mixkit** (Envato) | None (HTML; `assets.mixkit.co/videos/{id}/{id}-360.mp4`) | — | — | Free licence, no attribution needed. **Terms 9.4 ban aggregating or collating items "on a stock basis"; 9.5 bans "competitive product"; 9.6 bans framing or linking; 9.10 bans bots and mass download** | Scrape only | est. thousands | **skip / plain link-out** |
| **Videvo, Mazwai** | — | — | — | **Both domains now 301 to freepik.com/videos** (Freepik, rebranded **Magnific**) | — | — | skip (see Magnific under paid) |
| **Life of Vids** | — | — | — | Site resets the connection or returns 503 | — | — | skip (appears dead) |
| **Dareful** | None (HTML) | — | — | CC BY 4.0, link back to Dareful | Downloads are Mux HLS `.m3u8`, not MP4 | 242 | skip / maybe a curated link-out |
| **Videezy** (Eezy) | None | — | — | Terms ban bots, scrapers and aggregation; free clips need attribution | — | — | skip |
| **Vecteezy** (Eezy) | Official API | Free tier (500 downloads/mo); pay-as-you-go $0.002/call + $1/download | Not stated | Free licence needs attribution and caps video budgets at $1k. **Licensing agreement bans "data training" use** | API includes video | 50M+ assets total | **later** (free tier) |
| **Pond5 public-domain collection** | No public API; pond5.com/free returned **403 (CloudFront)** | — | — | PD, but publicity rights still apply | — | 10k clips at its 2015 launch | link-out only |
| **ESA** | No API | — | — | CC BY-SA 3.0 IGO only where labelled, **but ESA's general Terms forbid commercial use without written authorisation** | — | — | later via Commons mirrors |
| **NOAA** | No unified video API (mostly YouTube/Vimeo) | — | — | PD (US government) | — | — | skip |

## Paid and partner sources (link-out only)

| Source | API status 2026 |
|---|---|
| Shutterstock (owns Pond5 and Envato) | Free test account: 100 calls/hr with **0 videos**. Video needs a paid Unlimited or Pay-Per-Use plan |
| Adobe Stock | **Since Nov 2024 the API is limited to Stock-for-Enterprise customers or approved affiliates and prerelease partners** |
| Getty / iStock | Key only through an account rep, tied to a licence agreement |
| Storyblocks | "Test for free", then a quoted API client contract |
| Magnific (ex-Freepik, includes Videvo and Mazwai) | `/v1/videos` stock API; paid plans capped at 100 stock downloads/day |
| Pond5, Envato Elements | No public search API; deep links only |

## Motion graphics and animation

- **ActionVFX** has a free practice-footage library (account needed, about 10 downloads/day as of 2023). Its site returned **429 (Vercel) from the cloud IP**. Link-out only.
- **FootageCrate / ProductionCrate** have a free tier with daily download caps and attribution on some assets, and no API. Link-out only.
- **LottieFiles** has an official MCP server at `mcp.lottiefiles.com` that uses your account sign-in and its GraphQL API. Lottie is vector JSON, not video, so it fits better as a separate "animation" asset type, later.

## Cloud-IP blocks seen

- The **Pexels and Pixabay websites return Cloudflare 403**, but their **APIs answer normally** (401/400 without a key). Use the APIs only; never scrape them.
- The LoC `/search/` endpoint gives a Cloudflare challenge; Pond5 returns 403; ActionVFX returns 429.
- Wikimedia gives 429 unless the User-Agent includes contact info.
- IA, NASA, SVS, Europeana, Mixkit and Vecteezy all returned 200.

## Main legal and terms risks

- **"Competing service" clauses.** Pexels and Pixabay terms (both "last updated Oct 20, 2026", Canva-owned) forbid using content "to replicate a similar or competing service", and Pexels adds "may not copy core functionality". Coverr and Mixkit have similar clauses, and Mixkit explicitly bans aggregation.
  - Mitigation: search via the API only, show attribution and link back, don't bulk-mirror or cache the catalogues, and don't present the site as a stock site.
- **AI clauses.**
  - Pexels and Pixabay ban scraping and automated collection "for machine learning purposes". Their API docs have no AI-agent clause. Pixabay says the "API is made for real human requests". An MCP server searching on behalf of a user is arguably fine, but agent-driven bulk download is a grey area.
  - Coverr and Vecteezy ban AI training and dataset use.
  - NASA forbids "according to NASA" wording in AI outputs.
  - **Practical rule:** never offer bulk or census-download modes for these sources. Their census comes from search `total` fields only.
- **Hotlinking and caching.** Pixabay requires 24 h caching and allows embedding video but not permanent image hotlinking. Pexels requires a visible Pexels link. Coverr URLs are token-signed and require its logo.
- **Rights reliability.** IA and Europeana rights are self-declared by uploaders or institutions. PD footage can still carry trademark and personality rights, as with NASA insignia and identifiable people. Show a per-item licence and a "verify" disclaimer.
- **Format.** Commons serves WebM rather than MP4, and Dareful serves HLS. The normalised schema needs `mime` and `container` fields rather than assuming MP4.

## Links

- Pexels: [API docs](https://www.pexels.com/api/documentation/), [API page (key issuance paused)](https://www.pexels.com/api/), [ToS](https://www.pexels.com/terms-of-service/), [licence](https://www.pexels.com/license/)
- Pixabay: [API docs](https://pixabay.com/api/docs/), [ToS](https://pixabay.com/service/terms/), [licence](https://pixabay.com/service/license-summary/)
- Coverr: [API docs and MCP](https://api.coverr.co/docs/), [licence](https://coverr.co/license)
- Mixkit: [terms](https://mixkit.co/terms/)
- Vecteezy: [API](https://www.vecteezy.com/developers), [licensing agreement](https://www.vecteezy.com/licensing-agreement)
- Videezy: [terms](https://www.videezy.com/terms)
- Wikimedia: [rate limits](https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits)
- NASA: [media usage guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/)
- Library of Congress: [API limits](https://www.loc.gov/apis/json-and-yaml/working-within-limits/)
- ESA: [Terms and Conditions](https://www.esa.int/ESA_Multimedia/Terms_and_Conditions)
- Adobe Stock: [API getting started](https://developer.adobe.com/stock/docs/getting-started/)
- Shutterstock: [API pricing](https://www.shutterstock.com/api/pricing)
- Getty: [developer docs](https://developers.gettyimages.com/docs)
- Magnific (ex-Freepik): [Videos API](https://docs.magnific.com/api-reference/videos/videos-api), [pricing](https://docs.magnific.com/pricing)
- LottieFiles: [MCP docs](https://docs.lottiefiles.com/en/platform/mcp)
- ActionVFX: [free practice footage library (CG Channel)](https://www.cgchannel.com/2023/10/actionvfx-launches-free-practice-footage-library/)
