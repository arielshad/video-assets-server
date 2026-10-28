/**
 * Video facts in free text: "4k", "1080p", "vertical", "9:16", "10s",
 * "under 30 seconds", "60fps", "timelapse". Used on a user's query to turn
 * words into filters (`parseQuery`), and to read frame sizes out of titles.
 */
import { STYLE_ALIAS_LIST, categoriesIn, matchAliases, wordTokens } from "./classify.js";
import type { ClipFilters, DurationRange } from "./types.js";
import { ORIENTATIONS, ORIENTATION_ALIASES, VIDEO_STYLES, type Category, type Orientation, type VideoStyle } from "./vocab.js";

export interface ParsedQuery extends ClipFilters {
  /** The words left for text search. */
  query: string;
  /** Categories the words point at (ranking hints, not filters). */
  hints: Category[];
}

// Resolution words. Order matters: "4k" before "k", "full hd" before "hd".
const RESOLUTION_WORDS: [RegExp, number][] = [
  [/(?<![\w])(8k|4320p)(?![\w])/i, 2160],
  [/(?<![\w])(4k|uhd|ultra\s*hd|2160p|4k\s*uhd)(?![\w])/i, 2160],
  [/(?<![\w])(2k|qhd|1440p)(?![\w])/i, 1440],
  [/(?<![\w])(full\s*hd|fhd|1080p|1080)(?![\w])/i, 1080],
  [/(?<![\w])(hd|720p|720)(?![\w])/i, 720],
];

const FPS = /(?<![\w.])(\d{2,3})\s*(?:fps|p(?=\s*slow)|frames per second)(?![a-z])/i;

const SECONDS = "(?:s|sec|secs|second|seconds)";
const MINUTES = "(?:m|min|mins|minute|minutes)";
const NUM = "(\\d{1,4}(?:\\.\\d+)?)";
const UNIT = `(${SECONDS}|${MINUTES})`;
const DUR_RANGE = new RegExp(`(?<![\\w.])${NUM}\\s*(?:-|–|to)\\s*${NUM}\\s*${UNIT}(?![a-z])`, "i");
const DUR_MAX = new RegExp(`(?<![\\w])(?:under|less than|shorter than|max|at most|up to|<)\\s*${NUM}\\s*${UNIT}(?![a-z])`, "i");
const DUR_MIN = new RegExp(`(?<![\\w])(?:over|more than|longer than|at least|min|>)\\s*${NUM}\\s*${UNIT}(?![a-z])`, "i");
const DUR_ONE = new RegExp(`(?<![\\w.])${NUM}\\s*-?\\s*${UNIT}(?:\\s+(?:long|clip|video|shot))?(?![a-z])`, "i");

function seconds(n: string, unit: string): number {
  const v = Number(n);
  return /^m/i.test(unit) ? v * 60 : v;
}

const ORIENTATION_ALIAS_LIST = ORIENTATIONS.flatMap((o) => ORIENTATION_ALIASES[o].map((a) => ({ words: wordTokens(a), target: o }))).sort(
  (a, b) => b.words.length - a.words.length,
);
// Ratio forms ("9:16", "16x9") survive tokenising only as separate numbers, so match them on the raw text.
const RATIO_ORIENTATION: [RegExp, Orientation][] = [
  [/(?<![\d])(9\s*[:x]\s*16|4\s*[:x]\s*5)(?![\d])/i, "portrait"],
  [/(?<![\d])(16\s*[:x]\s*9|21\s*[:x]\s*9|4\s*[:x]\s*3)(?![\d])/i, "landscape"],
  [/(?<![\d])(1\s*[:x]\s*1)(?![\d])/i, "square"],
];

/**
 * Pull resolution, orientation, duration, frame rate and style out of a
 * user's query. Resolution, orientation, duration and fps words are removed
 * from the text (sources don't put "4k" or "vertical" in titles, so they only
 * hurt text search); style and category words stay because sources without
 * those fields still match them in titles ("timelapse of clouds").
 *
 * A single length ("10s", "a 30 second clip") means "at least that long", so
 * the clip covers a shot of that length; say "under 10s" for short clips.
 */
export function parseQuery(raw: string): ParsedQuery {
  let text = ` ${raw} `;

  let minResolution: number | undefined;
  for (const [re, px] of RESOLUTION_WORDS) {
    const m = re.exec(text);
    if (!m) continue;
    minResolution = Math.max(minResolution ?? 0, px);
    text = text.replace(m[0], " ");
  }

  const orientations = new Set<Orientation>();
  for (const [re, o] of RATIO_ORIENTATION) {
    const m = re.exec(text);
    if (m) {
      orientations.add(o);
      text = text.replace(m[0], " ");
    }
  }
  const tokens = wordTokens(text);
  for (const o of matchAliases(tokens, ORIENTATION_ALIAS_LIST)) orientations.add(o as Orientation);
  if (orientations.size) text = stripAliases(text, ORIENTATION_ALIAS_LIST.filter((a) => orientations.has(a.target as Orientation)).map((a) => a.words));

  let minFps: number | undefined;
  const fps = FPS.exec(text);
  if (fps) {
    const n = Number(fps[1]);
    if (n >= 10 && n <= 480) minFps = n;
    text = text.replace(fps[0], " ");
  }

  let duration: DurationRange | undefined;
  const range = DUR_RANGE.exec(text);
  if (range) {
    const a = seconds(range[1]!, range[3]!);
    const b = seconds(range[2]!, range[3]!);
    duration = { min: Math.min(a, b), max: Math.max(a, b) };
    text = text.replace(range[0], " ");
  } else {
    const max = DUR_MAX.exec(text);
    const min = DUR_MIN.exec(text);
    if (max || min) {
      duration = {};
      if (max) {
        duration.max = seconds(max[1]!, max[2]!);
        text = text.replace(max[0], " ");
      }
      if (min) {
        duration.min = seconds(min[1]!, min[2]!);
        text = text.replace(min[0], " ");
      }
    } else {
      const one = DUR_ONE.exec(text);
      if (one) {
        const s = seconds(one[1]!, one[2]!);
        if (s > 0 && s <= 4 * 3600) duration = { min: s };
        text = text.replace(one[0], " ");
      }
    }
  }

  const styleHits = matchAliases(wordTokens(text), STYLE_ALIAS_LIST);
  const styles = VIDEO_STYLES.filter((s) => styleHits.has(s)) as VideoStyle[];

  // Words every clip "matches" ("free 4k stock footage of waves" → "waves"). Sources don't
  // put them in titles, so leaving them in only lowers text scores.
  const query = text
    .replace(/(?<![\p{L}\p{N}])(clips?|videos?|footage|stock|b-?roll|free|royalty[- ]free)(?![\p{L}\p{N}])/giu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:(?:a|an|the|of|in|with|for|at|on)\s+)+|(?:\s+(?:a|an|the|of|in|with|for|at|on))+$/gi, "")
    .trim();

  return {
    query,
    hints: categoriesIn(query),
    ...(minResolution ? { minResolution } : {}),
    ...(orientations.size === 1 ? { orientations: [...orientations] } : {}),
    ...(minFps ? { minFps } : {}),
    ...(duration ? { duration } : {}),
    ...(styles.length ? { styles } : {}),
  };
}

function stripAliases(text: string, phrases: string[][]): string {
  let out = text;
  for (const words of phrases.sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${words.map(escape).join("[\\s_-]+")}(?![\\p{L}\\p{N}])`, "giu");
    out = out.replace(re, " ");
  }
  return out;
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Does a clip's length satisfy the range? */
export function durationMatches(sec: number, range: DurationRange): boolean {
  return (range.min === undefined || sec >= range.min) && (range.max === undefined || sec <= range.max);
}

/** "1:05", "12s", "2:03:04". */
export function formatDuration(sec: number | undefined): string | undefined {
  if (sec === undefined || !Number.isFinite(sec)) return undefined;
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

/** Parse "WxH" frame sizes written in titles or file names ("1920x1080", "3840 × 2160"). */
export function frameSizeFromText(text: string): { width: number; height: number } | undefined {
  const m = /(?<!\d)(\d{3,4})\s*[x×]\s*(\d{3,4})(?!\d)/.exec(text);
  if (!m) return undefined;
  const width = Number(m[1]);
  const height = Number(m[2]);
  return width >= 160 && height >= 120 ? { width, height } : undefined;
}
