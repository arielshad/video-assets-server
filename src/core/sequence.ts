/**
 * build_sequence: turn a shot list ("sunrise over a city skyline", "coffee
 * pour close-up", "people walking in the rain") into a b-roll sequence.
 *
 * For each shot: search every source with the target orientation, minimum
 * resolution and length, pick the best clip not already used (alternatives
 * kept), then resolve its files and choose the rendition closest to the
 * target size. The plan carries everything an editor or a render script
 * needs:
 * - `timeline.otio`  OpenTimelineIO (DaVinci Resolve, Kdenlive, OTIO adapters for Premiere/FCP)
 * - `concat.sh`      ffmpeg: trim, scale/crop to the target frame, re-encode, concatenate
 * - `remotion.json`  clip list for a Remotion <Series> of <OffthreadVideo>
 * - credits (ATTRIBUTION.md + credits.json)
 *
 * The hosted server only plans: media URLs point at the sources. Local
 * installs can download the picks and the exports then use local paths.
 */
import { creditsJson, creditsMarkdown, type CreditsFile } from "./credits.js";
import { COMMERCIAL_SAFE } from "./licence.js";
import { selectFiles } from "./download.js";
import type { ClipService } from "./service.js";
import type { Clip, ClipDetails, ClipFile, Orientation } from "./types.js";
import { orientationOf, shortSide } from "./vocab.js";

export interface ShotRequest {
  /** What the shot shows: the search query. */
  description: string;
  /** Seconds on screen. Default: the total split evenly, else 4 s. */
  durationSec?: number;
}

export interface SequenceOptions {
  shots: ShotRequest[];
  /** Target frame; default 1920×1080 (or 1080×1920 for portrait). */
  width?: number;
  height?: number;
  orientation?: Orientation;
  fps?: number;
  /** Total length; shots without their own duration share it evenly. */
  totalDurationSec?: number;
  commercialOnly?: boolean;
  providers?: string[];
  /** Alternatives kept per shot. */
  alternatives?: number;
  credentials?: Record<string, string>;
}

export interface SequenceShot {
  index: number;
  description: string;
  durationSec: number;
  /** In-point in the source clip (seconds): skips title cards on long archive films. */
  inSec: number;
  clip?: Clip;
  /** The file the exports use (a direct URL on the source). */
  file?: Pick<ClipFile, "url" | "filename" | "format" | "width" | "height" | "fps" | "sizeBytes">;
  alternatives: Clip[];
  /** Why nothing (or something imperfect) was picked. */
  note?: string;
}

export interface SequencePlan {
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  shots: SequenceShot[];
  /** True when every pick's licence is yes / yes-with-credit. */
  commercialSafe: boolean;
}

const DEFAULT_SHOT_SEC = 4;
const MAX_SHOTS = 24;

/** Even split of the total over shots without their own length (min 1 s). */
export function shotDurations(shots: ShotRequest[], total?: number): number[] {
  const fixed = shots.reduce((sum, s) => sum + (s.durationSec ?? 0), 0);
  const open = shots.filter((s) => s.durationSec === undefined).length;
  const share = total !== undefined && open ? Math.max(1, (total - fixed) / open) : DEFAULT_SHOT_SEC;
  return shots.map((s) => round(s.durationSec ?? share, 3));
}

/** "Shot 1: sunrise\n- coffee pour (3s)\n3. rain" → shots, with "(3s)" / "3 sec" read as the length. */
export function parseShotList(text: string): ShotRequest[] {
  return text
    .split(/\r?\n|;/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)]|shot\s*\d+\s*[:.-])\s*/i, "").trim())
    .filter(Boolean)
    .map((line) => {
      const m = /[([]?\s*(\d+(?:\.\d+)?)\s*(?:s|sec|secs|seconds)\s*[)\]]?\s*$/i.exec(line);
      return m ? { description: line.slice(0, m.index).trim(), durationSec: Number(m[1]) } : { description: line };
    })
    .filter((s) => s.description);
}

function targetFrame(o: SequenceOptions): { width: number; height: number; orientation: Orientation } {
  if (o.width && o.height) return { width: even(o.width), height: even(o.height), orientation: orientationOf(o.width, o.height) ?? "landscape" };
  const orientation = o.orientation ?? "landscape";
  if (orientation === "portrait") return { width: 1080, height: 1920, orientation };
  if (orientation === "square") return { width: 1080, height: 1080, orientation };
  return { width: 1920, height: 1080, orientation };
}

/** Pick the file to cut from: the smallest at or above the target size (renditions beat 4K masters for a 1080p edit). */
function fileFor(details: ClipDetails, target: number): ClipFile | undefined {
  return selectFiles(details, { height: target })[0];
}

export async function planSequence(service: ClipService, o: SequenceOptions): Promise<SequencePlan> {
  const shots = o.shots.slice(0, MAX_SHOTS);
  if (!shots.length) throw new Error("A sequence needs at least one shot.");
  const frame = targetFrame(o);
  const fps = o.fps ?? 30;
  const durations = shotDurations(shots, o.totalDurationSec);
  const minRes = Math.min(frame.width, frame.height);
  const used = new Set<string>();
  const alternatives = o.alternatives ?? 3;
  const commercialOnly = o.commercialOnly ?? true;

  // Searches run in parallel; picks are made in order so a clip is used once.
  const searches = await Promise.all(
    shots.map((s, i) =>
      service
        .search({
          query: s.description,
          parse: true,
          orientations: [frame.orientation],
          minResolution: Math.min(minRes, 1080),
          duration: { min: durations[i] },
          commercialOnly,
          downloadableOnly: true,
          providers: o.providers,
          limit: 12,
          credentials: o.credentials,
        })
        .catch(() => undefined),
    ),
  );

  const out: SequenceShot[] = [];
  for (let i = 0; i < shots.length; i++) {
    const res = searches[i];
    const candidates = (res?.results ?? []).filter((c) => !used.has(c.id));
    const base: SequenceShot = { index: i + 1, description: shots[i]!.description, durationSec: durations[i]!, inSec: 0, alternatives: [] };
    let picked: { clip: Clip; details: ClipDetails; file: ClipFile } | undefined;
    for (const c of candidates.slice(0, 4)) {
      const details = await service.getClip(c.id, o.credentials).catch(() => null);
      const file = details ? fileFor(details, minRes) : undefined;
      if (details && file) {
        picked = { clip: { ...c, ...stripFiles(details), score: c.score }, details, file };
        break;
      }
    }
    if (!picked) {
      out.push({ ...base, note: res ? "No downloadable clip matched; try other words or drop the commercial filter." : "Search failed for this shot." });
      continue;
    }
    used.add(picked.clip.id);
    const d = picked.clip.durationSec;
    const shotLen = durations[i]!;
    const notes: string[] = [];
    if (d !== undefined && d < shotLen) notes.push(`Clip is ${d}s, shorter than the ${shotLen}s shot: it will freeze or loop at the end.`);
    const s = shortSide(picked.file.width, picked.file.height);
    if (s !== undefined && s < minRes * 0.97) notes.push(`Best file is ${picked.file.width}×${picked.file.height}, below the ${frame.width}×${frame.height} target: it will be upscaled.`);
    if (picked.clip.orientation && picked.clip.orientation !== frame.orientation) notes.push(`Clip is ${picked.clip.orientation}; it will be cropped to ${frame.orientation}.`);
    out.push({
      ...base,
      inSec: d !== undefined && d > shotLen * 4 ? round(Math.min(d * 0.15, d - shotLen), 2) : 0,
      clip: picked.clip,
      file: { url: picked.file.url, filename: picked.file.filename, format: picked.file.format, width: picked.file.width, height: picked.file.height, fps: picked.file.fps, sizeBytes: picked.file.sizeBytes },
      alternatives: candidates.filter((c) => c.id !== picked!.clip.id && !used.has(c.id)).slice(0, alternatives),
      ...(notes.length ? { note: notes.join(" ") } : {}),
    });
  }

  const picks = out.filter((s) => s.clip).map((s) => s.clip!);
  return {
    width: frame.width,
    height: frame.height,
    fps,
    durationSec: round(durations.reduce((a, b) => a + b, 0), 3),
    shots: out,
    commercialSafe: picks.length > 0 && picks.every((c) => c.license && COMMERCIAL_SAFE.has(c.license.verdict)),
  };
}

function stripFiles(d: ClipDetails): Clip {
  const { files: _f, ...rest } = d;
  return rest;
}

// ---------------------------------------------------------------------------
// Exports

export interface SequenceExports {
  "timeline.otio": string;
  "concat.sh": string;
  "remotion.json": string;
  "ATTRIBUTION.md": string;
  "credits.json": string;
}

/** Where each shot's media is: the source URL, or a local path when the picks were downloaded. */
export type MediaPaths = Record<number, string>;

export function sequenceExports(plan: SequencePlan, opts: { name?: string; sourceNames?: Record<string, string>; media?: MediaPaths; now?: Date } = {}): SequenceExports {
  const name = opts.name ?? "sequence";
  const shots = plan.shots.filter((s) => s.clip && s.file);
  const media = (s: SequenceShot) => opts.media?.[s.index] ?? s.file!.url;
  const clips = shots.map((s) => s.clip!);
  const credits: CreditsFile = creditsJson(clips, { sourceNames: opts.sourceNames, now: opts.now });
  return {
    "timeline.otio": JSON.stringify(otio(plan, shots, media, name), null, 2),
    "concat.sh": ffmpegScript(plan, shots, media, name),
    "remotion.json": JSON.stringify(remotion(plan, shots, media), null, 2),
    "ATTRIBUTION.md": creditsMarkdown(credits),
    "credits.json": JSON.stringify(credits, null, 2),
  };
}

function rational(sec: number, rate: number) {
  return { OTIO_SCHEMA: "RationalTime.1", rate, value: Math.round(sec * rate) };
}

/** OpenTimelineIO JSON: one video track, one clip per shot, media referenced by URL or path. */
export function otio(plan: SequencePlan, shots: SequenceShot[], media: (s: SequenceShot) => string, name: string) {
  const rate = plan.fps;
  return {
    OTIO_SCHEMA: "Timeline.1",
    name,
    metadata: { generator: "video-assets-server", width: plan.width, height: plan.height },
    global_start_time: null,
    tracks: {
      OTIO_SCHEMA: "Stack.1",
      name: "tracks",
      children: [
        {
          OTIO_SCHEMA: "Track.1",
          name: "V1",
          kind: "Video",
          children: shots.map((s) => ({
            OTIO_SCHEMA: "Clip.1",
            name: `${String(s.index).padStart(2, "0")} ${s.clip!.title}`.slice(0, 120),
            source_range: {
              OTIO_SCHEMA: "TimeRange.1",
              start_time: rational(s.inSec, rate),
              duration: rational(s.durationSec, rate),
            },
            media_reference: {
              OTIO_SCHEMA: "ExternalReference.1",
              target_url: media(s),
              available_range: s.clip!.durationSec
                ? { OTIO_SCHEMA: "TimeRange.1", start_time: rational(0, rate), duration: rational(s.clip!.durationSec, rate) }
                : null,
              metadata: {},
            },
            metadata: {
              "video-assets-server": {
                id: s.clip!.id,
                shot: s.description,
                source: s.clip!.url,
                license: s.clip!.license?.name,
                verdict: s.clip!.license?.verdict,
                attribution: s.clip!.attribution,
              },
            },
            effects: [],
            markers: [],
          })),
          effects: [],
          markers: [],
          metadata: {},
          source_range: null,
        },
      ],
      effects: [],
      markers: [],
      metadata: {},
      source_range: null,
    },
  };
}

/** Sources like Wikimedia throttle anonymous clients: say who is fetching. */
const FFMPEG_UA = "video-assets-server-sequence/0.1 (+https://video.shep.bot; https://github.com/arielshad/video-assets-server)";

function sh(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * A POSIX shell script: each shot is trimmed, scaled to cover the frame,
 * centre-cropped, conformed to the frame rate and re-encoded (h264, no audio:
 * b-roll sound is rarely wanted and sources differ), then the parts are
 * concatenated without re-encoding.
 */
export function ffmpegScript(plan: SequencePlan, shots: SequenceShot[], media: (s: SequenceShot) => string, name: string): string {
  const W = plan.width;
  const H = plan.height;
  const vf = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${plan.fps},setsar=1,format=yuv420p`;
  const lines = [
    "#!/bin/sh",
    `# ${name}: ${shots.length} shots, ${W}x${H} @ ${plan.fps} fps, generated by video-assets-server.`,
    "# Needs ffmpeg. Media is read straight from the sources (or the local footage folder).",
    "# Credits: see ATTRIBUTION.md before publishing.",
    "set -eu",
    'cd "$(dirname "$0")"',
    "mkdir -p parts",
    ": > parts/list.txt",
  ];
  for (const s of shots) {
    const part = `parts/${String(s.index).padStart(2, "0")}.mp4`;
    // A clip shorter than its shot holds its last frame (tpad) so every part has the planned length.
    const pad = s.clip!.durationSec !== undefined && s.clip!.durationSec - s.inSec < s.durationSec ? `,tpad=stop_mode=clone:stop_duration=${s.durationSec}` : "";
    lines.push(
      `# ${s.index}. ${s.description.replace(/\n/g, " ")} — ${s.clip!.title.replace(/\n/g, " ")} (${s.clip!.id})`,
      `ffmpeg -hide_banner -loglevel warning -y${/^https?:/.test(media(s)) ? ` -user_agent ${sh(FFMPEG_UA)}` : ""} -ss ${s.inSec} -i ${sh(media(s))} -t ${s.durationSec} -vf ${sh(vf + pad)} -an -c:v libx264 -preset veryfast -crf 20 -movflags +faststart ${part}`,
      `echo "file '${part.replace("parts/", "")}'" >> parts/list.txt`,
    );
  }
  lines.push(`ffmpeg -hide_banner -loglevel warning -y -f concat -safe 0 -i parts/list.txt -c copy ${sh(`${safeName(name)}.mp4`)}`, `echo "Wrote ${safeName(name)}.mp4"`, "");
  return lines.join("\n");
}

/** Remotion: `<Series>{shots.map(s => <Series.Sequence durationInFrames={s.durationInFrames}><OffthreadVideo src={s.src} startFrom={s.startFrom} muted /></Series.Sequence>)}</Series>`. */
export function remotion(plan: SequencePlan, shots: SequenceShot[], media: (s: SequenceShot) => string) {
  return {
    fps: plan.fps,
    width: plan.width,
    height: plan.height,
    durationInFrames: shots.reduce((sum, s) => sum + Math.round(s.durationSec * plan.fps), 0),
    shots: shots.map((s) => ({
      id: s.clip!.id,
      title: s.clip!.title,
      src: media(s),
      startFrom: Math.round(s.inSec * plan.fps),
      durationInFrames: Math.round(s.durationSec * plan.fps),
      credit: s.clip!.attribution,
    })),
    usage:
      "import { OffthreadVideo, Series } from 'remotion'; <Series>{data.shots.map((s) => (<Series.Sequence key={s.id} durationInFrames={s.durationInFrames}><OffthreadVideo src={s.src} startFrom={s.startFrom} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></Series.Sequence>))}</Series>",
  };
}

function safeName(s: string): string {
  return s.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "sequence";
}

function even(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2);
}

function round(n: number, digits: number): number {
  const k = 10 ** digits;
  return Math.round(n * k) / k;
}
