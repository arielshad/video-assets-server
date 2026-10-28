import { describe, expect, it } from "vitest";
import { createHttpClient } from "../../src/core/http.js";
import { nasa } from "../../src/providers/nasa.js";

// Live check against the real site: LIVE=1 npx vitest run test/live/nasa.live.test.ts
describe.runIf(process.env.LIVE)("nasa (live)", () => {
  const ctx = { fetch: createHttpClient() };

  it("finds clips with a licence, and one clip's files are video on the source's servers", async () => {
    const res = await nasa.search({ query: "launch", limit: 8 }, ctx);
    expect(res.clips.length).toBeGreaterThan(0);
    for (const c of res.clips) expect(c.license?.verdict, c.id).toBeTruthy();
    const details = await nasa.getClip!(res.clips[0]!.nativeId, ctx);
    expect(details).not.toBeNull();
    const video = details!.files.find((f) => f.role === "original" || f.role === "rendition");
    expect(video).toBeDefined();
    const head = await fetch(video!.url, { method: "HEAD", redirect: "follow", headers: { "user-agent": "video-assets-server-live-test" } });
    expect(head.ok, video!.url).toBe(true);
    expect(head.headers.get("content-type") ?? "", video!.url).toMatch(/^(video\/|application\/ogg|application\/octet-stream)/);
  }, 60_000);

  it("counts its catalogue", async () => {
    expect((await nasa.census!(ctx)).total).toBeGreaterThan(0);
  }, 60_000);
});
