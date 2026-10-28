import type { Category, ClipQuery, License, Pricing, Provider } from "../core/types.js";

export interface LinkProviderSpec {
  id: string;
  name: string;
  homepage: string;
  description: string;
  categories: Category[];
  pricing: Pricing;
  license?: License;
  /** Env var of the source's own API key, when it has an API we could use later. */
  apiKeyEnv?: string;
  buildSearchUrl(q: ClipQuery): string;
}

/**
 * Provider for sites we only deep-link to: paid or partner-only APIs, APIs
 * that need a key we don't have yet, bot walls, or terms that forbid
 * aggregation or automated access. Search returns no clips, only a link to
 * the same search on the site, so agents and people can continue there.
 */
export function linkProvider(spec: LinkProviderSpec): Provider {
  return {
    ...spec,
    access: "link",
    supportsDownload: false,
    async search(q) {
      return { clips: [], searchUrl: spec.buildSearchUrl(q) };
    },
  };
}

/** The words to put in a site's search box (the facts we parsed out are added back as words where they help). */
export function linkTerms(q: ClipQuery, opts: { orientation?: boolean; resolution?: boolean } = {}): string {
  const parts = [q.query.trim()];
  if (opts.orientation !== false && q.orientations?.length === 1 && q.orientations[0] !== "landscape") parts.push(q.orientations[0] === "portrait" ? "vertical" : "square");
  if (opts.resolution !== false && q.minResolution && q.minResolution >= 2160) parts.push("4k");
  for (const s of q.styles ?? []) if (s === "timelapse" || s === "slow-motion") parts.push(s === "timelapse" ? "timelapse" : "slow motion");
  return parts.filter(Boolean).join(" ");
}

/** "drone ocean sunset" → "drone-ocean-sunset" (path-style search URLs). */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}
