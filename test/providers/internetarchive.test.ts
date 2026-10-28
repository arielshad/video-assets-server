import { describe, expect, it } from "vitest";
import { LICENCE_CLAUSE, buildQuery, filesOf, internetarchive, licenseFor, runtimeSeconds } from "../../src/providers/internetarchive.js";
import { fixtureCtx } from "../helpers.js";

describe("internetarchive", () => {
  it("searches only CC0, public-domain and CC BY(-SA) movies, without TV captures or YouTube mirrors", () => {
    const q = buildQuery({ query: "city streets", styles: ["black-white"] });
    expect(q).toContain("(title:city OR subject:city OR description:city) AND (title:streets OR subject:streets OR description:streets)");
    expect(q).toContain(LICENCE_CLAUSE);
    expect(q).toContain("NOT collection:(tvnews");
    expect(q).toContain("deemphasize");
    expect(q).toContain('(color:"B&W" OR color:bw)');
  });

  it("maps search results in one request with poster, length, year and a capped licence", async () => {
    const ctx = fixtureCtx([["advancedsearch.php", "internetarchive/search.json"]]);
    const res = await internetarchive.search({ query: "city", limit: 5 }, ctx);
    expect(ctx.fetch.requests).toHaveLength(1);
    expect(res.total).toBe(11000);
    const sf = res.clips.find((c) => c.nativeId === "SanFrancisco1955CinemascopeFilm")!;
    expect(sf).toMatchObject({
      url: "https://archive.org/details/SanFrancisco1955CinemascopeFilm",
      posterUrl: "https://archive.org/services/img/SanFrancisco1955CinemascopeFilm",
      durationSec: 1288,
      hasAudio: true,
      downloadable: true,
    });
    expect(sf.category.startsWith("archive")).toBe(true);
    // Prelinger states it; still editorial (historic footage).
    expect(sf.license).toMatchObject({ id: "CC-BY-SA-3.0", verdict: "restricted", assertedBy: "source", editorial: true });
    const noir = res.clips.find((c) => c.nativeId === "impact")!;
    expect(noir).toMatchObject({ year: 1949, styles: ["black-white"], durationSec: 6577 });
    // An uploader's public-domain mark is never "yes".
    expect(noir.license).toMatchObject({ id: "CC-PDM-1.0", verdict: "check-terms", assertedBy: "uploader" });
    expect(res.clips.every((c) => c.previewUrl === undefined)).toBe(true);
  });

  it("lists an item's videos with sizes, a playable preview and the poster", async () => {
    const clip = await internetarchive.getClip!("ConeyIsl1940", fixtureCtx([["/metadata/ConeyIsl1940", "internetarchive/ConeyIsl1940.json"]]));
    expect(clip).toMatchObject({ title: "Coney Island", year: 1940, durationSec: 559, styles: ["black-white"], width: 640, height: 480 });
    expect(clip!.license).toMatchObject({ verdict: "yes", assertedBy: "source", editorial: true });
    const files = clip!.files.map((f) => [f.role, f.filename, f.format]);
    expect(files).toContainEqual(["original", "ConeyIsl1940.mpeg", "mpeg"]);
    expect(files).toContainEqual(["rendition", "ConeyIsl1940.mp4", "mp4"]);
    expect(files).toContainEqual(["preview", "ConeyIsl1940_512kb.mp4", "mp4"]);
    expect(files.at(-1)).toEqual(["poster", "poster.jpg", "jpg"]);
    expect(clip!.files.some((f) => f.filename.includes(".thumbs/"))).toBe(false);
    expect(clip!.previewUrl).toBe("https://archive.org/download/ConeyIsl1940/ConeyIsl1940_512kb.mp4");
  });

  it("reads runtimes and licences", () => {
    expect(runtimeSeconds("30:49")).toBe(1849);
    expect(runtimeSeconds("1:02:03")).toBe(3723);
    expect(runtimeSeconds("12 minutes")).toBe(720);
    expect(runtimeSeconds("45 sec")).toBe(45);
    expect(runtimeSeconds("about an hour")).toBeUndefined();
    expect(licenseFor({ licenseurl: "https://creativecommons.org/licenses/by/4.0/", collection: ["opensource_movies"] }).verdict).toBe("check-terms");
    expect(licenseFor({ licenseurl: "http://creativecommons.org/licenses/publicdomain/", collection: "prelinger" }).verdict).toBe("yes");
    expect(filesOf("x", [{ name: "sub/inner.mp4", source: "original" }]).filter((f) => f.role !== "poster")).toEqual([]);
  });

  it("builds a search link and counts PD/CC movies", async () => {
    expect(internetarchive.buildSearchUrl({ query: "newsreel", limit: 1 })).toBe("https://archive.org/search?query=newsreel+AND+mediatype%3Amovies");
    const c = await internetarchive.census!(fixtureCtx([["advancedsearch.php", "internetarchive/search.json"]]));
    expect(c.total).toBe(11000);
  });
});
