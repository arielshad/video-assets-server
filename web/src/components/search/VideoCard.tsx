import { memo, useState } from "react";
import { Film, Loader2, Pause, Play, RectangleHorizontal, RectangleVertical, Square, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { categoryLabel, durationText, orientationLabel, resolutionBadge } from "@/lib/vocab";
import { safeUrl, type Clip } from "./api";
import { useHoverPreview, type HoverPreview } from "./preview";
import { VerdictBadge } from "./VerdictBadge";

const ORIENTATION_ICON = { landscape: RectangleHorizontal, portrait: RectangleVertical, square: Square } as const;

/** Poster for clips without one: a quiet gradient with a film icon. */
function Placeholder({ label }: { label?: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-[radial-gradient(120%_120%_at_0%_0%,color-mix(in_oklch,var(--color-primary)_22%,transparent),transparent_60%),radial-gradient(120%_120%_at_100%_100%,color-mix(in_oklch,var(--color-brand-2)_18%,transparent),transparent_60%)] text-muted-foreground">
      <Film className="size-7 opacity-60" aria-hidden="true" />
      {label && <span className="px-3 text-center text-[11px] leading-tight">{label}</span>}
    </div>
  );
}

/**
 * The 16:9 media box of a clip: poster (or placeholder), the hover preview
 * when it plays, and badges (resolution, orientation, duration). Portrait and
 * square clips keep their shape over a blurred copy of their poster.
 */
export function ClipMedia({ clip, preview, eager = false, className, compact = false }: { clip: Clip; preview: HoverPreview; eager?: boolean; className?: string; compact?: boolean }) {
  const [posterFailed, setPosterFailed] = useState(false);
  const poster = posterFailed ? undefined : safeUrl(clip.posterUrl);
  const src = safeUrl(clip.previewUrl);
  const tall = clip.orientation === "portrait" || clip.orientation === "square";
  const fit = tall ? "object-contain" : "object-cover";
  const res = resolutionBadge(clip.width, clip.height);
  const dur = durationText(clip.durationSec);
  const OIcon = clip.orientation ? ORIENTATION_ICON[clip.orientation] : undefined;
  return (
    <div className={cn("relative aspect-video w-full overflow-hidden bg-muted", className)}>
      {poster ? (
        <>
          {tall && <img src={poster} alt="" aria-hidden="true" referrerPolicy="no-referrer" loading={eager ? "eager" : "lazy"} decoding="async" className="absolute inset-0 size-full scale-110 object-cover opacity-40 blur-xl" />}
          <img
            src={poster}
            alt=""
            referrerPolicy="no-referrer"
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            onError={() => setPosterFailed(true)}
            className={cn("absolute inset-0 size-full transition duration-500", fit, !preview.playing && "group-hover:scale-[1.03]")}
          />
        </>
      ) : (
        <Placeholder label={compact ? undefined : src ? "Hover to preview" : "No preview here: open for the player"} />
      )}
      {src && preview.mounted && (
        <video
          ref={preview.videoRef}
          src={src}
          muted
          playsInline
          loop
          preload="none"
          aria-hidden="true"
          tabIndex={-1}
          onPlaying={preview.onPlaying}
          onError={preview.onError}
          className={cn("absolute inset-0 size-full bg-black/0 transition-opacity duration-200", fit, preview.active && preview.playing ? "opacity-100" : "opacity-0")}
        />
      )}
      {preview.active && !preview.playing && (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <Loader2 className="size-6 animate-spin text-white drop-shadow" />
        </span>
      )}
      {(res || OIcon) && (
        <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white backdrop-blur-sm">
          {OIcon && <OIcon className="size-3" aria-label={orientationLabel(clip.orientation)} />}
          {res}
        </span>
      )}
      {dur && <span className="pointer-events-none absolute bottom-2 right-2 rounded-md bg-black/65 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-white backdrop-blur-sm">{dur}</span>}
      {preview.active && preview.playing && clip.hasAudio && (
        <span className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-black/65 p-1 text-white" title="Muted preview">
          <VolumeX className="size-3" aria-hidden="true" />
        </span>
      )}
    </div>
  );
}

/** Small round play/pause for the preview: touch screens, keyboards and reduced-motion users start it here. */
export function PreviewButton({ preview, title, className }: { preview: HoverPreview; title: string; className?: string }) {
  if (preview.failed) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        preview.toggle();
      }}
      aria-pressed={preview.active}
      aria-label={`${preview.active ? "Stop" : "Play"} preview of ${title}`}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-ring",
        className,
      )}
    >
      {preview.active ? <Pause className="size-3.5" /> : <Play className="size-3.5 translate-x-px" />}
    </button>
  );
}

/**
 * One search result: hover or focus plays the muted preview (when the source
 * has one), click or Enter opens the detail sheet.
 */
export const VideoCard = memo(function VideoCard({ clip, providerName, onOpen, eager }: { clip: Clip; providerName: string; onOpen: (c: Clip) => void; eager?: boolean }) {
  const preview = useHoverPreview(safeUrl(clip.previewUrl));
  const meta = [providerName, clip.year ? String(clip.year) : "", categoryLabel(clip.category)].filter(Boolean).join(" · ");
  return (
    <li className="group relative" data-clip={clip.id} onMouseEnter={() => preview.start()} onMouseLeave={preview.stop}>
      <button
        type="button"
        onClick={() => {
          preview.stop();
          onOpen(clip);
        }}
        onFocus={() => preview.start()}
        onBlur={preview.stop}
        className="flex w-full flex-col overflow-hidden rounded-xl border bg-card/50 text-left transition hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5 focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        aria-label={`${clip.title}, ${meta}. Open details`}
      >
        <ClipMedia clip={clip} preview={preview} eager={eager} />
        <span className="flex w-full flex-col gap-1.5 p-3">
          <span className="line-clamp-2 text-sm font-medium leading-snug group-hover:text-primary">{clip.title}</span>
          <span className="truncate text-xs text-muted-foreground">{meta}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1">
            <VerdictBadge license={clip.license} plain />
            {clip.license?.editorial && <span className="inline-flex items-center rounded-full border border-warning/40 px-2 py-0.5 text-[11px] font-medium text-warning" title="People, insignia or brands without releases: not for ads">Editorial</span>}
          </span>
        </span>
      </button>
      {clip.previewUrl && <PreviewButton preview={preview} title={clip.title} className="absolute right-2 top-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 [@media(hover:none)]:opacity-100" />}
    </li>
  );
});
