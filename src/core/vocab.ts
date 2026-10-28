/**
 * The one place the clip vocabulary lives: categories, styles, orientations,
 * resolution tiers and the words that point at them. The server, scripts and
 * web UI all import from here (the web build reads it from dist/), so the
 * lists never drift apart.
 */

export interface CategoryDef {
  id: string;
  label: string;
  /** Words (lowercase, matched as whole tokens or phrases) that suggest this category. */
  aliases: string[];
}

/**
 * Dot-path categories. A parent ("nature") matches every child ("nature.ocean").
 * Order matters for classification ties: more specific entries come after their parent.
 */
export const CATEGORY_DEFS = [
  { id: "nature", label: "Nature", aliases: ["nature", "landscape scenery", "scenery", "outdoors", "wilderness", "natural"] },
  { id: "nature.ocean", label: "Ocean & beach", aliases: ["ocean", "sea", "beach", "waves", "wave", "surf", "coast", "shore", "seaside", "underwater", "coral", "reef"] },
  { id: "nature.water", label: "Rivers & rain", aliases: ["river", "waterfall", "waterfalls", "lake", "stream", "rain", "raindrops", "rainy", "pond", "creek", "water"] },
  { id: "nature.sky", label: "Sky & clouds", aliases: ["sky", "clouds", "cloud", "sunset", "sunsets", "sunrise", "dawn", "dusk", "golden hour", "storm", "lightning", "thunderstorm", "aurora", "northern lights", "rainbow", "fog", "mist"] },
  { id: "nature.forest", label: "Forest & plants", aliases: ["forest", "woods", "trees", "tree", "jungle", "rainforest", "leaves", "leaf", "flowers", "flower", "plants", "plant", "grass", "garden", "autumn", "fall foliage"] },
  { id: "nature.mountain", label: "Mountains & snow", aliases: ["mountain", "mountains", "snow", "snowy", "winter", "glacier", "ice", "volcano", "canyon", "desert", "dunes", "hills", "valley", "alps"] },
  { id: "nature.animals", label: "Animals & wildlife", aliases: ["animal", "animals", "wildlife", "bird", "birds", "dog", "dogs", "cat", "cats", "horse", "fish", "insect", "insects", "bee", "bees", "butterfly", "whale", "lion", "elephant", "deer", "pet", "pets"] },
  { id: "city", label: "City & urban", aliases: ["city", "urban", "downtown", "town", "metropolis", "buildings", "architecture"] },
  { id: "city.street", label: "Streets & traffic", aliases: ["street", "streets", "traffic", "crosswalk", "pedestrians", "crowd", "crowds", "sidewalk", "intersection", "highway", "road", "roads"] },
  { id: "city.skyline", label: "Skylines", aliases: ["skyline", "skyscraper", "skyscrapers", "cityscape", "city lights", "city at night", "night city"] },
  { id: "people", label: "People", aliases: ["people", "person", "man", "woman", "men", "women", "child", "children", "kids", "family", "friends", "portrait of", "face", "hands", "crowd of people"] },
  { id: "people.work", label: "Work & business", aliases: ["business", "office", "meeting", "teamwork", "working", "worker", "workers", "laptop", "typing", "startup", "coworking", "presentation"] },
  { id: "people.lifestyle", label: "Lifestyle", aliases: ["lifestyle", "walking", "running", "dancing", "dance", "party", "travel", "traveler", "tourist", "shopping", "cooking", "yoga", "fitness", "workout", "exercise"] },
  { id: "people.sport", label: "Sport", aliases: ["sport", "sports", "football", "soccer", "basketball", "tennis", "surfing", "skateboard", "skateboarding", "skiing", "cycling", "bike", "swimming", "athlete", "athletes"] },
  { id: "aerial", label: "Aerial & drone", aliases: ["aerial", "drone", "drone shot", "drone footage", "birds eye", "bird's eye", "flyover", "fly over", "from above", "overhead"] },
  { id: "space", label: "Space", aliases: ["space", "outer space", "cosmos", "universe", "galaxy", "galaxies", "nebula", "stars", "starfield", "astronomy", "milky way"] },
  { id: "space.earth", label: "Earth from space", aliases: ["earth from space", "earth", "planet earth", "globe", "orbit", "iss", "space station", "international space station", "satellite view"] },
  { id: "space.launch", label: "Launches & missions", aliases: ["launch", "rocket", "rockets", "liftoff", "lift off", "shuttle", "space shuttle", "spacecraft", "astronaut", "astronauts", "spacewalk", "mission", "apollo", "artemis"] },
  { id: "space.planets", label: "Sun, moon & planets", aliases: ["sun", "solar", "solar flare", "moon", "lunar", "mars", "jupiter", "saturn", "venus", "mercury", "planet", "planets", "eclipse", "asteroid", "comet", "black hole"] },
  { id: "science", label: "Science & data", aliases: ["science", "scientific", "laboratory", "lab", "microscope", "microscopic", "cells", "cell", "dna", "molecule", "chemistry", "physics", "experiment", "visualization", "visualisation", "data visualization", "simulation", "climate", "weather"] },
  { id: "tech", label: "Technology", aliases: ["technology", "tech", "computer", "computers", "screen", "code", "coding", "programming", "data", "server", "servers", "circuit", "robot", "robots", "ai", "smartphone", "phone", "digital", "network", "cyber"] },
  { id: "transport", label: "Transport", aliases: ["car", "cars", "train", "trains", "railway", "plane", "planes", "airplane", "aircraft", "airport", "ship", "ships", "boat", "boats", "truck", "bus", "subway", "metro", "driving"] },
  { id: "food", label: "Food & drink", aliases: ["food", "drink", "drinks", "coffee", "tea", "cooking", "kitchen", "restaurant", "meal", "breakfast", "fruit", "vegetables", "wine", "beer", "cocktail", "baking"] },
  { id: "background", label: "Backgrounds", aliases: ["background", "backgrounds", "backdrop", "motion background", "abstract", "gradient", "pattern", "texture", "wallpaper", "loop background", "screensaver"] },
  { id: "background.abstract", label: "Abstract", aliases: ["abstract", "shapes", "geometric", "lines", "fractal", "kaleidoscope", "psychedelic", "liquid", "ink", "fluid"] },
  { id: "overlay", label: "Overlays & VFX", aliases: ["overlay", "overlays", "vfx", "effect", "effects", "visual effects", "transition", "transitions"] },
  { id: "overlay.light", label: "Light leaks & bokeh", aliases: ["light leak", "light leaks", "bokeh", "lens flare", "flare", "flares", "light rays", "glow"] },
  { id: "overlay.particles", label: "Particles, smoke & fire", aliases: ["particles", "particle", "dust", "smoke", "fire", "flames", "sparks", "embers", "confetti", "snowfall", "fireworks", "explosion"] },
  { id: "overlay.film", label: "Film grain & glitch", aliases: ["film grain", "grain", "film burn", "scratches", "vhs", "glitch", "noise", "static", "old film", "film damage"] },
  { id: "greenscreen", label: "Green screen", aliases: ["green screen", "greenscreen", "chroma key", "chromakey", "blue screen", "keyable", "alpha channel", "transparent background"] },
  { id: "archive", label: "Archive & vintage", aliases: ["archive", "archival", "vintage", "historic", "historical", "history", "retro", "old footage", "classic"] },
  { id: "archive.newsreel", label: "Newsreels & documentary", aliases: ["newsreel", "newsreels", "news reel", "documentary", "propaganda", "wartime", "world war", "ww2", "wwii", "war footage", "public information film"] },
  { id: "archive.film", label: "Films & animation", aliases: ["film", "films", "movie", "movies", "silent film", "feature film", "short film", "cartoon", "cartoons", "animated", "home movie", "home movies", "educational film", "industrial film", "advertisement", "commercial"] },
  { id: "other", label: "Other", aliases: [] },
] as const satisfies readonly CategoryDef[];

export type Category = (typeof CATEGORY_DEFS)[number]["id"];
export const CATEGORIES = CATEGORY_DEFS.map((c) => c.id) as Category[];
export const TOP_CATEGORIES = CATEGORIES.filter((c) => !c.includes(".")) as Category[];

const CATEGORY_SET = new Set<string>(CATEGORIES);
export function isCategory(s: string): s is Category {
  return CATEGORY_SET.has(s);
}

export function categoryLabel(id: string): string {
  return CATEGORY_DEFS.find((c) => c.id === id)?.label ?? id;
}

/** "nature.ocean" -> "nature" */
export function topCategory(id: string): Category {
  return (id.split(".")[0] ?? "other") as Category;
}

/** Does a clip in `category` satisfy the `wanted` filter? Parents match their children. */
export function categoryMatches(category: string | undefined, wanted?: readonly string[]): boolean {
  if (!wanted?.length) return true;
  if (!category) return false;
  return wanted.some((w) => category === w || category.startsWith(`${w}.`));
}

/**
 * How a clip was shot or made, independent of what it shows:
 * - timelapse:     sped-up time (clouds racing, city lights)
 * - slow-motion:   high frame rate played slowly
 * - loop:          seamless loop (motion backgrounds)
 * - animation:     drawn, rendered or CG, not filmed
 * - visualization: rendered from data (NASA SVS, simulations)
 * - black-white:   black-and-white footage
 */
export const VIDEO_STYLES = ["timelapse", "slow-motion", "loop", "animation", "visualization", "black-white"] as const;
export type VideoStyle = (typeof VIDEO_STYLES)[number];

export const STYLE_ALIASES: Record<VideoStyle, string[]> = {
  timelapse: ["timelapse", "time lapse", "time-lapse", "hyperlapse", "hyper lapse"],
  "slow-motion": ["slow motion", "slowmotion", "slow-motion", "slowmo", "slow mo", "slo mo", "slo-mo", "high speed"],
  loop: ["loop", "loops", "looping", "seamless loop", "loopable", "seamless"],
  animation: ["animation", "animated", "cartoon", "cgi", "3d render", "render", "rendered", "motion graphics", "2d animation", "3d animation"],
  visualization: ["visualization", "visualisation", "data visualization", "data visualisation", "simulation", "conceptual animation"],
  "black-white": ["black and white", "black & white", "b&w", "bw", "monochrome", "grayscale", "greyscale"],
};

export const STYLE_LABELS: Record<VideoStyle, string> = {
  timelapse: "Timelapse",
  "slow-motion": "Slow motion",
  loop: "Seamless loop",
  animation: "Animation / CG",
  visualization: "Data visualisation",
  "black-white": "Black & white",
};

export const ORIENTATIONS = ["landscape", "portrait", "square"] as const;
export type Orientation = (typeof ORIENTATIONS)[number];

export const ORIENTATION_ALIASES: Record<Orientation, string[]> = {
  landscape: ["landscape", "horizontal", "widescreen", "16:9", "16x9", "youtube"],
  portrait: ["portrait", "vertical", "9:16", "9x16", "reels", "reel", "tiktok", "shorts", "stories", "story", "instagram story"],
  square: ["square", "1:1", "1x1"],
};

/** Width/height → orientation (within 5% of square counts as square). */
export function orientationOf(width?: number, height?: number): Orientation | undefined {
  if (!width || !height) return undefined;
  const r = width / height;
  if (r > 1.05) return "landscape";
  if (r < 0.95) return "portrait";
  return "square";
}

/**
 * Resolution tiers, by the short side of the frame (a vertical 1080×1920 clip
 * is "1080p", the same as a landscape 1920×1080 one).
 */
export const RESOLUTIONS = [
  { id: "sd", label: "SD", minShortSide: 0 },
  { id: "hd", label: "HD 720p", minShortSide: 720 },
  { id: "fhd", label: "Full HD 1080p", minShortSide: 1080 },
  { id: "qhd", label: "2K 1440p", minShortSide: 1440 },
  { id: "uhd", label: "4K", minShortSide: 2160 },
] as const;
export type ResolutionTier = (typeof RESOLUTIONS)[number]["id"];

/** Short side in pixels. Slightly cropped masters (e.g. 1920×1036) still count as their tier. */
export function shortSide(width?: number, height?: number): number | undefined {
  if (!width || !height) return undefined;
  return Math.min(width, height);
}

/** The tier a frame size reaches. 3% slack so 1920×1050 is still "1080p". */
export function resolutionTier(width?: number, height?: number): ResolutionTier | undefined {
  const s = shortSide(width, height);
  if (s === undefined) return undefined;
  let tier: ResolutionTier = "sd";
  for (const r of RESOLUTIONS) if (s >= r.minShortSide * 0.97) tier = r.id;
  return tier;
}

export function resolutionLabel(width?: number, height?: number): string | undefined {
  const t = resolutionTier(width, height);
  return t ? RESOLUTIONS.find((r) => r.id === t)!.label : undefined;
}

/** Video containers, the most widely playable first: the order downloads prefer. */
export const VIDEO_FORMATS = ["mp4", "m4v", "mov", "webm", "mkv", "ogv", "avi", "mpeg", "mpg", "m3u8"] as const;
export const IMAGE_FORMATS = ["jpg", "png", "webp", "gif"] as const;
export const OTHER_FORMATS = ["zip", "srt", "vtt", "json"] as const;

/** MIME types browsers recognise for <video>. */
export const VIDEO_MIME: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  ogv: "video/ogg",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  mpeg: "video/mpeg",
  mpg: "video/mpeg",
  m3u8: "application/vnd.apple.mpegurl",
};

/** Containers every modern browser plays in a <video> tag (h264/VP9/AV1 inside). */
export const BROWSER_PLAYABLE = new Set(["mp4", "m4v", "webm"]);
