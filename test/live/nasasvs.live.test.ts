import { describe, expect, it } from "vitest";
import { createHttpClient } from "../../src/core/http.js";
import { nasasvs } from "../../src/providers/nasasvs.js";

// Live check against the real site: LIVE=1 npx vitest run test/live/nasasvs.live.test.ts
describe.runIf(process.env.LIVE)("nasasvs (live)", () => {
  const ctx = { fetch: createHttpClient() };

  it("finds clips with a licence, and one clip's files are video on the source's servers", async () => {
    const res = await nasasvs.search({ query: "sun", limit: 8 }, ctx);
    expect(res.clips.length).toBeGreaterThan(0);
    for (const c of res.clips) expect(c.license?.verdict, c.id).toBeTruthy();
    const details = await nasasvs.getClip!(res.clips[0]!.nativeId, ctx);
    expect(details).not.toBeNull();
    const video = details!.files.find((f) => f.role === "original" || f.role === "rendition");
    expect(video).toBeDefined();
    const head = await fetch(video!.url, { method: "HEAD", redirect: "follow", headers: { "user-agent": "video-assets-server-live-test" } });
    expect(head.ok, video!.url).toBe(true);
    expect(head.headers.get("content-type") ?? "", video!.url).toMatch(/^(video\/|application\/ogg|application\/octet-stream)/);
  }, 60_000);

  it("counts its catalogue", async () => {
    expect((await nasasvs.census!(ctx)).total).toBeGreaterThan(0);
  }, 60_000);
});
