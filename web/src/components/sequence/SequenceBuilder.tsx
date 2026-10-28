import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, CircleCheck, Clapperboard, Copy, Download, FileJson, FileText, Loader2, TerminalSquare, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { categoryPath, durationText, resolutionBadge } from "@/lib/vocab";
import { api, safeUrl, saveText, UnauthorizedError, type Clip, type Provider } from "@/components/search/api";
import { Segmented } from "@/components/search/Filters";
import { stopAllPreviews, useHoverPreview } from "@/components/search/preview";
import { ClipMedia, PreviewButton } from "@/components/search/VideoCard";
import { VerdictBadge } from "@/components/search/VerdictBadge";

/** POST /v1/sequences response (src/core/sequence.ts). */
interface Shot {
  index: number;
  description: string;
  durationSec: number;
  inSec: number;
  clip?: Clip;
  file?: { url: string; filename: string; format: string; width?: number; height?: number; fps?: number; sizeBytes?: number };
  alternatives: Clip[];
  note?: string;
}
interface Plan {
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  shots: Shot[];
  commercialSafe: boolean;
}
type ExportName = "timeline.otio" | "concat.sh" | "remotion.json" | "ATTRIBUTION.md" | "credits.json";
interface SequenceResponse {
  plan: Plan;
  exports: Record<ExportName, string>;
}

export const EXAMPLE_SHOTS = ["City skyline at night (4s)", "Coffee pour close-up (3s)", "People walking in the rain", "Ocean waves at sunset", "Clouds timelapse (5s)"].join("\n");

const EXPORTS: { name: ExportName; label: string; type: string; icon: typeof FileText; hint: string }[] = [
  { name: "timeline.otio", label: "timeline.otio", type: "application/json", icon: Clapperboard, hint: "OpenTimelineIO: DaVinci Resolve, Kdenlive; Premiere and Final Cut via OTIO adapters" },
  { name: "concat.sh", label: "concat.sh", type: "text/x-shellscript", icon: TerminalSquare, hint: "ffmpeg script: trims, scales, crops and joins the shots straight from the sources" },
  { name: "remotion.json", label: "remotion.json", type: "application/json", icon: FileJson, hint: "Clip list for a Remotion <Series> of <OffthreadVideo>" },
  { name: "ATTRIBUTION.md", label: "ATTRIBUTION.md", type: "text/markdown", icon: FileText, hint: "Credits for every clip, with licences and links" },
  { name: "credits.json", label: "credits.json", type: "application/json", icon: FileJson, hint: "The same credits, machine-readable" },
];

/** Same rule as the server's parseShotList: one shot per line (or ";"), "(3s)" at the end sets its length. */
function countShots(text: string): number {
  return text
    .split(/\r?\n|;/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)]|shot\s*\d+\s*[:.-])\s*/i, "").trim())
    .filter((l) => l.length >= 2).length;
}

/** The clip's player, files and credit line live on the search page (`/search?clip=<id>`), opened in a new tab. */
const clipHref = (id: string) => `/search?clip=${encodeURIComponent(id)}`;

function ShotPick({ clip, providers }: { clip: Clip; providers: Provider[] }) {
  const preview = useHoverPreview(safeUrl(clip.previewUrl));
  const source = providers.find((p) => p.id === clip.provider)?.name ?? clip.provider;
  return (
    <div className="grid gap-3 sm:grid-cols-[13rem_1fr]">
      <div className="group relative" onMouseEnter={() => preview.start()} onMouseLeave={preview.stop}>
        <a
          href={clipHref(clip.id)}
          target="_blank"
          rel="noopener"
          onClick={preview.stop}
          onFocus={() => preview.start()}
          onBlur={preview.stop}
          aria-label={`${clip.title} on ${source}: open the player, files and credit line in a new tab`}
          className="block w-full overflow-hidden rounded-lg border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <ClipMedia clip={clip} preview={preview} compact />
        </a>
        {clip.previewUrl && <PreviewButton preview={preview} title={clip.title} className="absolute right-2 top-2 size-7" />}
      </div>
      <div className="min-w-0">
        <a href={clipHref(clip.id)} target="_blank" rel="noopener" className="text-sm font-medium leading-snug hover:text-primary">
          {clip.title}
        </a>
        <p className="mt-1 text-xs text-muted-foreground">
          {source} · {categoryPath(clip.category)}
          {clip.author ? ` · ${clip.author}` : ""}
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-1">
          <VerdictBadge license={clip.license} />
          {clip.license?.editorial && <span className="inline-flex items-center rounded-full border border-warning/40 px-2 py-0.5 text-[11px] font-medium text-warning" title="People, insignia or brands without releases: not for ads">Editorial</span>}
        </p>
      </div>
    </div>
  );
}

function CopyText({ text, label }: { text: string; label: string }) {
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

export default function SequenceBuilder() {
  const [shots, setShots] = useState(EXAMPLE_SHOTS);
  const [orientation, setOrientation] = useState<"landscape" | "portrait" | "square">("landscape");
  const [fps, setFps] = useState("30");
  const [total, setTotal] = useState("");
  const [commercial, setCommercial] = useState(true);
  const [name, setName] = useState("b-roll");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<SequenceResponse | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const resultsRef = useRef<HTMLDivElement>(null);
  const count = useMemo(() => countShots(shots), [shots]);
  const totalValid = total.trim() === "" || (/^\d{1,4}(\.\d+)?$/.test(total.trim()) && Number(total) > 0 && Number(total) <= 3600);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const preset = p.get("shots");
    if (preset) setShots(preset.slice(0, 6000));
    const o = p.get("orientation");
    if (o === "portrait" || o === "square" || o === "landscape") setOrientation(o);
    if (/^\d{1,4}$/.test(p.get("total") ?? "")) setTotal(p.get("total")!);
    api<{ providers: Provider[] }>("/v1/providers")
      .then((r) => setProviders(r.providers))
      .catch(() => undefined);
  }, []);

  const build = async () => {
    if (!count || !totalValid) return;
    stopAllPreviews();
    setBusy(true);
    setError(undefined);
    setResult(null);
    try {
      const body = {
        shots,
        orientation,
        fps: Number(fps),
        commercialOnly: commercial,
        name: name.trim() || "sequence",
        ...(total.trim() ? { totalDuration: Number(total) } : {}),
      };
      const res = await api<SequenceResponse>("/v1/sequences", { method: "POST", body });
      setResult(res);
      requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (e) {
      setError(e instanceof UnauthorizedError ? "This server needs an API key: set it on the search page first." : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const plan = result?.plan;
  const picked = plan?.shots.filter((s) => s.clip).length ?? 0;
  const safeName = (name.trim() || "sequence").replace(/[^\w.-]+/g, "-");

  return (
    <TooltipProvider>
      <form
        className="rounded-2xl border bg-card/50 p-4 shadow-xl shadow-primary/5 sm:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void build();
        }}
      >
        <label htmlFor="shots" className="text-sm font-medium">Shot list</label>
        <p id="shots-hint" className="mt-1 text-xs text-muted-foreground">One shot per line, described like a search. End a line with “(3s)” to set its length; the rest share the total length (or 4 s each). Up to 24 shots.</p>
        <textarea
          id="shots"
          value={shots}
          onChange={(e) => setShots(e.target.value)}
          rows={7}
          maxLength={6000}
          aria-describedby="shots-hint"
          spellCheck={false}
          className="mt-3 w-full resize-y rounded-xl border bg-background/60 p-3 font-mono text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="mt-4 flex flex-wrap items-end gap-x-5 gap-y-4">
          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-muted-foreground">Frame</span>
            <Segmented
              label="Orientation"
              value={orientation}
              onChange={setOrientation}
              options={[
                { value: "landscape", label: "16:9", title: "1920×1080" },
                { value: "portrait", label: "9:16", title: "1080×1920: Reels, TikTok, Shorts" },
                { value: "square", label: "1:1", title: "1080×1080" },
              ]}
            />
          </div>
          <label className="space-y-1.5">
            <span className="block text-xs font-medium text-muted-foreground">Frame rate</span>
            <select value={fps} onChange={(e) => setFps(e.target.value)} className="h-7 rounded-full border bg-background px-2.5 text-xs">
              {["24", "25", "30", "50", "60"].map((f) => <option key={f} value={f}>{f} fps</option>)}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="block text-xs font-medium text-muted-foreground">Total length (s)</span>
            <input value={total} onChange={(e) => setTotal(e.target.value)} inputMode="decimal" placeholder="auto" aria-invalid={!totalValid || undefined} className={cn("h-7 w-24 rounded-full border bg-background px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring", !totalValid && "border-destructive")} />
          </label>
          <label className="space-y-1.5">
            <span className="block text-xs font-medium text-muted-foreground">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="h-7 w-36 rounded-full border bg-background px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </label>
          <Switch label="Commercial-safe only" labelClassName="text-xs font-medium text-muted-foreground" checked={commercial} onCheckedChange={setCommercial} title="Only clips whose licence allows commercial use" />
          <Button type="submit" className="ml-auto" disabled={busy || !count || !totalValid}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
            {busy ? "Finding clips…" : `Build ${count || ""} ${count === 1 ? "shot" : "shots"}`}
          </Button>
        </div>
        {error && <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      </form>

      <div ref={resultsRef} className="scroll-mt-20">
        {busy && (
          <ol className="mt-8 space-y-3" aria-busy="true" aria-label="Finding a clip for each shot">
            {Array.from({ length: Math.min(count, 24) }).map((_, i) => (
              <li key={i} className="grid gap-3 rounded-xl border bg-card/30 p-3 sm:grid-cols-[2rem_13rem_1fr]">
                <Skeleton className="hidden h-6 w-6 rounded-full sm:block" />
                <Skeleton className="aspect-video w-full" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </li>
            ))}
          </ol>
        )}

        {plan && result && (
          <section className="mt-10" aria-labelledby="plan-h">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 id="plan-h" className="text-2xl font-semibold tracking-tight">Your sequence</h2>
              <p className="text-sm text-muted-foreground">
                {plan.width}×{plan.height} @ {plan.fps} fps · {durationText(plan.durationSec)} · {picked} of {plan.shots.length} shots filled
              </p>
            </div>
            <p className={cn("mt-3 flex items-start gap-2 rounded-lg border p-3 text-sm", plan.commercialSafe ? "border-success/40 bg-success/10" : "border-warning/40 bg-warning/10")}>
              {plan.commercialSafe ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />}
              <span>
                {plan.commercialSafe
                  ? "Every pick's licence allows commercial use. Credit the ones that ask for it (ATTRIBUTION.md lists them), and check editorial-flagged shots before using them in an ad."
                  : "Not every pick is cleared for commercial use: check the verdicts below before you publish."}
              </span>
            </p>

            <div className="mt-6 rounded-xl border bg-card/40 p-4">
              <h3 className="text-sm font-medium">Exports</h3>
              <p className="mt-1 text-xs text-muted-foreground">Media URLs point at the sources: nothing is re-hosted, and the files are generated in your browser from the plan.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {EXPORTS.map((x) => (
                  <Button key={x.name} variant="outline" size="sm" title={x.hint} onClick={() => saveText(x.name === "concat.sh" ? "concat.sh" : x.name, result.exports[x.name], x.type)}>
                    <Download className="size-3.5" /> {x.label}
                  </Button>
                ))}
                <CopyText text={result.exports["concat.sh"]} label="Copy ffmpeg script" />
              </div>
              <pre className="mt-3 overflow-x-auto rounded-lg bg-[#0d0d12] p-3 font-mono text-xs text-zinc-200">
                <code>{`sh concat.sh   # renders ${safeName}.mp4 (${plan.width}×${plan.height}, h264, no audio) with ffmpeg`}</code>
              </pre>
            </div>

            <ol className="mt-6 space-y-3">
              {plan.shots.map((s) => (
                <li key={s.index} className="rounded-xl border bg-card/40 p-3 sm:p-4">
                  <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="inline-flex size-6 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">{s.index}</span>
                    <span className="font-medium">{s.description}</span>
                    <span className="text-xs text-muted-foreground">
                      {s.durationSec} s{s.inSec ? ` · from ${durationText(s.inSec)}` : ""}
                      {s.file?.width ? ` · ${s.file.width}×${s.file.height} ${s.file.format.toUpperCase()}` : ""}
                      {s.file?.width ? ` (${resolutionBadge(s.file.width, s.file.height)})` : ""}
                    </span>
                  </div>
                  {s.clip ? <ShotPick clip={s.clip} providers={providers} /> : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No clip for this shot.</p>}
                  {s.note && (
                    <p className="mt-3 flex gap-2 text-xs text-warning">
                      <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                      {s.note}
                    </p>
                  )}
                  {s.alternatives.length > 0 && (
                    <div className="mt-3 text-xs">
                      <span className="text-muted-foreground">Alternatives: </span>
                      <ul className="mt-1 flex flex-wrap gap-1.5">
                        {s.alternatives.map((a) => (
                          <li key={a.id}>
                            <a href={clipHref(a.id)} target="_blank" rel="noopener" className="inline-flex max-w-[16rem] items-center gap-1 rounded-full border px-2.5 py-0.5 hover:border-primary/40" title={`${a.title}: ${a.license?.name ?? "no licence stated"}`}>
                              <span className="truncate">{a.title}</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>

    </TooltipProvider>
  );
}
