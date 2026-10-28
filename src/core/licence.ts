/**
 * Licences for video clips, and the one question an agent has to answer:
 * "can this go into a video I publish commercially (an ad, a monetised
 * channel, a client project)?"
 *
 * Every provider builds its License through these helpers so the verdicts are
 * decided in one place (see test/licence.test.ts for the table).
 */
import type { CommercialVerdict, License, Clip } from "./types.js";

type Base = Omit<License, "assertedBy">;

const CC = "https://creativecommons.org";

/** Known licences, keyed by SPDX id (or LicenseRef-* for the rest). */
export const LICENSES = {
  "CC0-1.0": {
    id: "CC0-1.0",
    name: "CC0 1.0",
    url: `${CC}/publicdomain/zero/1.0/`,
    commercialUse: true,
    attributionRequired: false,
    redistribution: true,
    verdict: "yes",
  },
  "CC-PDM-1.0": {
    id: "CC-PDM-1.0",
    name: "Public domain",
    url: `${CC}/publicdomain/mark/1.0/`,
    commercialUse: true,
    attributionRequired: false,
    redistribution: true,
    verdict: "yes",
  },
  "LicenseRef-US-Gov-PD": {
    id: "LicenseRef-US-Gov-PD",
    name: "Public domain (US government work)",
    url: "https://www.usa.gov/government-copyright",
    commercialUse: true,
    attributionRequired: false,
    redistribution: true,
    verdict: "yes",
    note: "Made by a US federal agency, so not copyrighted in the US. People, logos and trademarks in frame still need releases for advertising.",
  },
  "LicenseRef-NASA-Media": {
    id: "LicenseRef-NASA-Media",
    name: "NASA media (public domain in the US)",
    url: "https://www.nasa.gov/nasa-brand-center/images-and-media/",
    commercialUse: true,
    attributionRequired: true,
    redistribution: true,
    editorial: true,
    verdict: "yes-with-credit",
    note: "Generally not copyrighted in the US; credit NASA. Do not imply NASA endorses you, do not use the NASA insignia or logotype, and get permission before using identifiable astronauts or staff in ads. Some items are third-party copyrighted: check the credit line.",
  },
  Unlicense: {
    id: "Unlicense",
    name: "The Unlicense",
    url: "https://unlicense.org/",
    commercialUse: true,
    attributionRequired: false,
    redistribution: true,
    verdict: "yes",
  },
  "LicenseRef-Personal-Use-Only": {
    id: "LicenseRef-Personal-Use-Only",
    name: "Personal use only",
    commercialUse: false,
    redistribution: false,
    verdict: "no",
    note: "Personal, non-commercial use only.",
  },
  "LicenseRef-All-Rights-Reserved": {
    id: "LicenseRef-All-Rights-Reserved",
    name: "All rights reserved",
    commercialUse: false,
    redistribution: false,
    verdict: "no",
    note: "The rights holder reserves all rights: you need their permission.",
  },
  "LicenseRef-Unknown": {
    id: "LicenseRef-Unknown",
    name: "No licence stated",
    verdict: "check-terms",
    note: "The source states no licence. Treat it as all rights reserved until you find one.",
  },
} as const satisfies Record<string, Base>;

export type KnownLicenseId = keyof typeof LICENSES;

/** Attach who asserted it, optionally with a source-specific note. */
export function license(id: KnownLicenseId, assertedBy: License["assertedBy"] = "source", note?: string): License {
  return applyAssertion({ ...LICENSES[id], assertedBy, ...(note ? { note } : {}) });
}

/**
 * A Creative Commons licence from its parts. `version` like "4.0", "3.0".
 * Verdicts: BY → yes-with-credit, SA → restricted (the whole video must be
 * released under the same licence), NC or ND → no (editing an ND clip into a
 * video makes a derivative work).
 */
export function creativeCommons(
  parts: { nc?: boolean; nd?: boolean; sa?: boolean },
  version = "4.0",
  assertedBy: License["assertedBy"] = "source",
): License {
  const slug = ["by", parts.nc && "nc", parts.nd && "nd", parts.sa && "sa"].filter(Boolean).join("-");
  const id = `CC-${slug.toUpperCase()}-${version}`;
  const name = `CC ${slug.toUpperCase().replace(/-/g, "-")} ${version}`;
  let verdict: CommercialVerdict = "yes-with-credit";
  let note: string | undefined = "Credit the author in your video description or end credits.";
  if (parts.nc) {
    verdict = "no";
    note = "Non-commercial only.";
  } else if (parts.nd) {
    verdict = "no";
    note = "No derivatives: cutting it into your own video counts as a derivative.";
  } else if (parts.sa) {
    verdict = "restricted";
    note = "Share-alike: a video that uses it must be released under the same CC licence.";
  }
  return applyAssertion({
    id,
    name,
    url: `${CC}/licenses/${slug}/${version}/`,
    commercialUse: !parts.nc,
    attributionRequired: true,
    shareAlike: parts.sa || undefined,
    redistribution: !parts.nd,
    verdict,
    note,
    assertedBy,
  });
}

/**
 * A site's own free stock licence: usable in your videos, but the clips may
 * not be re-uploaded or sold as stock footage.
 */
export function royaltyFree(
  name: string,
  opts: { url?: string; attributionRequired?: boolean; note?: string; assertedBy?: License["assertedBy"] } = {},
): License {
  const slug = name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return applyAssertion({
    id: `LicenseRef-${slug}`,
    name,
    url: opts.url,
    commercialUse: true,
    attributionRequired: opts.attributionRequired ?? false,
    redistribution: false,
    verdict: opts.attributionRequired ? "yes-with-credit" : "yes",
    note: opts.note ?? "Free to use in your videos; do not re-upload or sell the clips themselves.",
    assertedBy: opts.assertedBy ?? "site",
  });
}

/** A licence we can't classify: name it and tell the user to read it. */
export function customLicense(name: string, opts: { url?: string; verdict?: CommercialVerdict; note?: string; commercialUse?: boolean; attributionRequired?: boolean; assertedBy?: License["assertedBy"] } = {}): License {
  const slug = name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return applyAssertion({
    id: `LicenseRef-${slug || "Custom"}`,
    name,
    url: opts.url,
    commercialUse: opts.commercialUse,
    attributionRequired: opts.attributionRequired,
    redistribution: false,
    verdict: opts.verdict ?? "check-terms",
    note: opts.note ?? "Read the licence on the source page before using it.",
    assertedBy: opts.assertedBy ?? "site",
  });
}

/** An uploader's claim is never treated as a clean "yes": cap it at check-terms. */
function applyAssertion(l: License): License {
  if (l.assertedBy === "uploader" && (l.verdict === "yes" || l.verdict === "yes-with-credit")) {
    return {
      ...l,
      verdict: "check-terms",
      note: `Uploader states ${l.name}, which the source does not verify. ${l.note ?? ""}`.trim(),
    };
  }
  return l;
}

/**
 * Parse a licence URL or name as written by the source: Creative Commons URLs
 * ("https://creativecommons.org/licenses/by-nc/4.0/"), plain names
 * ("Attribution NonCommercial", "Creative Commons 0"), Openverse codes ("by-sa"),
 * Wikimedia short names ("CC BY-SA 4.0", "Public domain").
 * Returns undefined when nothing matches.
 */
export function parseLicense(input: string | undefined | null, assertedBy: License["assertedBy"] = "source"): License | undefined {
  if (!input) return undefined;
  const s = input.trim().toLowerCase();
  if (!s) return undefined;

  if (/\bunlicen[cs]e\b/.test(s)) return license("Unlicense", assertedBy);
  if (/personal (use )?only|private use only|for personal use/.test(s)) return license("LicenseRef-Personal-Use-Only", assertedBy);
  if (/all rights reserved|copyrighted|\(c\)|©/.test(s) && !/creativecommons|cc[\s-]?by|public ?domain/.test(s)) return license("LicenseRef-All-Rights-Reserved", assertedBy);
  if (/publicdomain\/zero|\bcc0\b|cc-?zero|creative commons 0/.test(s)) return license("CC0-1.0", assertedBy);
  if (/publicdomain\/mark|public ?domain|\bpdm\b|^pd\b|\bpd-/.test(s)) return license("CC-PDM-1.0", assertedBy);

  const url = /licenses\/([a-z-]+)\/(\d\.\d)/.exec(s);
  if (url) return ccFromSlug(url[1]!, url[2]!, assertedBy);

  const version = /(\d\.\d)/.exec(s)?.[1] ?? (/\b4\b/.test(s) ? "4.0" : /\b3\b/.test(s) ? "3.0" : undefined);
  const hasBy = /\bby\b|attribution/.test(s);
  if (hasBy) {
    return creativeCommons(
      {
        nc: /\bnc\b|non-?commercial/.test(s),
        nd: /\bnd\b|no ?deriv/.test(s),
        sa: /\bsa\b|share ?alike/.test(s),
      },
      version ?? "4.0",
      assertedBy,
    );
  }
  return undefined;
}

function ccFromSlug(slug: string, version: string, assertedBy: License["assertedBy"]): License | undefined {
  const parts = slug.split("-");
  if (parts[0] !== "by") return undefined;
  return creativeCommons({ nc: parts.includes("nc"), nd: parts.includes("nd"), sa: parts.includes("sa") }, version, assertedBy);
}

export const COMMERCIAL_SAFE: ReadonlySet<CommercialVerdict> = new Set(["yes", "yes-with-credit"]);

export function isCommercialSafe(l: License | undefined): boolean {
  return !!l && COMMERCIAL_SAFE.has(l.verdict);
}

/** "“Ocean waves at dusk” by Jane (Wikimedia Commons), https://…, licensed under CC BY 4.0 (https://…)" */
export function attributionLine(s: Pick<Clip, "title" | "author" | "url" | "provider" | "license">, sourceName?: string): string | undefined {
  const l = s.license;
  if (!l || !l.attributionRequired) return undefined;
  const by = s.author ? ` by ${s.author}` : "";
  const from = sourceName ? ` (${sourceName})` : "";
  const lic = l.url ? `${l.name} (${l.url})` : l.name;
  return `“${s.title}”${by}${from}, ${s.url}, licensed under ${lic}`;
}

/** Plain-language badge text for each verdict. */
export const VERDICT_LABELS: Record<CommercialVerdict, string> = {
  yes: "Commercial use OK",
  "yes-with-credit": "Commercial use OK with credit",
  restricted: "Restricted: read the conditions",
  "clearance-required": "Needs a paid licence or releases",
  "check-terms": "Unclear: check the terms",
  no: "Non-commercial only",
};

/**
 * Mark a licence editorial-only: fine for news, documentary and education,
 * not cleared for advertising (people, logos or insignia without releases).
 */
export function asEditorial(l: License, why: string): License {
  return { ...l, editorial: true, note: [l.note, why].filter(Boolean).join(" ") };
}
