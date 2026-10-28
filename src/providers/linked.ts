/**
 * Video sites we only deep-link to (checked 2026-10-26; details in
 * docs/research/sources.md). Each is link-only for a stated reason:
 *
 * - Pexels, Pixabay: good free APIs, but they need a key (Pexels has paused
 *   new keys) and their terms forbid "competing services". Kept link-only
 *   until we have keys and their blessing.
 * - Coverr: API needs a key, demo quota is 50 requests/hour, and its licence
 *   bans "similar or competing" services.
 * - Mixkit (Envato): terms 9.4–9.10 forbid aggregating, framing and bots.
 * - Freepik/Magnific (now hosting Videvo and Mazwai), Vecteezy, Videezy:
 *   paid APIs or terms against scraping and aggregation.
 * - Shutterstock, Adobe Stock, Getty Images, iStock, Storyblocks, Pond5,
 *   Envato Elements, Artgrid: paid libraries with partner-only APIs.
 * - Europeana, Library of Congress: open footage, but the APIs need a key
 *   (Europeana) or block cloud IPs on search (LoC): v1.1 candidates.
 * - ActionVFX, ProductionCrate: VFX elements behind accounts and daily caps.
 *
 * Every `buildSearchUrl` is the URL the site's own search produces. Where a
 * site has URL parameters for orientation or resolution they are set.
 */
import { customLicense, royaltyFree } from "../core/licence.js";
import type { Category, ClipQuery, License } from "../core/types.js";
import { qs } from "../core/util.js";
import { linkProvider, linkTerms, slug } from "./link.js";

const ALL: Category[] = ["nature", "city", "people", "aerial", "space", "science", "tech", "transport", "food", "background", "overlay", "greenscreen", "archive"];
const STOCK: Category[] = ["nature", "city", "people", "aerial", "tech", "transport", "food", "background", "overlay", "greenscreen"];

const one = <T>(xs: T[] | undefined): T | undefined => (xs?.length === 1 ? xs[0] : undefined);

/** A paid stock library: commercial use once you buy the licence. */
function paidStock(name: string, url: string): License {
  return customLicense(`${name} licence (paid)`, {
    url,
    verdict: "clearance-required",
    commercialUse: true,
    note: "Royalty-free after you buy a licence for each clip (or hold a subscription). Editorial-only clips are marked on the site.",
  });
}

// ---------------------------------------------------------------------------
// Free stock sites (key needed, or terms against aggregation)
// ---------------------------------------------------------------------------

export const pexels = linkProvider({
  id: "pexels",
  name: "Pexels",
  homepage: "https://www.pexels.com/videos/",
  description:
    "Hundreds of thousands of free stock videos up to 4K, many vertical; Pexels licence (no credit needed). Link-only for now: its API needs a key (new keys paused) and its terms forbid competing services.",
  categories: STOCK,
  pricing: "free",
  apiKeyEnv: "PEXELS_API_KEY",
  license: royaltyFree("Pexels License", { url: "https://www.pexels.com/license/", note: "Free for commercial use, no credit needed. Don't sell unaltered copies, don't imply endorsement by people shown." }),
  buildSearchUrl(q) {
    const text = linkTerms(q, { orientation: false, resolution: false });
    const orientation = one(q.orientations);
    const size = q.minResolution ? (q.minResolution >= 2160 ? "large" : q.minResolution >= 1080 ? "medium" : "small") : undefined;
    const base = text ? `https://www.pexels.com/search/videos/${encodeURIComponent(text)}/` : "https://www.pexels.com/videos/";
    return `${base}${qs({ orientation, size })}`;
  },
});

export const pixabay = linkProvider({
  id: "pixabay",
  name: "Pixabay",
  homepage: "https://pixabay.com/videos/",
  description:
    "Hundreds of thousands of free stock videos and motion backgrounds up to 4K; Pixabay Content License (no credit needed). Link-only for now: its API needs a key and its terms limit automated use.",
  categories: STOCK,
  pricing: "free",
  apiKeyEnv: "PIXABAY_API_KEY",
  license: royaltyFree("Pixabay Content License", { url: "https://pixabay.com/service/license-summary/", note: "Free for commercial use, no credit needed. Don't sell unaltered copies or redistribute them on stock sites." }),
  buildSearchUrl(q) {
    const text = linkTerms(q);
    return text ? `https://pixabay.com/videos/search/${encodeURIComponent(text)}/` : "https://pixabay.com/videos/";
  },
});

export const coverr = linkProvider({
  id: "coverr",
  name: "Coverr",
  homepage: "https://coverr.co",
  description: "A few thousand free, hand-picked stock videos for websites and social media. Link-only: its API needs a key and its licence bans competing services.",
  categories: STOCK,
  pricing: "free",
  apiKeyEnv: "COVERR_API_KEY",
  license: royaltyFree("Coverr License", { url: "https://coverr.co/license" }),
  buildSearchUrl(q) {
    const text = linkTerms(q);
    return text ? `https://coverr.co/s${qs({ q: text })}` : "https://coverr.co/stock-video-footage";
  },
});

export const mixkit = linkProvider({
  id: "mixkit",
  name: "Mixkit",
  homepage: "https://mixkit.co/free-stock-video/",
  description: "Free stock videos from Envato, no credit needed. Link-only: its terms forbid aggregating its items, framing and bots.",
  categories: STOCK,
  pricing: "free",
  license: royaltyFree("Mixkit Stock Video Free License", { url: "https://mixkit.co/license/#videoFree" }),
  buildSearchUrl(q) {
    const s = slug(linkTerms(q));
    return s ? `https://mixkit.co/free-stock-video/${s}/` : "https://mixkit.co/free-stock-video/";
  },
});

export const freepik = linkProvider({
  id: "freepik",
  name: "Freepik videos (Videvo)",
  homepage: "https://www.freepik.com/videos",
  description: "Freepik's (now Magnific) video library, which absorbed Videvo and Mazwai: free clips with credit plus premium footage.",
  categories: STOCK,
  pricing: "freemium",
  license: customLicense("Freepik licence", { url: "https://www.freepik.com/legal/terms-of-use", verdict: "check-terms", note: "Free clips need credit; premium clips need a subscription. Check each clip's licence." }),
  buildSearchUrl(q) {
    const text = linkTerms(q);
    return `https://www.freepik.com/search${qs({ format: "search", query: text || undefined, type: "video" })}`;
  },
});

export const vecteezy = linkProvider({
  id: "vecteezy",
  name: "Vecteezy",
  homepage: "https://www.vecteezy.com/free-videos",
  description: "Free (with credit) and Pro stock videos and motion backgrounds.",
  categories: STOCK,
  pricing: "freemium",
  license: customLicense("Vecteezy licence", { url: "https://www.vecteezy.com/licensing-agreement", verdict: "check-terms", note: "Free clips need credit and limit the project budget; Pro clips need a plan." }),
  buildSearchUrl(q) {
    const s = slug(linkTerms(q));
    return s ? `https://www.vecteezy.com/free-videos/${s}` : "https://www.vecteezy.com/free-videos";
  },
});

export const videezy = linkProvider({
  id: "videezy",
  name: "Videezy",
  homepage: "https://www.videezy.com",
  description: "Free stock footage and motion backgrounds (credit required on free clips), plus Pro clips.",
  categories: STOCK,
  pricing: "freemium",
  license: customLicense("Videezy licence", { url: "https://www.videezy.com/terms", verdict: "check-terms", note: "Free clips need credit; Pro clips need a licence." }),
  buildSearchUrl(q) {
    const s = slug(linkTerms(q));
    return s ? `https://www.videezy.com/free-video/${s}` : "https://www.videezy.com";
  },
});

// ---------------------------------------------------------------------------
// Open archives (v1.1 candidates)
// ---------------------------------------------------------------------------

export const europeana = linkProvider({
  id: "europeana",
  name: "Europeana",
  homepage: "https://www.europeana.eu",
  description: "European archives' films and newsreels; about 13k videos are openly reusable. Link-only until we add its API key.",
  categories: ["archive", "people", "city", "transport"],
  pricing: "free",
  apiKeyEnv: "EUROPEANA_API_KEY",
  buildSearchUrl(q) {
    return `https://www.europeana.eu/en/search${qs({ query: linkTerms(q) || "*", "qf": 'TYPE:"VIDEO"', reusability: "open" })}`;
  },
});

export const loc = linkProvider({
  id: "loc",
  name: "Library of Congress",
  homepage: "https://www.loc.gov/film-and-videos/",
  description: "Early films, newsreels and government footage, much of it public domain. Link-only: its search API is rate-limited and challenges cloud IPs.",
  categories: ["archive", "people", "city", "transport"],
  pricing: "free",
  buildSearchUrl(q) {
    return `https://www.loc.gov/film-and-videos/${qs({ q: linkTerms(q) || undefined })}`;
  },
});

// ---------------------------------------------------------------------------
// VFX elements
// ---------------------------------------------------------------------------

export const actionvfx = linkProvider({
  id: "actionvfx",
  name: "ActionVFX",
  homepage: "https://www.actionvfx.com",
  description: "Professional VFX stock elements (fire, smoke, explosions, muzzle flashes) with a free practice library; account required.",
  categories: ["overlay", "greenscreen"],
  pricing: "freemium",
  license: paidStock("ActionVFX", "https://www.actionvfx.com/license"),
  buildSearchUrl(q) {
    return `https://www.actionvfx.com/search${qs({ q: linkTerms(q) || undefined })}`;
  },
});

export const productioncrate = linkProvider({
  id: "productioncrate",
  name: "ProductionCrate (FootageCrate)",
  homepage: "https://footagecrate.com",
  description: "VFX elements, transitions and overlays; free tier with daily download caps.",
  categories: ["overlay", "greenscreen", "background"],
  pricing: "freemium",
  license: paidStock("ProductionCrate", "https://www.productioncrate.com/license"),
  buildSearchUrl(q) {
    return `https://footagecrate.com/search${qs({ q: linkTerms(q) || undefined })}`;
  },
});

// ---------------------------------------------------------------------------
// Paid libraries
// ---------------------------------------------------------------------------

export const shutterstock = linkProvider({
  id: "shutterstock",
  name: "Shutterstock",
  homepage: "https://www.shutterstock.com/video",
  description: "One of the largest paid footage libraries (also owns Pond5); 4K and HD clips per clip or by subscription.",
  categories: ALL,
  pricing: "paid",
  license: paidStock("Shutterstock", "https://www.shutterstock.com/license"),
  buildSearchUrl(q) {
    const s = slug(linkTerms(q, { resolution: false }));
    return `${s ? `https://www.shutterstock.com/video/search/${s}` : "https://www.shutterstock.com/video"}${qs({ resolution: q.minResolution && q.minResolution >= 2160 ? "4k" : undefined })}`;
  },
});

export const adobestock = linkProvider({
  id: "adobestock",
  name: "Adobe Stock",
  homepage: "https://stock.adobe.com/video",
  description: "Adobe's paid footage library, built into Premiere Pro and After Effects.",
  categories: ALL,
  pricing: "paid",
  license: paidStock("Adobe Stock", "https://stock.adobe.com/license-terms"),
  buildSearchUrl(q) {
    return `https://stock.adobe.com/search/video${qs({ k: linkTerms(q) || undefined })}`;
  },
});

export const gettyimages = linkProvider({
  id: "gettyimages",
  name: "Getty Images",
  homepage: "https://www.gettyimages.com/footage",
  description: "Premium creative and editorial (news, sport, archive) footage.",
  categories: ALL,
  pricing: "paid",
  license: paidStock("Getty Images", "https://www.gettyimages.com/eula"),
  buildSearchUrl(q) {
    return `https://www.gettyimages.com/search/2/film${qs({ phrase: linkTerms(q) || undefined })}`;
  },
});

export const istock = linkProvider({
  id: "istock",
  name: "iStock",
  homepage: "https://www.istockphoto.com/stock-videos",
  description: "Getty's lower-priced stock library: footage by credit or subscription.",
  categories: STOCK,
  pricing: "paid",
  license: paidStock("iStock", "https://www.istockphoto.com/legal/license-agreement"),
  buildSearchUrl(q) {
    return `https://www.istockphoto.com/search/2/film${qs({ phrase: linkTerms(q) || undefined })}`;
  },
});

export const storyblocks = linkProvider({
  id: "storyblocks",
  name: "Storyblocks",
  homepage: "https://www.storyblocks.com/video",
  description: "Subscription footage, motion backgrounds and templates with unlimited downloads.",
  categories: STOCK,
  pricing: "paid",
  license: paidStock("Storyblocks", "https://www.storyblocks.com/license"),
  buildSearchUrl(q) {
    const s = slug(linkTerms(q));
    return s ? `https://www.storyblocks.com/video/search/${s}` : "https://www.storyblocks.com/video";
  },
});

export const pond5 = linkProvider({
  id: "pond5",
  name: "Pond5",
  homepage: "https://www.pond5.com",
  description: "A large footage marketplace, including archival and public-domain collections (Shutterstock-owned).",
  categories: ALL,
  pricing: "paid",
  license: paidStock("Pond5", "https://www.pond5.com/legal/license"),
  buildSearchUrl(q) {
    const s = slug(linkTerms(q));
    return s ? `https://www.pond5.com/stock-footage/1/${s}.html` : "https://www.pond5.com/stock-footage/";
  },
});

export const envato = linkProvider({
  id: "envato",
  name: "Envato Elements",
  homepage: "https://elements.envato.com/stock-video",
  description: "Subscription stock video, motion graphics and templates (unlimited downloads).",
  categories: STOCK,
  pricing: "paid",
  license: paidStock("Envato Elements", "https://elements.envato.com/license-terms"),
  buildSearchUrl(q) {
    const s = slug(linkTerms(q));
    return s ? `https://elements.envato.com/stock-video/${s}` : "https://elements.envato.com/stock-video";
  },
});

export const artgrid = linkProvider({
  id: "artgrid",
  name: "Artgrid",
  homepage: "https://artgrid.io",
  description: "Cinematic subscription footage shot by filmmakers, including RAW and LOG masters.",
  categories: STOCK,
  pricing: "paid",
  license: paidStock("Artgrid", "https://artgrid.io/license"),
  buildSearchUrl(q: ClipQuery) {
    return `https://artgrid.io/search${qs({ term: linkTerms(q) || undefined })}`;
  },
});

/** In the order they are listed after the searchable sources: free first, then archives, VFX, paid. */
export const linkedProviders = [
  pexels,
  pixabay,
  coverr,
  mixkit,
  freepik,
  vecteezy,
  videezy,
  europeana,
  loc,
  actionvfx,
  productioncrate,
  shutterstock,
  adobestock,
  gettyimages,
  istock,
  storyblocks,
  pond5,
  envato,
  artgrid,
];
