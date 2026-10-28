import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { MIN_INDEXABLE, MIN_SOURCES, isIndexable, searchKey as coreSearchKey, selectClips, snapshotCollection, toSnapshotClip, type CollectionSearch, type CollectionSnapshot, type SnapshotClip } from "../src/core/collections.js";
import { setHostResolver, assertPublicHost } from "../src/core/download.js";
import { creativeCommons, license } from "../src/core/licence.js";
import type { SearchResponse } from "../src/core/service.js";
import type { Pricing, Clip } from "../src/core/types.js";
import { makeClip } from "../src/core/util.js";
import { allProviders } from "../src/providers/index.js";
// @ts-expect-error plain .mjs module without type declarations
import { CATEGORIES, readHubs, readSnapshot, readTopics, searchKey, topicErrors } from "../scripts/lib/topics.mjs";
// @ts-expect-error plain .mjs module without type declarations
import { checkPreview, isMediaType, previewChecker } from "../scripts/snapshot-collections.mjs";

const pricing = new Map<string, Pricing>([
  ["commons", "free"],
  ["stock", "freemium"],
  ["paid", "freemium"],
]);

const clip = (provider: string, n: number, over: Partial<Clip> = {}): Clip =>
  makeClip({
    provider,
    nativeId: `${provider}-${n}`,
    title: `Ocean waves ${provider} ${n}`,
    category: "nature.ocean",
    tags: [],
    url: `https://${provider}.example/${n}`,
    posterUrl: `https://cdn.${provider}.example/${n}.jpg`,
    previewUrl: `https://cdn.${provider}.example/${n}.mp4`,
    license: license("CC0-1.0"),
    downloadable: true,
    ...over,
  });

const search: CollectionSearch = { q: "waves", categories: ["nature.ocean"], free: true };

describe("toSnapshotClip", () => {
  it("keeps what a page shows, with the licence verdict and video facts", () => {
    const s = toSnapshotClip(clip("commons", 1, { width: 3840, height: 2160, fps: 30, durationSec: 12, year: 2020, styles: ["timelapse"], description: "the source's copy", license: { ...license("CC0-1.0"), editorial: true } }))!;
    expect(s).toMatchObject({
      id: "commons:commons-1",
      category: "nature.ocean",
      styles: ["timelapse"],
      posterUrl: "https://cdn.commons.example/1.jpg",
      previewUrl: "https://cdn.commons.example/1.mp4",
      previewType: "video/mp4",
      license: { id: "CC0-1.0", verdict: "yes", editorial: true },
      orientation: "landscape",
      width: 3840,
      height: 2160,
      fps: 30,
      durationSec: 12,
      year: 2020,
    });
    expect(s).not.toHaveProperty("description");
  });

  it("drops clips a static page can't show, keeps poster-only or preview-only ones", () => {
    expect(toSnapshotClip(clip("commons", 1, { previewUrl: undefined, posterUrl: undefined }))).toBeUndefined();
    expect(toSnapshotClip(clip("commons", 1, { previewUrl: "http://insecure.example/1.mp4", posterUrl: "http://insecure.example/1.jpg" }))).toBeUndefined();
    expect(toSnapshotClip(clip("commons", 1, { previewUrl: undefined }))?.posterUrl).toBe("https://cdn.commons.example/1.jpg");
    const previewOnly = toSnapshotClip(clip("commons", 1, { posterUrl: "http://insecure.example/1.jpg" }))!;
    expect(previewOnly.posterUrl).toBeUndefined();
    expect(previewOnly.previewUrl).toBe("https://cdn.commons.example/1.mp4");
  });
});

describe("selectClips", () => {
  it("keeps relevant, free clips with media, once per id and title", () => {
    const picked = selectClips(
      [
        clip("commons", 1),
        clip("commons", 1), // same id again
        clip("commons", 2, { title: "Ocean waves commons 1" }), // same title on the same source
        clip("commons", 3, { title: "Busy street at night", category: "city.street" }), // not about waves
        clip("commons", 4, { previewUrl: undefined, posterUrl: undefined }),
        clip("commons", 5, { previewUrl: "http://insecure.example/5.mp4", posterUrl: undefined }),
        clip("stock", 1, { price: { free: false } }),
        clip("stock", 2), // freemium source, price unknown: not provably free
        clip("stock", 3, { price: { free: true } }),
      ],
      { search, pricing },
    );
    expect(picked.map((a) => a.id)).toEqual(["commons:commons-1", "stock:stock-3"]);
  });

  it("counts the category as a word, and ignores near misses that only start like the query", () => {
    const sky = selectClips([clip("commons", 1, { title: "Golden hour", category: "nature.sky" }), clip("commons", 2, { title: "Sky over the bay" }), clip("commons", 3, { title: "Harbour", category: "city" })], {
      search: { q: "sky" },
      pricing,
    });
    expect(sky.map((a) => a.title)).toEqual(["Golden hour", "Sky over the bay"]);
    const sea = selectClips([clip("commons", 1, { title: "Seattle Downtown", category: "city" }), clip("commons", 2, { title: "Sea Stacks" })], { search: { q: "sea" }, pricing });
    expect(sea.map((a) => a.title)).toEqual(["Sea Stacks"]);
  });

  it("keeps only commercial-safe licences when the search asks for them", () => {
    const picked = selectClips(
      [clip("commons", 1), clip("commons", 2, { license: creativeCommons({ nc: true }) }), clip("commons", 3, { license: creativeCommons({}) }), clip("commons", 4, { license: undefined })],
      { search: { ...search, commercial: true }, pricing },
    );
    expect(picked.map((a) => a.license?.verdict)).toEqual(["yes", "yes-with-credit"]);
  });

  it("drops excluded title phrases and ids", () => {
    const picked = selectClips([clip("commons", 1, { title: "Ocean Waves Lecture Slides" }), clip("commons", 2), clip("commons", 3)], {
      search: { ...search, exclude: ["lecture slides", "commons:commons-3"] },
      pricing,
    });
    expect(picked.map((a) => a.id)).toEqual(["commons:commons-2"]);
  });

  it("caps one source at 40% of the page", () => {
    const fresh = [...Array.from({ length: 30 }, (_, i) => clip("commons", i)), ...Array.from({ length: 5 }, (_, i) => clip("stock", i, { price: { free: true } }))];
    const picked = selectClips(fresh, { search, pricing, max: 20 });
    expect(picked.filter((a) => a.provider === "commons")).toHaveLength(8);
    expect(picked.filter((a) => a.provider === "stock")).toHaveLength(5);
  });

  it("keeps previous clips in place, fills gaps with new ones and keeps a failed source's clips", () => {
    const prev = selectClips([clip("commons", 1), clip("stock", 1, { price: { free: true } }), clip("commons", 2)], { search, pricing });
    // This run: stock failed, commons 2 is gone, commons 9 is new and ranks first.
    const next = selectClips([clip("commons", 9), clip("commons", 1)], { search, pricing, previous: prev, failed: new Set(["stock"]) });
    expect(next.map((a) => a.id)).toEqual(["commons:commons-1", "stock:stock-1", "commons:commons-9"]);
  });
});

describe("isIndexable", () => {
  const as = (n: number, sources: number) => Array.from({ length: n }, (_, i) => ({ id: `${i}`, provider: `p${i % sources}` }) as SnapshotClip);
  it("needs enough clips from more than one source", () => {
    expect(isIndexable(as(MIN_INDEXABLE, MIN_SOURCES))).toBe(true);
    expect(isIndexable(as(MIN_INDEXABLE - 1, MIN_SOURCES))).toBe(false);
    expect(isIndexable(as(40, 1))).toBe(false);
  });
});

describe("snapshotCollection", () => {
  const response = (results: Clip[], failed: string[] = []): SearchResponse => ({
    query: "waves",
    filters: {},
    results,
    providers: failed.map((provider) => ({ provider, name: provider, status: "error" as const, count: 0, tookMs: 1 })),
  });
  const fresh = Array.from({ length: 3 }, (_, i) => clip("commons", i));

  it("asks the service for the topic's filters", async () => {
    let asked: unknown;
    await snapshotCollection(
      async (req) => ((asked = req), response([])),
      "s",
      { q: "waves", categories: ["nature.ocean"], styles: ["timelapse"], orientations: ["portrait"], minResolution: 1080, free: true, commercial: true, downloadable: true, providers: ["commons"] },
      { pricing },
    );
    expect(asked).toMatchObject({
      query: "waves",
      categories: ["nature.ocean"],
      styles: ["timelapse"],
      orientations: ["portrait"],
      minResolution: 1080,
      freeOnly: true,
      commercialOnly: true,
      downloadableOnly: true,
      providers: ["commons"],
      limit: 100,
    });
  });

  it("moves updatedAt only when the list changes", async () => {
    const first = await snapshotCollection(async () => response(fresh), "free-ocean-footage", search, { pricing, now: new Date("2026-10-01T00:00:00Z") });
    expect(first.changed).toBe(true);
    const again = await snapshotCollection(async () => response(fresh), "free-ocean-footage", search, { pricing, previous: first.snapshot, now: new Date("2026-10-02T00:00:00Z") });
    expect(again.changed).toBe(false);
    expect(again.snapshot.updatedAt).toBe("2026-10-01T00:00:00.000Z");
    const more = await snapshotCollection(async () => response([...fresh, clip("commons", 7)]), "free-ocean-footage", search, { pricing, previous: again.snapshot, now: new Date("2026-10-03T00:00:00Z") });
    expect(more).toMatchObject({ changed: true, added: 1, kept: 3, dropped: 0 });
    expect(more.snapshot.updatedAt).toBe("2026-10-03T00:00:00.000Z");
  });

  it("skips clips whose poster is gone and lets the next one take the slot", async () => {
    const results = Array.from({ length: 4 }, (_, i) => clip(i % 2 ? "commons" : "stock", i, { price: { free: true } }));
    const checked: string[] = [];
    const r = await snapshotCollection(async () => response(results), "s", search, {
      pricing,
      checkMedia: async (url) => {
        checked.push(url);
        return !url.includes("/1.jpg");
      },
    });
    expect(r.snapshot.clips.map((a) => a.id)).toEqual(["stock:stock-0", "stock:stock-2", "commons:commons-3"]);
    expect(r.brokenMedia).toBe(1);
    expect(checked.every((u) => u.endsWith(".jpg"))).toBe(true); // the poster is what a page loads first
    expect(new Set(checked).size).toBe(checked.length); // each URL checked once
    expect(r.snapshot.search).toEqual(search); // broken ids are not saved into the search
  });

  it("starts over when the search itself changes", async () => {
    const previous: CollectionSnapshot = { slug: "s", search: { q: "clouds" }, updatedAt: "2026-01-01T00:00:00.000Z", clips: [{ id: "commons:old" } as SnapshotClip] };
    const r = await snapshotCollection(async () => response(fresh, ["commons"]), "s", search, { pricing, previous });
    expect(r.snapshot.clips.map((a) => a.id)).not.toContain("commons:old");
  });
});

describe("media check (scripts/snapshot-collections.mjs)", () => {
  setHostResolver(async (host) => (host === "evil.example" ? ["10.0.0.5"] : ["93.184.216.34"]));
  type Reply = { status?: number; type?: string; location?: string };
  const fakeFetch = (routes: Record<string, Reply | ((method: string) => Reply)>) => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push(`${init.method} ${url}`);
      const route = routes[url];
      const r = typeof route === "function" ? route(String(init.method)) : route;
      if (!r) throw new Error("network down");
      const headers: Record<string, string> = {};
      if (r.type) headers["content-type"] = r.type;
      if (r.location) headers.location = r.location;
      return new Response(null, { status: r.status ?? 200, headers });
    }) as typeof fetch;
    return { calls, fetchImpl };
  };
  const check = (url: string, f: ReturnType<typeof fakeFetch>) => checkPreview(url, { assertHost: assertPublicHost, fetch: f.fetchImpl, timeoutMs: 1000 }) as Promise<boolean>;

  it("accepts images, video and the generic binary types, refuses pages", () => {
    for (const t of ["image/jpeg", "video/mp4", "video/webm; codecs=vp9", "application/ogg", "application/octet-stream"]) expect(isMediaType(t), t).toBe(true);
    for (const t of ["text/html; charset=utf-8", "audio/mpeg", "application/json"]) expect(isMediaType(t), t).toBe(false);
  });

  it("treats only definite answers as broken", async () => {
    const f = fakeFetch({
      "https://cdn.example/ok.mp3": { type: "video/mp4" },
      "https://cdn.example/gone.mp3": { status: 404 },
      "https://cdn.example/soft404.mp3": { type: "text/html" },
      "https://cdn.example/busy.mp3": { status: 503, type: "text/html" },
    });
    expect(await check("https://cdn.example/ok.mp3", f)).toBe(true);
    expect(await check("https://cdn.example/gone.mp3", f)).toBe(false);
    expect(await check("https://cdn.example/soft404.mp3", f)).toBe(false);
    expect(await check("https://cdn.example/busy.mp3", f)).toBe(true); // flaky CDN: keep
    expect(await check("https://cdn.example/offline.mp3", f)).toBe(true); // network error: keep
  });

  it("falls back to a ranged GET when HEAD is refused", async () => {
    const f = fakeFetch({ "https://cdn.example/a.ogg": (m) => (m === "HEAD" ? { status: 405 } : { status: 206, type: "video/webm" }) });
    expect(await check("https://cdn.example/a.ogg", f)).toBe(true);
    expect(f.calls).toEqual(["HEAD https://cdn.example/a.ogg", "GET https://cdn.example/a.ogg"]);
  });

  it("follows redirects by hand and refuses internal hosts on any hop", async () => {
    const f = fakeFetch({
      "https://cdn.example/r.mp3": { status: 302, location: "https://media.example/r.mp3" },
      "https://media.example/r.mp3": { type: "image/jpeg" },
      "https://cdn.example/bad.mp3": { status: 302, location: "http://169.254.169.254/latest" },
      "https://evil.example/x.mp3": { type: "video/mp4" },
    });
    expect(await check("https://cdn.example/r.mp3", f)).toBe(true);
    expect(await check("https://cdn.example/bad.mp3", f)).toBe(false);
    expect(await check("https://evil.example/x.mp3", f)).toBe(false); // resolves to a private address
    expect(f.calls).not.toContain("HEAD http://169.254.169.254/latest");
    expect(f.calls.some((c) => c.includes("evil.example"))).toBe(false);
  });

  it("checks each URL once", async () => {
    const f = fakeFetch({ "https://cdn.example/ok.mp3": { type: "video/mp4" } });
    const checker = previewChecker({ assertHost: assertPublicHost, fetch: f.fetchImpl, timeoutMs: 1000 }, 2) as (u: string) => Promise<boolean>;
    await Promise.all([checker("https://cdn.example/ok.mp3"), checker("https://cdn.example/ok.mp3")]);
    expect(f.calls).toHaveLength(1);
  });
});

describe("collection topics", () => {
  const topics = readTopics() as { slug: string; data: { search: CollectionSearch; hub: string } }[];
  const hubs = readHubs() as { id: string; title: string; description: string; intro: string; categories?: string[]; orientations?: string[] }[];
  const ctx = { hubs: hubs.map((h) => h.id), slugs: topics.map((t) => t.slug), providers: allProviders.map((p) => p.id) };

  it("has hubs with copy and a valid category scope", () => {
    expect(hubs.length).toBeGreaterThanOrEqual(5);
    for (const h of hubs) {
      expect(h.id, h.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(h.title.length, h.id).toBeLessThanOrEqual(60);
      expect(h.description.length, h.id).toBeGreaterThanOrEqual(110);
      expect(h.description.length, h.id).toBeLessThanOrEqual(160);
      expect(h.intro.length, h.id).toBeGreaterThan(200);
      expect(h.categories?.length || h.orientations?.length, h.id).toBeTruthy();
      for (const c of h.categories ?? []) expect(CATEGORIES, h.id).toContain(c);
    }
  });

  // Topic pages are added by people and by the weekly drafting workflow; the
  // repository may start with none.
  it.each(topics.map((t) => [t.slug, t]))("%s meets the editorial rules", (_, t) => {
    expect(topicErrors(t, ctx)).toEqual([]);
  });

  it("gives every topic its own search, with the same identity the server uses", () => {
    const keys = topics.map((t) => searchKey(t.data.search));
    expect(new Set(keys).size).toBe(keys.length);
    const s: CollectionSearch = { q: " Crashing  Waves ", categories: ["nature.ocean", "nature"], styles: ["slow-motion"], orientations: ["portrait"], minResolution: 1080, free: true, commercial: true, downloadable: true, providers: ["b", "a"] };
    expect(searchKey(s)).toBe(coreSearchKey(s));
  });

  // Only that a snapshot exists: how many clips it holds depends on the live
  // sources (a thin page is noindexed by the site), and the daily refresh must
  // never fail CI. New topics are held to the indexable minimum by the gate.
  it.each(topics.map((t) => [t.slug]))("%s has a snapshot", (slug) => {
    const snap = readSnapshot(slug) as CollectionSnapshot | undefined;
    expect(snap, `run: node scripts/snapshot-collections.mjs ${slug}`).toBeDefined();
    expect(snap!.slug).toBe(slug);
    for (const a of snap!.clips) {
      expect(a.posterUrl ?? a.previewUrl).toMatch(/^https:\/\//);
      expect(a.license?.verdict ?? "check-terms").toBeTruthy();
    }
  });

  it("has no snapshot without a topic", () => {
    const dir = new URL("../web/src/data/collections/", import.meta.url);
    if (!existsSync(dir)) return;
    for (const f of readdirSync(dir)) expect(ctx.slugs, f).toContain(f.replace(/\.json$/, ""));
  });

  it("keeps the website's thresholds in step with the snapshot's", () => {
    for (const file of ["../web/src/lib/collections.ts", "../web/integrations/sitemap-meta.mjs"]) {
      const src = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(src, file).toContain(`MIN_INDEXABLE = ${MIN_INDEXABLE};`);
      expect(src, file).toContain(`MIN_SOURCES = ${MIN_SOURCES};`);
    }
  });
});
