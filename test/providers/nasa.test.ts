import { describe, expect, it } from "vitest";
import { exifSeconds, filesFrom, licenseFor, nasa, videoFacts } from "../../src/providers/nasa.js";
import { fixtureCtx } from "../helpers.js";

const ID = "KSC-20230507-MH-RLS01-TROPICS_Rocket_Launch-Rocket_Lab-WON_3330130";

const routes: [string | RegExp, string][] = [
  [/images-api\.nasa\.gov\/search\?nasa_id=/, "nasa/item.json"],
  ["images-api.nasa.gov/search", "nasa/search.json"],
  [`${ID}/collection.json`, "nasa/collection.json"],
  [`${ID}/metadata.json`, "nasa/metadata.json"],
];

describe("nasa", () => {
  it("maps search results with posters, a preview and NASA's licence, in one request", async () => {
    const ctx = fixtureCtx(routes);
    const res = await nasa.search({ query: "rocket launch", limit: 4 }, ctx);
    expect(ctx.fetch.requests).toHaveLength(1);
    expect(ctx.fetch.requests[0]).toContain("media_type=video");
    expect(res.total).toBe(1449);
    expect(res.clips).toHaveLength(4);
    const first = res.clips[0]!;
    expect(first).toMatchObject({
      id: `nasa:${ID}`,
      title: "TROPICS Rocket Launch",
      category: "space.launch",
      url: `https://images.nasa.gov/details/${ID}`,
      posterUrl: `https://images-assets.nasa.gov/video/${ID}/${ID}~large.jpg`,
      previewUrl: `https://images-assets.nasa.gov/video/${ID}/${ID}~preview.mp4`,
      previewType: "video/mp4",
      year: 2023,
      downloadable: true,
    });
    // Footage credited to an outside company may be theirs: check the terms.
    expect(first.license).toMatchObject({ verdict: "check-terms", attributionRequired: true });
    expect(first.license?.note).toContain("Rocket Lab");
    // NASA's own footage: public domain with credit, editorial (people, insignia).
    const own = res.clips.find((c) => c.nativeId === "GSFC_20160909_M12368_OSIRIS_launch")!;
    expect(own.license).toMatchObject({ id: "LicenseRef-NASA-Media", verdict: "yes-with-credit", editorial: true });
    expect(own.attribution).toContain("NASA Image and Video Library");
  });

  it("knows NASA staff from outside organisations in credits", () => {
    expect(licenseFor({ nasa_id: "a", photographer: "NASA/Kim Shiflett" }).verdict).toBe("yes-with-credit");
    expect(licenseFor({ nasa_id: "a", secondary_creator: "Ryan Fitzgibbons, Chris Meaney" }).verdict).toBe("yes-with-credit");
    expect(licenseFor({ nasa_id: "a", photographer: "NASA/SpaceX" }).verdict).toBe("check-terms");
    expect(licenseFor({ nasa_id: "a", photographer: "United Launch Alliance" }).verdict).toBe("check-terms");
    expect(licenseFor({ nasa_id: "a", secondary_creator: "Courtesy of ESA" }).verdict).toBe("check-terms");
  });

  it("returns every rendition with sizes scaled from the master, plus captions and the poster", async () => {
    const clip = await nasa.getClip!(ID, fixtureCtx(routes));
    expect(clip).toMatchObject({ width: 1920, height: 1080, fps: 50, durationSec: 30, hasAudio: true, orientation: "landscape" });
    const videos = clip!.files.filter((f) => f.role !== "poster" && f.role !== "captions");
    expect(videos.map((f) => [f.role, f.filename.replace(`${ID}~`, ""), f.height])).toEqual([
      ["original", "orig.mp4", 1080],
      ["rendition", "large.mp4", 1080],
      ["rendition", "medium.mp4", 720],
      ["rendition", "small.mp4", 360],
      ["preview", "preview.mp4", 270],
      ["preview", "mobile.mp4", 180],
    ]);
    expect(videos.every((f) => f.url.startsWith("https://images-assets.nasa.gov/"))).toBe(true);
    expect(clip!.files.some((f) => f.role === "captions" && f.format === "vtt")).toBe(true);
    expect(await nasa.getClip!("missing", fixtureCtx([["images-api.nasa.gov", "nasa/empty.json"]]))).toBeNull();
  });

  it("reads exiftool facts", () => {
    expect(exifSeconds("0:01:05")).toBe(65);
    expect(exifSeconds("12.5 s")).toBe(12.5);
    expect(videoFacts({ "QuickTime:ImageWidth": 1080, "QuickTime:ImageHeight": 1920, "QuickTime:VideoFrameRate": 29.97 })).toMatchObject({ width: 1080, height: 1920, fps: 29.97, hasAudio: undefined });
    // A vertical master scales its renditions the same way.
    const files = filesFrom("v", ["http://x/v~orig.mp4", "http://x/v~medium.mp4"], { width: 1080, height: 1920 });
    expect(files.map((f) => [f.url, f.width, f.height])).toEqual([
      ["https://x/v~orig.mp4", 1080, 1920],
      ["https://x/v~medium.mp4", 720, 1280],
    ]);
  });

  it("builds a search link and counts the library", async () => {
    expect(nasa.buildSearchUrl({ query: "apollo 11", limit: 10 })).toBe("https://images.nasa.gov/search?q=apollo+11&media=video");
    const c = await nasa.census!(fixtureCtx([["images-api.nasa.gov", "nasa/search.json"]]));
    expect(c).toMatchObject({ total: 1449, atLeast: true, free: 1449 });
  });
});
