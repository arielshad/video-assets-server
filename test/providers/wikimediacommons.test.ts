import { describe, expect, it } from "vitest";
import { commonsNativeId, commonsTitle, searchText, wikimediacommons } from "../../src/providers/wikimediacommons.js";
import { fixtureCtx } from "../helpers.js";

describe("wikimediacommons", () => {
  it("maps search results in one request, in Commons' order, with poster, preview and licence", async () => {
    const ctx = fixtureCtx([["generator=search", "wikimediacommons/search.json"]]);
    const res = await wikimediacommons.search({ query: "ocean waves", limit: 4 }, ctx);
    expect(ctx.fetch.requests).toHaveLength(1);
    expect(ctx.fetch.requests[0]).toContain("gsrsearch=ocean+waves+filetype%3Avideo");
    expect(res.clips.map((c) => c.nativeId)).toEqual([
      "Ocean_surface_waves_09.ogv",
      "Ocean_surface_waves_06.ogv",
      "Ocean_surface_waves_08.ogv",
      "Ocean_surface_waves_07.ogv",
    ]);
    const c = res.clips[0]!;
    expect(c).toMatchObject({
      id: "wikimediacommons:Ocean_surface_waves_09.ogv",
      title: "Ocean surface waves 09",
      category: "nature.ocean",
      width: 1920,
      height: 1080,
      orientation: "landscape",
      durationSec: 11.04,
      hasAudio: false, // Theora without a sound codec
      previewType: "video/webm",
      formats: ["ogv", "webm", "mov"],
      license: { id: "CC0-1.0", verdict: "yes" },
      downloadable: true,
    });
    expect(c.previewUrl).toMatch(/\.360p\.vp9\.webm$|\.480p\.vp9\.webm$|\.240p\.vp9\.webm$/);
    expect(c.posterUrl).toMatch(/^https:\/\/upload\.wikimedia\.org\/.*\.jpg$|^https:\/\/thumb\.wikimedia\.org\/.*\.jpg$/);
    expect(c.posterUrl).not.toContain("utm_");
    expect(c.author).not.toMatch(/^User:/);
    // Search results don't carry files; getClip does.
    expect(c).not.toHaveProperty("files");
  });

  it("passes a minimum resolution to Commons as a frame-size filter", () => {
    expect(searchText({ query: "drone", minResolution: 2160 })).toBe("drone filetype:video filew:>2094 fileh:>2094");
    expect(searchText({ query: "" })).toBe("filetype:video");
  });

  it("returns the original and every transcode with its real container", async () => {
    const clip = await wikimediacommons.getClip!("Ocean_in_Sommaroy.webm", fixtureCtx([["titles=File%3AOcean+in+Sommaroy.webm", "wikimediacommons/file.json"]]));
    expect(clip).toMatchObject({ title: "Ocean in Sommaroy", width: 1920, height: 1080, license: { verdict: "yes" } });
    const roles = clip!.files.map((f) => [f.role, f.format, f.height]);
    expect(roles[0]).toEqual(["original", "webm", 1080]);
    expect(roles).toContainEqual(["rendition", "mov", 360]);
    expect(roles.at(-1)).toEqual(["poster", "jpg", undefined]);
    expect(clip!.files.every((f) => !f.url.includes("utm_"))).toBe(true);
  });

  it("reports 'search too busy' as an error instead of an empty result", async () => {
    await expect(wikimediacommons.search({ query: "ocean", limit: 4 }, fixtureCtx([["generator=search", "wikimediacommons/search-busy.json"]]))).rejects.toThrow(/too busy/);
  });

  it("normalises titles and builds a search link", () => {
    expect(commonsTitle("File:Ocean_waves.webm")).toBe("Ocean waves.webm");
    expect(commonsNativeId("File:Ocean waves.webm")).toBe("Ocean_waves.webm");
    expect(wikimediacommons.buildSearchUrl({ query: "waves", limit: 1 })).toBe("https://commons.wikimedia.org/w/index.php?search=waves+filetype%3Avideo&title=Special%3AMediaSearch&type=video");
  });

  it("counts its videos", async () => {
    const c = await wikimediacommons.census!(fixtureCtx([["list=search", "wikimediacommons/totalhits.json"]]));
    expect(c.total).toBe(415642);
  });
});
