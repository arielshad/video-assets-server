import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createApp } from "../src/api/app.js";
import { OgImages } from "../src/api/og.js";
import { categoryNoun, clipFacts, clipMeta, searchMeta, searchShare, shareableClipId } from "../src/api/search-meta.js";
import { rewriteHead } from "../src/api/site.js";
import { ClipService } from "../src/core/service.js";
import { OG_HEIGHT, OG_WIDTH, clip, clipCard, fetchImage, pageCard, renderPng } from "../src/og/render.js";
import { CITY, OCEAN, brokenProvider, bytesHttp, fakeProvider } from "./fakes.js";

const SITE = fileURLToPath(new URL("./fixtures/site", import.meta.url));
const service = () => new ClipService({ providers: [fakeProvider, brokenProvider], http: bytesHttp(), defaultTimeoutMs: 200 });
const isPng = (b: Uint8Array) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
const meta = (html: string, key: string) => html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`))?.[1];

describe("OG renderer", () => {
  it("renders a 1200×630 PNG card", async () => {
    const png = await renderPng(pageCard({ kicker: "Docs", title: "MCP server for coding agents", subtitle: "Connect Claude Code.", chips: ["MCP"], site: "video.shep.bot" }));
    expect(isPng(png)).toBe(true);
    expect(await sharp(png).metadata()).toMatchObject({ width: OG_WIDTH, height: OG_HEIGHT, format: "png" });
  });

  it("renders clip cards with the poster frame, or a placeholder frame", async () => {
    const card = { title: "Ocean Waves at Sunset", source: "Wikimedia Commons", type: "Ocean & beach", license: "CC0 1.0", verdict: "Commercial use OK", free: true, facts: ["4K", "0:14"], author: "surfer", site: "video.shep.bot" };
    const plain = await renderPng(clipCard(card));
    expect(await sharp(plain).metadata()).toMatchObject({ width: OG_WIDTH, height: OG_HEIGHT, format: "png" });
    const poster = await sharp({ create: { width: 160, height: 90, channels: 3, background: "#3c6" } }).png().toBuffer();
    const withPoster = await renderPng(clipCard({ ...card, image: `data:image/png;base64,${poster.toString("base64")}` }));
    expect(isPng(withPoster)).toBe(true);
    expect(Buffer.compare(plain, withPoster)).not.toBe(0);
    expect(Buffer.compare(plain, await renderPng(clipCard(card)))).toBe(0);
  });

  it("clips long text on a word boundary", () => {
    expect(clip("The quick brown fox jumps over the lazy dog", 20)).toBe("The quick brown…");
    expect(clip("short", 12)).toBe("short");
  });

  it("fetches artwork as JPEG data URIs (any image format) and refuses internal hosts", async () => {
    const webp = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#c33" } }).webp().toBuffer();
    const fetchWebp = (async () => new Response(new Uint8Array(webp), { headers: { "content-type": "image/webp" } })) as typeof fetch;
    const uri = await fetchImage("https://cdn.example/t.webp", { fetch: fetchWebp });
    expect(uri?.startsWith("data:image/jpeg;base64,")).toBe(true);
    const jpeg = Buffer.from(uri!.split(",")[1]!, "base64");
    expect(await sharp(jpeg).metadata()).toMatchObject({ width: 960, height: 540, format: "jpeg" });

    let called = false;
    const spy = (async () => ((called = true), new Response("x"))) as typeof fetch;
    expect(await fetchImage("http://127.0.0.1/x.png", { fetch: spy })).toBeUndefined();
    expect(await fetchImage("http://169.254.169.254/latest", { fetch: spy })).toBeUndefined();
    expect(called).toBe(false);
    // A redirect to an internal host is refused too.
    const redirect = (async (u: string | URL) =>
      String(u).includes("cdn.example") ? new Response(null, { status: 302, headers: { location: "http://10.0.0.5/x.png" } }) : ((called = true), new Response("x"))) as typeof fetch;
    expect(await fetchImage("https://cdn.example/a.png", { fetch: redirect })).toBeUndefined();
    expect(called).toBe(false);
    const html = (async () => new Response("<html>", { headers: { "content-type": "text/html" } })) as typeof fetch;
    expect(await fetchImage("https://cdn.example/a.png", { fetch: html })).toBeUndefined();
  });
});

describe("share metadata", () => {
  it("normalises search share links", () => {
    const s = searchShare(new URLSearchParams("q=  crashing   waves &category=nature.ocean,spaceship&free=true&commercial=true&orientation=portrait&min_resolution=2160&offset=40&providers=nasa,nope"))!;
    expect(s.key).toBe("q=crashing+waves&category=nature.ocean&orientation=portrait&min_resolution=2160&free=true&commercial=true&providers=nasa");
    expect(s).toMatchObject({ kicker: "Search · ocean & beach clips", title: "“crashing waves”" });
    expect(s.chips).toEqual(["4K", "Vertical", "Commercial use OK", "Free only", "NASA Image and Video Library"]);
    expect(searchShare(new URLSearchParams("offset=10"))).toBeUndefined();
    expect(searchShare(new URLSearchParams("min_resolution=huge&q=clouds"))?.key).toBe("q=clouds"); // malformed values are dropped
    expect(searchMeta(new URLSearchParams("q=clouds"))).toMatchObject({ image: "/og/query.png?q=clouds", robots: "noindex, follow" });
  });

  it("names categories with their own nouns", () => {
    expect(categoryNoun("nature.ocean")).toBe("ocean & beach clips");
    expect(categoryNoun("aerial")).toBe("drone shots");
    expect(categoryNoun("archive.newsreel", false)).toBe("newsreel");
    expect(categoryNoun(undefined)).toBe("clips");
  });

  it("validates clip ids against the running providers", () => {
    expect(shareableClipId("fake:ocean", ["fake"])).toBe("fake:ocean");
    expect(shareableClipId("nope:ocean", ["fake"])).toBeUndefined();
    expect(shareableClipId("fake:", ["fake"])).toBeUndefined();
    expect(shareableClipId("ocean", ["fake"])).toBeUndefined();
    expect(shareableClipId(`fake:${"x".repeat(400)}`, ["fake"])).toBeUndefined();
    expect(shareableClipId(undefined, ["fake"])).toBeUndefined();
  });

  it("describes a clip for its share link, with its video facts and licence verdict", () => {
    const m = clipMeta(OCEAN);
    expect(m.title).toBe("Ocean Waves at Sunset: ocean & beach clip · Video Assets Server"); // the source is dropped past 70 characters
    expect(m.description).toContain("Ocean & beach clip “Ocean Waves at Sunset” on fake (4K, 15s, 30 fps, CC0 1.0: commercial use OK, free)");
    expect(m.image).toBe("/og/clip.png?id=fake%3Aocean");
    expect(clipFacts(CITY)).toEqual(["Streets & traffic", "Full HD 1080p", "vertical", "42s", "60 fps"]);
    expect(clipMeta(CITY).description).toContain("CC BY-NC 4.0: non-commercial only");
  });

  it("rewrites image, alt and url tags with escaping", () => {
    const html = '<meta property="og:image" content="a"><meta name="twitter:image" content="a"><meta property="og:image:alt" content="a"><meta name="twitter:image:alt" content="a"><meta property="og:url" content="a"><meta name="twitter:url" content="a">';
    const out = rewriteHead(html, { image: "https://x/og.png?q=a&b", imageAlt: '"quoted"', url: "https://x/search?q=a" });
    expect(meta(out, "og:image")).toBe("https://x/og.png?q=a&amp;b");
    expect(meta(out, "twitter:image")).toBe("https://x/og.png?q=a&amp;b");
    expect(meta(out, "og:image:alt")).toBe("&quot;quoted&quot;");
    expect(meta(out, "twitter:url")).toBe("https://x/search?q=a");
  });
});

describe("OG endpoints and share links", () => {
  const app = createApp(service(), { siteRoot: SITE, publicBaseUrl: "https://video.shep.bot" });

  it("serves search cards, cacheable for a day", async () => {
    const res = await app.request("/og/query.png?q=waves&category=nature.ocean");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(isPng(new Uint8Array(await res.arrayBuffer()))).toBe(true);
    expect((await app.request("/og/query.png")).status).toBe(404);
    const head = await app.request("/og/query.png?q=waves", { method: "HEAD" });
    expect(head.status).toBe(200);
  });

  it("serves clip cards and 404s unknown or malformed ids", async () => {
    const res = await app.request(`/og/clip.png?id=${encodeURIComponent("fake:ocean")}`);
    expect(res.status).toBe(200);
    expect(isPng(new Uint8Array(await res.arrayBuffer()))).toBe(true);
    expect((await app.request("/og/clip.png?id=fake:missing")).status).toBe(404);
    expect((await app.request("/og/clip.png?id=broken:x")).status).toBe(404);
    expect((await app.request("/og/clip.png?id=../../etc")).status).toBe(404);
    expect((await app.request("/og/clip.png")).status).toBe(404);
  });

  it("gives /search?clip= links the clip's title, card and url", async () => {
    const html = await (await app.request("/search?clip=fake%3Aocean", { headers: { accept: "text/html" } })).text();
    expect(html).toContain("<title>Ocean Waves at Sunset: ocean &amp; beach clip · Video Assets Server</title>");
    expect(meta(html, "og:image")).toBe("https://video.shep.bot/og/clip.png?id=fake%3Aocean");
    expect(meta(html, "twitter:image")).toBe("https://video.shep.bot/og/clip.png?id=fake%3Aocean");
    expect(meta(html, "og:url")).toBe("https://video.shep.bot/search?clip=fake%3Aocean");
    expect(meta(html, "robots")).toBe("noindex, follow");
    // Unknown clip: the plain search page.
    const plain = await (await app.request("/search?clip=fake%3Amissing", { headers: { accept: "text/html" } })).text();
    expect(meta(plain, "og:image")).toBe("https://video.shep.bot/og/search.png");
  });

  it("gives search links a query card and their own og:url", async () => {
    const html = await (await app.request("/search?q=waves&offset=20", { headers: { accept: "text/html" } })).text();
    expect(meta(html, "og:image")).toBe("https://video.shep.bot/og/query.png?q=waves");
    expect(meta(html, "og:url")).toBe("https://video.shep.bot/search?q=waves");
    expect(meta(html, "og:image:alt")).toContain("“waves”");
  });

  it("caches cards and renders at most two at once", async () => {
    let active = 0;
    let peak = 0;
    let lookups = 0;
    const slow = {
      ...fakeProvider,
      async getClip(id: string) {
        lookups++;
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 30));
        active--;
        return { ...OCEAN, nativeId: id, id: `fake:${id}`, title: `Waves ${id}`, posterUrl: undefined };
      },
    };
    const og = new OgImages(new ClipService({ providers: [slow], http: bytesHttp() }), { site: "video.shep.bot" });
    const first = og.clip("fake:a");
    expect(og.clip("fake:a")).toBe(first);
    const cards = await Promise.all([first, og.clip("fake:b"), og.clip("fake:c"), og.clip("fake:d")]);
    expect(cards.every((c) => c && isPng(c))).toBe(true);
    expect(peak).toBeLessThanOrEqual(2);
    expect(lookups).toBe(4);
  });

  it("does not keep misses, so a clip that appears later gets its card", async () => {
    let exists = false;
    const flaky = { ...fakeProvider, getClip: async () => (exists ? OCEAN : null) };
    const og = new OgImages(new ClipService({ providers: [flaky], http: bytesHttp() }), { site: "video.shep.bot" });
    expect(await og.clip("fake:ocean")).toBeNull();
    exists = true;
    expect(await og.clip("fake:ocean")).not.toBeNull();
  });

  it("returns a shareUrl with clip details (REST)", async () => {
    const body = (await (await app.request(`/v1/clips/${encodeURIComponent("fake:ocean")}`)).json()) as { shareUrl: string };
    expect(body.shareUrl).toBe("https://video.shep.bot/search?clip=fake%3Aocean");
  });
});
