import { describe, expect, it } from "vitest";
import { classify, wordTokens } from "../src/core/classify.js";
import { asEditorial, attributionLine, creativeCommons, license, parseLicense, royaltyFree } from "../src/core/licence.js";
import { durationMatches, formatDuration, frameSizeFromText, parseQuery } from "../src/core/query.js";
import { makeClip, matchScore, parseClipId } from "../src/core/util.js";
import { orientationOf, resolutionLabel, resolutionTier } from "../src/core/vocab.js";

describe("classify", () => {
  it.each([
    ["Ocean waves crashing on the beach", "nature.ocean"],
    ["Waterfall in the forest", "nature.water"],
    ["Clouds timelapse at sunset", "nature.sky"],
    ["Earth from space: ISS view", "space.earth"],
    ["Falcon 9 rocket launch", "space.launch"],
    ["Total solar eclipse", "space.planets"],
    ["Drone shot over a city skyline", "aerial"],
    ["New York skyline at night", "city.skyline"],
    ["Busy street traffic", "city.street"],
    ["Light leaks overlay", "overlay.light"],
    ["Smoke and fire particles", "overlay.particles"],
    ["Green screen explosion", "greenscreen"],
    ["1950s newsreel: war footage", "archive.newsreel"],
    ["Abstract liquid gradient background", "background.abstract"],
    ["Untitled 0042", "other"],
  ])("%s -> %s", (title, category) => expect(classify({ title }).category).toBe(category));

  it("uses the source's keywords and tags, and lets context cancel an alias", () => {
    expect(classify({ title: "Clip 12", sourceCategories: ["Planets & Moons", "Mars"] }).category).toBe("space.planets");
    expect(classify({ title: "Untitled", tags: ["coral", "reef"] }).category).toBe("nature.ocean");
    expect(classify({ title: "Film grain overlay" }).category).toBe("overlay.film");
  });

  it("finds styles in titles, tags and keywords", () => {
    expect(classify({ title: "City lights time-lapse" }).styles).toEqual(["timelapse"]);
    expect(classify({ title: "Water drop slow motion 240fps" }).styles).toEqual(["slow-motion"]);
    expect(classify({ title: "Coney Island", tags: ["B&W"] }).styles).toEqual(["black-white"]);
    expect(classify({ title: "GPM Launch and Deploy Animation: Launch" }).styles).toEqual(["animation"]);
  });

  it("splits camelCase and digits, keeping b&w", () => {
    expect(wordTokens("EarthFromSpace4K B&W")).toEqual(["earth", "from", "space", "4", "k", "b&w"]);
  });
});

describe("query parsing", () => {
  it("pulls resolution, orientation, length and fps out of the query", () => {
    expect(parseQuery("4k vertical drone ocean 10s")).toMatchObject({
      query: "drone ocean",
      minResolution: 2160,
      orientations: ["portrait"],
      duration: { min: 10 },
      hints: ["nature.ocean", "aerial"],
    });
    expect(parseQuery("city traffic 9:16 1080p 60fps")).toMatchObject({ query: "city traffic", orientations: ["portrait"], minResolution: 1080, minFps: 60 });
    expect(parseQuery("clouds timelapse under 30 seconds")).toMatchObject({ query: "clouds timelapse", duration: { max: 30 }, styles: ["timelapse"] });
    expect(parseQuery("newsreel 1-2 min")).toMatchObject({ query: "newsreel", duration: { min: 60, max: 120 } });
    expect(parseQuery("free stock footage of waves in full hd")).toMatchObject({ query: "waves", minResolution: 1080 });
    expect(parseQuery("square loop background")).toMatchObject({ orientations: ["square"], styles: ["loop"] });
    expect(parseQuery("ocean")).toEqual({ query: "ocean", hints: ["nature.ocean"] });
  });

  it("leaves numbers that are not video facts alone", () => {
    expect(parseQuery("apollo 11").query).toBe("apollo 11");
    expect(parseQuery("1960s cars").minResolution).toBeUndefined();
  });

  it("formats and matches lengths, reads frame sizes from titles", () => {
    expect(durationMatches(12, { min: 10 })).toBe(true);
    expect(durationMatches(12, { min: 10, max: 11 })).toBe(false);
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(7384)).toBe("2:03:04");
    expect(formatDuration(9.6)).toBe("10s");
    expect(frameSizeFromText("Launch 1920x1080 ProRes")).toEqual({ width: 1920, height: 1080 });
    expect(frameSizeFromText("Room 101")).toBeUndefined();
  });

  it("knows orientation and resolution tiers by the short side", () => {
    expect(orientationOf(1080, 1920)).toBe("portrait");
    expect(orientationOf(1080, 1060)).toBe("square");
    expect(resolutionTier(1080, 1920)).toBe("fhd");
    expect(resolutionTier(1920, 1050)).toBe("fhd");
    expect(resolutionTier(3840, 2160)).toBe("uhd");
    expect(resolutionLabel(640, 360)).toBe("SD");
  });
});

describe("licences", () => {
  it.each([
    ["http://creativecommons.org/publicdomain/zero/1.0/", "CC0-1.0", "yes"],
    ["CC0", "CC0-1.0", "yes"],
    ["https://creativecommons.org/licenses/by/4.0/", "CC-BY-4.0", "yes-with-credit"],
    ["Attribution NonCommercial", "CC-BY-NC-4.0", "no"],
    ["CC BY-SA 3.0", "CC-BY-SA-3.0", "restricted"],
    ["https://creativecommons.org/licenses/by-nd/4.0/", "CC-BY-ND-4.0", "no"],
    ["Public domain", "CC-PDM-1.0", "yes"],
    ["http://creativecommons.org/licenses/publicdomain/", "CC-PDM-1.0", "yes"],
    ["Personal Use Only", "LicenseRef-Personal-Use-Only", "no"],
    ["All rights reserved", "LicenseRef-All-Rights-Reserved", "no"],
  ])("%s -> %s (%s)", (input, id, verdict) => {
    const l = parseLicense(input)!;
    expect(l.id).toBe(id);
    expect(l.verdict).toBe(verdict);
  });

  it("never treats an uploader's claim as cleared", () => {
    expect(license("CC0-1.0", "uploader").verdict).toBe("check-terms");
    expect(creativeCommons({}, "4.0", "uploader").verdict).toBe("check-terms");
  });

  it("knows NASA's terms: credit, no endorsement, editorial for people and insignia", () => {
    const nasa = license("LicenseRef-NASA-Media");
    expect(nasa).toMatchObject({ verdict: "yes-with-credit", attributionRequired: true, editorial: true });
    expect(asEditorial(license("CC0-1.0"), "Shows people.")).toMatchObject({ verdict: "yes", editorial: true, note: "Shows people." });
  });

  it("free stock licences allow use in videos but not re-uploading", () => {
    const l = royaltyFree("Pexels License");
    expect(l).toMatchObject({ verdict: "yes", redistribution: false, assertedBy: "site" });
    expect(royaltyFree("X", { attributionRequired: true }).verdict).toBe("yes-with-credit");
  });

  it("writes a credit line only when attribution is required", () => {
    const c = { title: "Waves", author: "Jane", url: "https://x/1", provider: "wikimediacommons", license: creativeCommons({}) };
    expect(attributionLine(c, "Wikimedia Commons")).toBe(
      "“Waves” by Jane (Wikimedia Commons), https://x/1, licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)",
    );
    expect(attributionLine({ ...c, license: license("CC0-1.0") })).toBeUndefined();
  });
});

describe("makeClip", () => {
  it("fills category, styles, orientation and credits", () => {
    const c = makeClip({
      provider: "x",
      nativeId: "1",
      title: "Clouds Timelapse 1080x1920",
      tags: ["Sky"],
      url: "https://x",
      previewUrl: "https://cdn.x/p.webm",
      license: creativeCommons({}),
      sourceName: "X",
      downloadable: true,
      durationSec: 12.3456,
    });
    expect(c).toMatchObject({ id: "x:1", category: "nature.sky", styles: ["timelapse"], width: 1080, height: 1920, orientation: "portrait", tags: ["sky"], durationSec: 12.35, previewType: "video/webm" });
    expect(c.categoryEvidence?.by).toBe("rules");
    expect(c.attribution).toContain("“Clouds Timelapse 1080x1920” (X)");
  });
  it("keeps the source's own category", () => {
    const c = makeClip({ provider: "x", nativeId: "1", title: "Thing", category: "space.launch", url: "https://x", downloadable: true });
    expect(c.categoryEvidence).toEqual({ by: "source", confidence: 1 });
  });
});

describe("matchScore", () => {
  it("prefers title over tags and handles plurals", () => {
    expect(matchScore({ title: "Ocean Waves" }, "ocean wave")).toBe(1);
    expect(matchScore({ title: "Clip", tags: ["ocean"] }, "ocean")).toBeCloseTo(0.7);
    expect(matchScore({ title: "City" }, "ocean")).toBe(0);
  });
});

describe("parseClipId", () => {
  it("splits on the first colon only", () => {
    expect(parseClipId("nasa:KSC-2024:launch 1")).toEqual({ provider: "nasa", nativeId: "KSC-2024:launch 1" });
    expect(parseClipId("bad")).toBeNull();
  });
});
