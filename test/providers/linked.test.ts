import { describe, expect, it } from "vitest";
import { linkedProviders, mixkit, pexels, pond5, shutterstock } from "../../src/providers/linked.js";
import { fixtureCtx } from "../helpers.js";

describe("link-only sources", () => {
  it("make no requests and return a deep link to the same search", async () => {
    for (const p of linkedProviders) {
      const ctx = fixtureCtx([]);
      const res = await p.search({ query: "ocean waves", limit: 10 }, ctx);
      expect(res.clips, p.id).toEqual([]);
      expect(ctx.fetch.requests, p.id).toEqual([]);
      expect(res.searchUrl, p.id).toMatch(/^https:\/\//);
      expect(p.access, p.id).toBe("link");
      expect(p.supportsDownload, p.id).toBe(false);
      // An empty query still links somewhere useful on the site.
      expect(p.buildSearchUrl({ query: "", limit: 10 }), p.id).toMatch(/^https:\/\//);
    }
    expect(new Set(linkedProviders.map((p) => p.id)).size).toBe(linkedProviders.length);
  });

  it("carry orientation and resolution where the site has parameters, and words where it doesn't", () => {
    expect(pexels.buildSearchUrl({ query: "ocean waves", orientations: ["portrait"], minResolution: 2160, limit: 1 })).toBe(
      "https://www.pexels.com/search/videos/ocean%20waves/?orientation=portrait&size=large",
    );
    expect(mixkit.buildSearchUrl({ query: "city", orientations: ["portrait"], styles: ["timelapse"], limit: 1 })).toBe("https://mixkit.co/free-stock-video/city-vertical-timelapse/");
    expect(shutterstock.buildSearchUrl({ query: "drone", minResolution: 2160, limit: 1 })).toBe("https://www.shutterstock.com/video/search/drone?resolution=4k");
    expect(pond5.buildSearchUrl({ query: "1950s newsreel", limit: 1 })).toBe("https://www.pond5.com/stock-footage/1/1950s-newsreel.html");
  });

  it("say why paid libraries need a licence", () => {
    expect(shutterstock.license?.verdict).toBe("clearance-required");
    expect(pexels.license?.verdict).toBe("yes");
    expect(pexels.apiKeyEnv).toBe("PEXELS_API_KEY");
  });
});
