import { describe, expect, it } from "vitest";
import { ffmpegScript, parseShotList, planSequence, sequenceExports, shotDurations } from "../src/core/sequence.js";
import { ClipService } from "../src/core/service.js";
import { bytesHttp, fakeProvider } from "./fakes.js";

const service = () => new ClipService({ providers: [fakeProvider], http: bytesHttp(), defaultTimeoutMs: 500 });

describe("shot lists", () => {
  it("reads one shot per line, with optional lengths and list markers", () => {
    expect(parseShotList("1. Sunrise over the city (3s)\n- coffee pour close-up\nShot 3: rain on a window 2.5 sec\n\n• people walking")).toEqual([
      { description: "Sunrise over the city", durationSec: 3 },
      { description: "coffee pour close-up" },
      { description: "rain on a window", durationSec: 2.5 },
      { description: "people walking" },
    ]);
    expect(parseShotList("ocean; city")).toEqual([{ description: "ocean" }, { description: "city" }]);
  });

  it("splits the total over shots without their own length", () => {
    expect(shotDurations([{ description: "a", durationSec: 4 }, { description: "b" }, { description: "c" }], 20)).toEqual([4, 8, 8]);
    expect(shotDurations([{ description: "a" }, { description: "b" }])).toEqual([4, 4]);
    expect(shotDurations([{ description: "a", durationSec: 30 }, { description: "b" }], 20)).toEqual([30, 1]);
  });
});

describe("planSequence", () => {
  it("picks one clip per shot, never twice, with the rendition nearest the frame", async () => {
    const plan = await planSequence(service(), { shots: [{ description: "ocean waves", durationSec: 5 }, { description: "ocean" }], commercialOnly: false, totalDurationSec: 9 });
    expect(plan).toMatchObject({ width: 1920, height: 1080, fps: 30, durationSec: 9, commercialSafe: true });
    expect(plan.shots[0]).toMatchObject({ clip: { id: "fake:ocean" }, file: { url: "https://cdn.fake.example/ocean-1080.mp4", height: 1080 }, inSec: 0 });
    // The same clip is not reused for the second shot.
    expect(plan.shots[1]!.clip?.id).not.toBe("fake:ocean");
  });

  it("falls back to clips that need cropping, and says so", async () => {
    const plan = await planSequence(service(), { shots: [{ description: "city traffic" }], orientation: "landscape", commercialOnly: false });
    expect(plan.shots[0]!.clip?.id).toBe("fake:city");
    expect(plan.shots[0]!.note).toMatch(/portrait; it will be cropped to landscape/);
    expect(plan.commercialSafe).toBe(false);
  });

  it("is commercial-safe by default and reports empty shots", async () => {
    const plan = await planSequence(service(), { shots: [{ description: "city traffic" }, { description: "ocean" }] });
    expect(plan.shots[0]!.clip).toBeUndefined();
    expect(plan.shots[0]!.note).toMatch(/No downloadable clip/);
    expect(plan.shots[1]!.clip?.id).toBe("fake:ocean");
  });

  it("uses vertical and square frames", async () => {
    expect(await planSequence(service(), { shots: [{ description: "ocean" }], orientation: "portrait" })).toMatchObject({ width: 1080, height: 1920 });
    expect(await planSequence(service(), { shots: [{ description: "ocean" }], width: 1001, height: 1001 })).toMatchObject({ width: 1002, height: 1002 });
    await expect(planSequence(service(), { shots: [] })).rejects.toThrow(/at least one shot/);
  });
});

describe("sequence exports", () => {
  it("writes an OTIO timeline, an ffmpeg script, a Remotion list and credits", async () => {
    const plan = await planSequence(service(), { shots: [{ description: "ocean waves", durationSec: 5 }], fps: 25 });
    const out = sequenceExports(plan, { name: "promo cut", sourceNames: { fake: "Fake" }, now: new Date("2026-10-28T00:00:00Z") });
    const otio = JSON.parse(out["timeline.otio"]);
    const clip = otio.tracks.children[0].children[0];
    expect(otio.OTIO_SCHEMA).toBe("Timeline.1");
    expect(clip.source_range.duration).toEqual({ OTIO_SCHEMA: "RationalTime.1", rate: 25, value: 125 });
    expect(clip.media_reference.target_url).toBe("https://cdn.fake.example/ocean-1080.mp4");
    expect(clip.metadata["video-assets-server"]).toMatchObject({ id: "fake:ocean", verdict: "yes" });
    const remotion = JSON.parse(out["remotion.json"]);
    expect(remotion).toMatchObject({ fps: 25, width: 1920, height: 1080, durationInFrames: 125, shots: [{ src: "https://cdn.fake.example/ocean-1080.mp4", startFrom: 0, durationInFrames: 125 }] });
    expect(out["ATTRIBUTION.md"]).toContain("Ocean Waves at Sunset");
    expect(JSON.parse(out["credits.json"]).clips).toHaveLength(1);
    const sh = out["concat.sh"];
    expect(sh.startsWith("#!/bin/sh")).toBe(true);
    expect(sh).toContain("-user_agent 'video-assets-server-sequence/");
    expect(sh).toContain("scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=25");
    expect(sh).toContain("-f concat -safe 0 -i parts/list.txt -c copy 'promo-cut.mp4'");
  });

  it("quotes hostile paths and pads clips shorter than their shot", () => {
    const shot = {
      index: 1,
      description: "x",
      durationSec: 10,
      inSec: 0,
      alternatives: [],
      clip: { id: "a:1", provider: "a", nativeId: "1", title: "T", url: "https://a", tags: [], category: "other" as const, downloadable: true, durationSec: 4 },
      file: { url: "https://a/it's.mp4", filename: "x.mp4", format: "mp4" },
    };
    const sh = ffmpegScript({ width: 1080, height: 1920, fps: 30, durationSec: 10, shots: [shot], commercialSafe: true }, [shot], () => "footage/it's here.mp4", "n");
    expect(sh).toContain(`-i 'footage/it'\\''s here.mp4'`);
    expect(sh).not.toContain("-user_agent"); // local files
    expect(sh).toContain("tpad=stop_mode=clone:stop_duration=10");
  });
});
