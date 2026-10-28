/**
 * The clip vocabulary (categories, styles, orientations, resolution tiers,
 * licence verdicts), read from src/data/vocab.json, which
 * web/scripts/export-vocab.mjs writes from the compiled server
 * (src/core/vocab.ts, src/core/licence.ts). Nothing here is a hand-copied
 * list: only presentation (tones, wording, formatting) is added.
 */
import vocab from "@/data/vocab.json";

export interface CategoryDef {
  id: string;
  label: string;
}

export const CATEGORY_DEFS: CategoryDef[] = vocab.categories;
export const TOP_CATEGORIES: string[] = vocab.topCategories;
export const STYLES: { id: string; label: string }[] = vocab.styles;
export const ORIENTATIONS: string[] = vocab.orientations;
export const RESOLUTIONS: { id: string; label: string; minShortSide: number }[] = vocab.resolutions;
export const VERDICTS = vocab.verdicts as Verdict[];
export const VERDICT_LABELS = vocab.verdictLabels as Record<Verdict, string>;

export type Verdict = "yes" | "yes-with-credit" | "restricted" | "clearance-required" | "check-terms" | "no";

const byId = new Map(CATEGORY_DEFS.map((c) => [c.id, c]));

export function categoryLabel(id: string | undefined): string {
  if (!id) return "";
  return byId.get(id)?.label ?? id;
}

/** "nature.ocean" -> "nature" */
export const topCategory = (id: string) => id.split(".")[0] ?? id;

/** Children of a top-level category, in vocabulary order ("nature" -> ocean, rivers, sky…). */
export function subCategories(top: string): CategoryDef[] {
  return CATEGORY_DEFS.filter((c) => c.id.startsWith(`${top}.`));
}

/** Depth of a category below its top level (nature.ocean = 1). */
export const depth = (id: string) => id.split(".").length - 1;

/** "Nature › Ocean & beach" */
export function categoryPath(id: string): string {
  const parts = id.split(".");
  if (parts.length === 1) return categoryLabel(id);
  return `${categoryLabel(parts[0])} › ${categoryLabel(id)}`;
}

export function styleLabel(id: string | undefined): string {
  if (!id) return "";
  return STYLES.find((s) => s.id === id)?.label ?? id;
}

export const ORIENTATION_LABELS: Record<string, string> = { landscape: "Landscape", portrait: "Vertical", square: "Square" };
export const orientationLabel = (o: string | undefined) => (o ? ORIENTATION_LABELS[o] ?? o : "");

/** Width/height → orientation (within 5% of square counts as square), as the server decides it. */
export function orientationOf(width?: number, height?: number): string | undefined {
  if (!width || !height) return undefined;
  const r = width / height;
  if (r > 1.05) return "landscape";
  if (r < 0.95) return "portrait";
  return "square";
}

/**
 * Short badge for a frame size, by its short side (a vertical 1080×1920 clip
 * is "1080p"): "4K", "1440p", "1080p", "720p", "480p". 3% slack, as on the
 * server, so 1920×1050 is still 1080p.
 */
export function resolutionBadge(width?: number, height?: number): string {
  if (!width || !height) return "";
  const s = Math.min(width, height);
  if (s >= 2160 * 0.97) return "4K";
  if (s >= 1440 * 0.97) return "1440p";
  if (s >= 1080 * 0.97) return "1080p";
  if (s >= 720 * 0.97) return "720p";
  return `${s}p`;
}

/** Long label for a frame size ("Full HD 1080p"), from the server's tiers. */
export function resolutionLabel(width?: number, height?: number): string {
  if (!width || !height) return "";
  const s = Math.min(width, height);
  let label = RESOLUTIONS[0]?.label ?? "";
  for (const r of RESOLUTIONS) if (s >= r.minShortSide * 0.97) label = r.label;
  return label;
}

/** Minimum-resolution filter choices (short side in pixels, the API's `min_resolution`). */
export const MIN_RESOLUTIONS: { value: number; label: string; short: string }[] = [
  { value: 720, label: "HD 720p", short: "HD" },
  { value: 1080, label: "Full HD 1080p", short: "1080p" },
  { value: 2160, label: "4K", short: "4K" },
];

/** Traffic-light colour of a verdict. */
export type Tone = "green" | "amber" | "red";
export function verdictTone(v: string | undefined): Tone {
  if (v === "yes" || v === "yes-with-credit") return "green";
  if (v === "no") return "red";
  return "amber";
}

/** Longer, plain-language meaning of each verdict (detail sheet, licence docs, landing page). */
export const VERDICT_MEANING: Record<Verdict, string> = {
  yes: "You can use it in a commercial video (an ad, a monetised channel, a client project) without crediting anyone. Crediting the source is still kind.",
  "yes-with-credit": "You can use it in a commercial video as long as you credit the source, for example in the description or the end credits. Use the credit line below.",
  restricted: "Commercial use comes with conditions that usually rule out a normal project, such as share-alike: the whole video would have to carry the same Creative Commons licence.",
  "clearance-required": "Stock footage that needs a paid licence, or releases for the people and property in frame, for each use. Fine for a rough cut; license it before you publish.",
  "check-terms": "Nobody has verified the licence: the source states none, an anonymous uploader asserted it, or a third party may own the footage. Read the terms before you use it.",
  no: "Non-commercial only: personal projects, study and practice. Not for ads, client work or monetised videos.",
};

/** What `license.editorial` means, in one paragraph. */
export const EDITORIAL_MEANING =
  "Editorial use: identifiable people, logos, insignia or brands appear without model or property releases. Fine for news, documentary and education; not for ads, product promotion or anything that implies endorsement.";

/** Verdicts in display order, grouped by tone. */
export const VERDICTS_BY_TONE: Record<Tone, Verdict[]> = {
  green: VERDICTS.filter((v) => verdictTone(v) === "green"),
  amber: VERDICTS.filter((v) => verdictTone(v) === "amber"),
  red: VERDICTS.filter((v) => verdictTone(v) === "red"),
};

/** 7 -> "0:07", 75 -> "1:15", 3725 -> "1:02:05" (the timecode editors read). */
export function durationText(sec: number | undefined): string {
  if (sec === undefined || sec === null || !Number.isFinite(sec)) return "";
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

/** 29.97 -> "29.97 fps", 60 -> "60 fps" */
export function fpsText(fps: number | undefined): string {
  if (!fps) return "";
  return `${Math.round(fps * 100) / 100} fps`;
}

/** ISO 8601 duration for schema.org ("PT1M15S"). */
export function isoDuration(sec: number | undefined): string | undefined {
  if (!sec || !Number.isFinite(sec)) return undefined;
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `PT${h ? `${h}H` : ""}${m ? `${m}M` : ""}${r || (!h && !m) ? `${r}S` : ""}`;
}
