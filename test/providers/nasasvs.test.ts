import { describe, expect, it } from "vitest";
import { filesOf, fpsFromName, nasasvs } from "../../src/providers/nasasvs.js";
import { fixture, fixtureCtx } from "../helpers.js";

const routes: [string | RegExp, string][] = [
  ["/api/search/", "nasasvs/search.json"],
  ...["5686", "5674", "15099", "20417", "15092", "15089"].map((id) => [new RegExp(`/api/${id}$`), `nasasvs/${id}.json`] as [RegExp, string]),
];

describe("nasasvs", () => {
  it("searches once and fetches details for the first six results only", async () => {
    const ctx = fixtureCtx(routes);
    const res = await nasasvs.search({ query: "sun", limit: 8 }, ctx);
    expect(ctx.fetch.requests).toHaveLength(7);
    expect(res.total).toBe(2645);
    const lucy = res.clips.find((c) => c.nativeId === "5686")!;
    expect(lucy).toMatchObject({
      url: "https://svs.gsfc.nasa.gov/5686/",
      width: 3840, // the 2160p master
      height: 2160,
      fps: 60,
      styles: ["visualization"],
      license: { id: "LicenseRef-NASA-Media", verdict: "yes-with-credit" },
      downloadable: true,
    });
    expect(lucy.license?.editorial).toBeUndefined();
    expect(lucy.posterUrl).toMatch(/^https:\/\/svs\.gsfc\.nasa\.gov\/vis\/.*\.jpg$/);
    expect(lucy.previewUrl).toMatch(/\.mp4$/);
    expect(lucy.author).toContain("NASA's Scientific Visualization Studio");
    // Results past the sixth link to their page and get media when opened.
    const later = res.clips.find((c) => c.nativeId === "5672")!;
    expect(later.posterUrl).toBeUndefined();
    expect(later.previewUrl).toBeUndefined();
  });

  it("drops pages that hold no movie", async () => {
    const res = await nasasvs.search({ query: "sun", limit: 8 }, fixtureCtx(routes));
    for (const id of ["15089", "15092", "15099", "20417", "5674", "5686"]) {
      const page = JSON.parse(fixture(`nasasvs/${id}.json`));
      const hasMovie = filesOf(page).some((f) => f.role !== "poster");
      expect(res.clips.some((c) => c.nativeId === id), id).toBe(hasMovie);
    }
  });

  it("returns every movie on a page, the biggest as the original", async () => {
    const clip = await nasasvs.getClip!("5686", fixtureCtx(routes));
    const videos = clip!.files.filter((f) => f.role !== "poster");
    expect(videos.filter((f) => f.role === "original")).toHaveLength(1);
    expect(Math.max(...videos.map((f) => f.width ?? 0))).toBe(videos.find((f) => f.role === "original")!.width);
    expect(videos.every((f) => f.url.startsWith("https://svs.gsfc.nasa.gov/"))).toBe(true);
    expect(clip!.files.at(-1)!.role).toBe("poster");
  });

  it("reads the frame rate from file names and builds a search link", () => {
    expect(fpsFromName("lucy_trajectory_2026_labeled_2160p60.mp4")).toBe(60);
    expect(fpsFromName("poster.jpg")).toBeUndefined();
    expect(nasasvs.buildSearchUrl({ query: "solar flare", limit: 1 })).toBe("https://svs.gsfc.nasa.gov/search/?search=solar+flare");
  });

  it("counts its pages", async () => {
    expect((await nasasvs.census!(fixtureCtx(routes))).total).toBe(2645);
  });
});
