/**
 * Markdown twins of the collection, hub and source pages (/clips/<slug>.md,
 * /clips.md, /sources/<id>.md), for agents and LLM crawlers. Same facts as
 * the HTML, plus the clip ids an agent can pass to GET /v1/clips/{id}.
 */
import { apiHref, collectionPath, countLabel, hubPath, latest, providerName, searchHref, sourcePath, sourceSearchHref, type Collection, type Hub, type SourcePage } from "./collections";
import { categoryName, fmt } from "./catalog";
import { SITE } from "./site";
import { VERDICT_LABELS, categoryLabel, durationText, formLabel, type Verdict } from "./vocab";

const abs = (path: string) => `${SITE.url}${path}`;
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
const day = (d?: Date) => d?.toISOString().slice(0, 10);
/** Root-relative Markdown links become absolute so the file works wherever it is read. */
const absolutize = (md: string) => md.replace(/\]\(\//g, `](${SITE.url}/`);
const footer = (path: string) => `\n---\nSource: ${abs(path)}\n`;

export function collectionMarkdown(c: Collection, related: Collection[]): string {
  const d = c.topic.data;
  const rows = c.clips.map((a) => {
    const facts = [categoryLabel(a.category), formLabel(a.form), a.bpm ? `${Math.round(a.bpm)} BPM` : "", a.key ?? "", durationText(a.durationSec)].filter(Boolean).join(", ");
    const verdict = a.license ? VERDICT_LABELS[a.license.verdict as Verdict] ?? a.license.verdict : "check the source";
    return `| [${cell(a.title)}](${a.url}) | \`${a.id}\` | ${cell(facts)} | ${providerName(a.provider)} | ${a.license?.name ?? "see source"} | ${verdict} | ${a.downloadable ? "yes" : "no"} |`;
  });
  return [
    `# ${d.title}`,
    "",
    `> ${d.description}`,
    "",
    `${countLabel(c.clips)} from ${c.sources.length} sources (${c.sources.map((s) => `${s.name} ${s.count}`).join(", ")})${c.updatedAt ? `, updated ${day(c.updatedAt)}` : ""}. Picked from a live search and refreshed daily.`,
    "",
    `- Same search in the browser: ${abs(searchHref(d.search))}`,
    `- Same search over the API: \`curl "${apiHref(d.search)}"\``,
    "- Details, files and the credit line: `GET " + SITE.url + "/v1/clips/{id}` with an id from the table below.",
    "- Licence verdicts: \"Commercial use OK\" (with or without credit) is cleared for a release; anything else must be checked or is non-commercial. See " + abs("/docs/licences.md"),
    "",
    absolutize(c.topic.body?.trim() ?? ""),
    "",
    "## Clips",
    "",
    "| Clip | id | What | Source | Licence | Commercial use | Direct download |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
    "## Questions",
    "",
    ...d.faq.flatMap((f) => [`**${f.q}**`, "", f.a, ""]),
    "## Related collections",
    "",
    ...related.map((r) => `- [${r.topic.data.title}](${abs(r.path)}.md): ${r.topic.data.description}`),
    footer(c.path),
  ].join("\n");
}

export function hubMarkdown(hub: Hub, cs: Collection[], hubs: Hub[], guides: { title: string; path: string; description: string }[] = []): string {
  const updated = latest(cs);
  return [
    `# ${hub.title}`,
    "",
    `> ${hub.description}`,
    "",
    hub.intro,
    "",
    ...(updated ? [`Updated ${day(updated)}.`, ""] : []),
    "## Collections",
    "",
    ...(cs.length ? cs.map((c) => `- [${c.topic.data.title}](${abs(c.path)}.md): ${countLabel(c.clips)} from ${c.sources.length} sources. ${c.topic.data.description}`) : ["No collections yet."]),
    "",
    ...(hub.sections ?? []).flatMap((sec) => [`## ${sec.heading}`, "", sec.body, ""]),
    ...(hub.faq?.length ? ["## Questions", "", ...hub.faq.flatMap((f) => [`**${f.q}**`, "", f.a, ""])] : []),
    ...(guides.length ? ["## Guides", "", ...guides.map((g) => `- [${g.title}](${abs(g.path)}.md): ${g.description}`), ""] : []),
    "## Other kinds",
    "",
    ...hubs.filter((h) => h.id !== hub.id).map((h) => `- [${h.title}](${abs(hubPath(h))}.md)`),
    footer(hubPath(hub)),
  ].join("\n");
}

export function indexMarkdown(all: Collection[], hubs: Hub[]): string {
  const updated = latest(all);
  return [
    "# Free clip collections",
    "",
    `> Curated collections of free music clips (drums, 808s, vocals, FX, ambience and instruments) from many clip sites, with a licence verdict on every sound, refreshed daily${updated ? ` (last change ${day(updated)})` : ""}. Each collection is a saved search; agents can run the same search with \`GET ${SITE.url}/v1/search\`.`,
    "",
    ...hubs.flatMap((hub) => {
      const cs = all.filter((c) => c.hub.id === hub.id);
      return cs.length ? [`## ${hub.title}`, "", `[All ${hub.name.toLowerCase()}](${abs(hubPath(hub))}.md)`, "", ...cs.map((c) => `- [${c.topic.data.title}](${abs(collectionPath(c.slug))}.md): ${c.topic.data.description}`), ""] : [];
    }),
    footer("/clips"),
  ].join("\n");
}

export function sourceMarkdown(s: SourcePage): string {
  const p = s.provider;
  const t = s.census;
  const facts = [
    `- Website: ${p.homepage}`,
    `- Best for: ${p.description}`,
    `- Categories: ${p.categories.map(categoryLabel).join(", ") || "various"}`,
    `- Pricing: ${p.pricing}`,
    `- Licence: ${p.license ?? "set per clip"}${p.licenseVerdict ? ` (${VERDICT_LABELS[p.licenseVerdict as Verdict] ?? p.licenseVerdict})` : ""}`,
    `- How it is searched: ${p.access === "link" ? "deep link only (results open the same search on the site)" : p.access}`,
    `- Direct download through Video Assets Server: ${p.supportsDownload ? "yes" : "no (results link to the clip page)"}`,
    ...(p.access !== "link" ? [`- Restrict a search to it: \`${SITE.url}/v1/search?q=...&providers=${p.id}\``] : []),
    ...(t
      ? [
          `- Listings counted ${t.countedAt.slice(0, 10)}: ${fmt(t.total, t.atLeast)}${t.unit === "packs" ? " packs" : ""}${t.free !== undefined ? `, ${fmt(t.free)} free` : ""}`,
          ...(Object.keys(t.byCategory).length
            ? [`- By category: ${Object.entries(t.byCategory).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${categoryName(k)} ${fmt(n)}`).join(", ")}`]
            : []),
        ]
      : []),
  ];
  const n = s.notes;
  return [
    `# ${p.name}`,
    "",
    `> ${p.name} as searched by Video Assets Server: ${p.description}`,
    "",
    ...facts,
    "",
    ...(n
      ? [
          "## What it is",
          "",
          n.about,
          "",
          "## Best for",
          "",
          n.bestFor,
          "",
          "## Licence",
          "",
          n.licence,
          "",
          "## How Video Assets Server searches it",
          "",
          n.searching,
          "",
          "## Example searches",
          "",
          ...n.examples.map((e) => `- [${e.label}](${abs(sourceSearchHref(p.id, e))})`),
          "",
          ...(n.guides?.length ? ["Guides: " + n.guides.map((g) => abs(`/guides/${g}.md`)).join(", "), ""] : []),
        ]
      : []),
    ...(s.collections.length
      ? ["## In these collections", "", ...s.collections.map(({ collection: c, count }) => `- [${c.topic.data.title}](${abs(c.path)}.md): ${count} of ${c.clips.length}`), ""]
      : []),
    ...(s.clips.length ? ["## Examples", "", ...s.clips.map((a) => `- [${a.title}](${a.url}) (\`${a.id}\`, ${a.license?.name ?? "licence on the source page"})`), ""] : []),
    `All sources: ${SITE.url}/docs/sources.md`,
    footer(sourcePath(p.id)),
  ].join("\n");
}
