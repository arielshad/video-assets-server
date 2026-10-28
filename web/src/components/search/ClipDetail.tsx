import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, Bot, Check, Copy, Download, FileText, FileVideo, Info, Loader2, Lock, Scissors, Share2, Terminal, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CopyButton } from "@/components/home/AgentSetup";
import { MCP_NAME } from "@/lib/site";
import { cn } from "@/lib/utils";
import {
  EDITORIAL_MEANING,
  VERDICT_MEANING,
  categoryPath,
  durationText,
  fpsText,
  orientationLabel,
  resolutionLabel,
  styleLabel,
  verdictTone,
  type Verdict,
} from "@/lib/vocab";
import { api, clipBase, formatBytes, getKey, safeUrl, slugName, type Clip, type ClipDetails, type ClipFile } from "./api";
import { TONE_CLASS, VerdictBadge } from "./VerdictBadge";

const ROLE_LABEL: Record<ClipFile["role"], string> = { original: "Original", rendition: "Rendition", preview: "Preview", poster: "Poster", captions: "Captions" };
const ROLE_ORDER: Record<string, number> = { original: 0, rendition: 1, preview: 2, captions: 3, poster: 4 };
const shortSide = (f: { width?: number; height?: number }) => (f.width && f.height ? Math.min(f.width, f.height) : undefined);

/**
 * The player: a real <video controls> on the source's file (`watch` from
 * /v1/clips/{id}, else the search preview). It streams from the source's CDN,
 * never through this server. When the source refuses or the browser can't
 * decode it, a message links to the source page instead.
 */
function Player({ clip, details, providerName }: { clip: Clip; details: ClipDetails | null; providerName: string }) {
  const watch = details?.watch ?? (clip.previewUrl ? { url: clip.previewUrl, type: clip.previewType } : undefined);
  const src = safeUrl(watch?.url);
  const poster = safeUrl(clip.posterUrl);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const w = details?.watch?.width ?? clip.width;
  const h = details?.watch?.height ?? clip.height;
  const tall = Boolean(w && h && h > w);
  const source = safeUrl(clip.url);
  return (
    <figure className="overflow-hidden rounded-xl border bg-black">
      <div className={cn("relative mx-auto w-full", tall ? "aspect-[9/16] max-h-[65vh] max-w-[min(100%,calc(65vh*9/16))]" : "aspect-video")}>
        {src && !failed ? (
          <video
            key={src}
            controls
            playsInline
            preload="metadata"
            poster={poster}
            onError={() => setFailed(true)}
            className="absolute inset-0 size-full bg-black object-contain"
            aria-label={`Video: ${clip.title}`}
          >
            <source src={src} type={watch?.type} onError={() => setFailed(true)} />
          </video>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950 p-6 text-center text-sm text-zinc-300">
            {poster && <img src={poster} alt="" referrerPolicy="no-referrer" className="absolute inset-0 size-full object-contain opacity-30" />}
            {!details && !src ? (
              <Loader2 className="relative size-6 animate-spin" aria-label="Loading the player" />
            ) : (
              <span className="relative max-w-sm">
                {failed ? "This video can't be played here: the source refused it or your browser can't decode its format." : "This source has no playable file for the browser."}{" "}
                {source && (
                  <a href={source} target="_blank" rel="noopener noreferrer" className="font-medium text-white underline underline-offset-2">
                    Watch it on {providerName} ↗
                  </a>
                )}
              </span>
            )}
          </div>
        )}
      </div>
      {src && !failed && (
        <figcaption className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-zinc-950 px-3 py-1.5 text-[11px] text-zinc-400">
          <span>
            Streaming from {new URL(src).hostname}
            {details?.watch?.width ? ` · ${details.watch.width}×${details.watch.height}` : ""}
          </span>
          <span>Nothing passes through this server</span>
        </figcaption>
      )}
    </figure>
  );
}

function LightCopy({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() =>
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        })
      }
    >
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {done ? "Copied" : label}
    </Button>
  );
}

/**
 * Where a rendition's Download button points: the server's download endpoint
 * (a 302 to the same file on the source, so it is counted and gets licence
 * headers), or the file itself when a role/format/height can't single it out
 * or the server needs an API key (a redirect can't carry the key header).
 */
function downloadHref(clip: Clip, f: ClipFile, files: ClipFile[]): string | undefined {
  const direct = safeUrl(f.url);
  if (getKey() || f.requiresAuth) return direct;
  const s = shortSide(f);
  const same = files.filter((x) => x.role === f.role && x.format === f.format);
  // The server picks the smallest file of this role and format that reaches `height`: make sure that is this one.
  const unique = s === undefined ? same.length === 1 : same.filter((x) => (shortSide(x) ?? 0) >= s * 0.97 && (shortSide(x) ?? Infinity) <= s).length === 1;
  if (!unique) return direct;
  const p = new URLSearchParams({ role: f.role, format: f.format });
  if (s) p.set("height", String(s));
  return `${clipBase(clip.id)}/download?${p}`;
}

export function ClipDetail({ clip, providerName }: { clip: Clip; providerName: string }) {
  const [full, setFull] = useState<ClipDetails | null>(null);
  const [failed, setFailed] = useState<string>();

  useEffect(() => {
    setFull(null);
    setFailed(undefined);
    const ctrl = new AbortController();
    api<ClipDetails>(clipBase(clip.id), { signal: ctrl.signal })
      .then(setFull)
      .catch((e: Error) => !ctrl.signal.aborted && setFailed(e.message));
    return () => ctrl.abort();
  }, [clip.id]);

  const c: Clip = full ?? clip;
  const files = full?.files ?? [];
  const videos = useMemo(
    () =>
      files
        .filter((f) => f.role !== "poster")
        .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) || (shortSide(b) ?? 0) - (shortSide(a) ?? 0)),
    [files],
  );
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const base = clipBase(clip.id);
  const shareUrl = full?.shareUrl ?? `${origin}/search?clip=${encodeURIComponent(clip.id)}`;
  const source = safeUrl(c.url);
  const verdict = (c.license?.verdict ?? "check-terms") as Verdict;
  const tone = verdictTone(verdict);
  const name = slugName(c.title);
  const best = videos.find((f) => f.role !== "captions" && !f.requiresAuth);
  const want = Math.min(1080, shortSide(c) ?? 1080);
  const curl = `curl -L -o "${name}.${best?.format ?? "mp4"}" "${origin}${base}/download?height=${want}"`;
  // Cut from the smallest file that reaches 1080p (ffmpeg seeks over HTTP, so only that part is read).
  const cutFrom =
    videos.filter((f) => f.role !== "captions" && !f.requiresAuth && (shortSide(f) ?? 0) >= 1080 * 0.97).sort((a, b) => (shortSide(a) ?? 0) - (shortSide(b) ?? 0))[0] ?? best;
  const trimSrc = cutFrom?.url ?? full?.watch?.url ?? c.previewUrl ?? `${origin}${base}/download?height=${want}`;
  const ffmpeg = `ffmpeg -ss 2 -i "${trimSrc}" -t 5 -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -an "${name}-5s.mp4"`;
  const prompt = `Use the ${MCP_NAME} MCP server: get_video("${clip.id}"), check its licence verdict${c.license?.editorial ? " and the editorial flag" : ""}, download the ${want}p file into ./footage (download_video locally, or curl its selection.downloadUrl) and add the credit line to CREDITS.md if one is needed.`;
  const credit = c.attribution;

  const facts: [string, React.ReactNode][] = [
    ["Resolution", c.width && c.height ? `${c.width}×${c.height}${resolutionLabel(c.width, c.height) ? ` (${resolutionLabel(c.width, c.height)})` : ""}` : undefined],
    ["Orientation", orientationLabel(c.orientation) || undefined],
    ["Frame rate", fpsText(c.fps) || undefined],
    ["Duration", durationText(c.durationSec) || undefined],
    ["Audio", c.hasAudio === undefined ? undefined : c.hasAudio ? "Yes (sound track)" : "No sound"],
    ["Year", c.year ? String(c.year) : undefined],
    ["Category", categoryPath(c.category)],
    ["Style", c.styles?.length ? c.styles.map(styleLabel).join(", ") : undefined],
    ["Formats", c.formats?.length ? c.formats.join(", ").toUpperCase() : undefined],
    ["Source", source ? <a className="text-primary hover:underline" href={source} target="_blank" rel="noopener noreferrer">{providerName}</a> : providerName],
    [
      "Author",
      c.author ? (
        safeUrl(c.authorUrl) ? (
          <a className="text-primary hover:underline" href={safeUrl(c.authorUrl)} target="_blank" rel="noopener noreferrer">{c.author}</a>
        ) : (
          c.author
        )
      ) : undefined,
    ],
    ["Clip id", <code className="break-all font-mono text-xs">{c.id}</code>],
  ];

  return (
    <div className="space-y-6 px-4 pb-10 sm:px-6">
      <Player clip={c} details={full} providerName={providerName} />

      <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
        {facts
          .filter(([, v]) => v !== undefined && v !== "")
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="min-w-0">{v}</dd>
            </div>
          ))}
      </dl>

      {/* Licence */}
      <section aria-labelledby="licence-h" className={cn("rounded-xl border p-4", TONE_CLASS[tone].replace(/text-\S+/, ""))}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="licence-h" className="font-medium">Can I use it in a commercial video?</h3>
          <VerdictBadge license={c.license} size="lg" />
        </div>
        <p className="mt-2 text-sm leading-relaxed">{VERDICT_MEANING[verdict] ?? ""}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Licence:{" "}
          {c.license ? (
            safeUrl(c.license.url) ? (
              <a className="text-primary hover:underline" href={safeUrl(c.license.url)} target="_blank" rel="noopener noreferrer">{c.license.name}</a>
            ) : (
              c.license.name
            )
          ) : (
            "not stated by the source"
          )}
          {c.license?.redistribution === false && " · don't re-upload or sell the clip itself"}
        </p>
        {c.license?.note && <p className="mt-1 text-sm text-muted-foreground">{c.license.note}</p>}
        {c.license?.editorial && (
          <p className="mt-3 flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            <span>
              <strong className="font-medium">Editorial use.</strong> {EDITORIAL_MEANING}
            </span>
          </p>
        )}
        {c.license?.assertedBy === "uploader" && (
          <p className="mt-3 flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            <span>The licence was stated by whoever uploaded it, and {providerName} does not check it. Uploads sometimes carry a licence the uploader had no right to give: treat it as unverified.</span>
          </p>
        )}
        {c.license?.assertedBy === "site" && <p className="mt-2 text-xs text-muted-foreground">{providerName} applies one licence to all its clips.</p>}
        <p className="mt-3 text-xs">
          <a href="/docs/licences" className="text-primary hover:underline">How licence verdicts work</a>
        </p>
      </section>

      {/* Credit line */}
      <section aria-labelledby="credit-h" className="space-y-2">
        <h3 id="credit-h" className="flex items-center gap-2 font-medium"><UserRound className="size-4 text-primary" /> Credit line</h3>
        {credit ? (
          <>
            <p className="rounded-lg border bg-muted/40 p-3 text-sm leading-relaxed">{credit}</p>
            <div className="flex flex-wrap items-center gap-2">
              <LightCopy text={credit} label="Copy credit" />
              <span className="text-xs text-muted-foreground">Put it in the video description or the end credits.</span>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {c.license?.attributionRequired === false ? "No credit is required. Crediting the source is still a nice thing to do." : "The source gives no credit line. If you use it, credit the author and link the source page."}
          </p>
        )}
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <a href={`${base}/credits`} className="inline-flex items-center gap-1 text-primary hover:underline" target="_blank" rel="noopener"><FileText className="size-3.5" /> ATTRIBUTION.md</a>
          <a href={`${base}/credits?format=json`} className="text-primary hover:underline" target="_blank" rel="noopener">credits.json</a>
          <a href={`${base}/credits?format=zip`} className="text-primary hover:underline">Both as a zip</a>
        </p>
      </section>

      {c.requiresAccount && (
        <p className="flex gap-2 rounded-lg border p-3 text-sm">
          <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>
            The full-quality file needs an account on {providerName}.{" "}
            {source ? <a className="text-primary hover:underline" href={source} target="_blank" rel="noopener noreferrer">Open its page</a> : null}
          </span>
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {source && (
          <Button variant="outline" asChild>
            <a href={source} target="_blank" rel="noopener noreferrer">Open on {providerName} <ArrowUpRight className="size-4" /></a>
          </Button>
        )}
        <ShareButton title={c.title} url={shareUrl} />
      </div>

      <Separator />

      {/* Renditions */}
      <section aria-labelledby="files-h" className="space-y-3">
        <h3 id="files-h" className="flex items-center gap-2 font-medium"><FileVideo className="size-4 text-primary" /> Download a size</h3>
        {!full && !failed && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading files…</p>}
        {failed && <p className="text-sm text-destructive">Could not load the details: {failed}</p>}
        {full && !videos.length && (
          <p className="text-sm text-muted-foreground">
            No direct files from this source. {source ? <a href={source} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Get it on {providerName}</a> : null}
          </p>
        )}
        {videos.length > 0 && (
          <>
            <ul className="divide-y overflow-hidden rounded-lg border">
              {videos.slice(0, 30).map((f) => {
                const href = downloadHref(c, f, videos);
                const size = f.width && f.height ? `${f.width}×${f.height}` : "";
                return (
                  <li key={f.url + f.filename} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs">
                    <span className="w-[4.5rem] shrink-0 font-medium">{ROLE_LABEL[f.role] ?? f.role}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        {size && <span className="tabular-nums">{size}</span>}
                        {resolutionLabel(f.width, f.height) && <span className="text-muted-foreground">{resolutionLabel(f.width, f.height)}</span>}
                        <span className="rounded bg-muted px-1 py-px text-[10px] font-semibold uppercase">{f.format}</span>
                        {f.codec && <span className="text-muted-foreground">{f.codec}</span>}
                        {f.fps && <span className="text-muted-foreground">{fpsText(f.fps)}</span>}
                        {f.sizeBytes != null && <span className="tabular-nums text-muted-foreground">{formatBytes(f.sizeBytes)}</span>}
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground" title={f.filename}>{f.filename}</span>
                    </span>
                    {f.requiresAuth ? (
                      <span className="inline-flex items-center gap-1 text-muted-foreground"><Lock className="size-3" /> account</span>
                    ) : href ? (
                      <Button variant="outline" size="sm" className="h-7 px-2 text-xs" asChild>
                        <a href={href} target="_blank" rel="noopener" aria-label={`Download ${ROLE_LABEL[f.role] ?? f.role} ${size} ${f.format}`}>
                          <Download className="size-3.5" /> Download
                        </a>
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-muted-foreground">
              Every download comes straight from {providerName}'s servers. For a 1080p edit, the smallest file at or above 1080p is enough; masters can be several gigabytes.
            </p>
          </>
        )}
      </section>

      <section aria-labelledby="code-h" className="space-y-3">
        <h3 id="code-h" className="flex items-center gap-2 font-medium"><Terminal className="size-4 text-primary" /> From a terminal or an agent</h3>
        <Snippet icon={<Terminal className="size-3.5" />} label="curl (follows the redirect to the source)" text={curl} />
        <Snippet icon={<Scissors className="size-3.5" />} label="ffmpeg: a 5-second cut, read straight from the source" text={ffmpeg} />
        <Snippet icon={<Bot className="size-3.5" />} label="Ask your agent" text={prompt} />
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-px size-3.5 shrink-0" aria-hidden="true" /> Agents connect with <code className="font-mono">claude mcp add --transport http {MCP_NAME} {origin}/mcp</code>. <a href="/docs/mcp" className="text-primary hover:underline">Setup</a>
        </p>
      </section>

      {c.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {c.tags.slice(0, 16).map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
        </div>
      )}
      {c.description && <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{c.description.slice(0, 900)}</p>}
    </div>
  );
}

function Snippet({ icon, label, text }: { icon: React.ReactNode; label: string; text: string }) {
  return (
    <div className="rounded-lg bg-[#0d0d12] p-3 text-zinc-100">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] text-zinc-400">{icon}{label}</span>
        <CopyButton text={text} />
      </div>
      <pre className="whitespace-pre-wrap break-all font-mono text-[12px] leading-relaxed">{text}</pre>
    </div>
  );
}

/** Share link to this clip (`/search?clip=<id>`, which unfurls with its own preview card). */
function ShareButton({ title, url }: { title: string; url: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    if (typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches) {
      await navigator.share({ title, url }).catch(() => undefined);
      return;
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <Button variant="outline" onClick={() => void share()}>
      {copied ? <Check className="size-4" /> : <Share2 className="size-4" />}
      {copied ? "Link copied" : "Share"}
    </Button>
  );
}
