/**
 * Hover previews: the card's muted preview plays straight from the source's
 * CDN (this server never streams video). One plays at a time, nothing loads
 * before the first hover (preload="none"), and leaving the card pauses it and
 * rewinds. With prefers-reduced-motion there is no autoplay on hover; the
 * card's play button still starts it on request.
 */
import { useCallback, useEffect, useRef, useState } from "react";

let current: (() => void) | null = null;

/** Stop whatever preview is playing (opening the detail sheet, a new search). */
export function stopAllPreviews(): void {
  const stop = current;
  current = null;
  stop?.();
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export interface HoverPreview {
  /** The <video> has been mounted (after the first hover or button press). */
  mounted: boolean;
  /** Should be playing now. */
  active: boolean;
  /** Frames are showing. */
  playing: boolean;
  failed: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Start on hover/focus (ignored with reduced motion unless `manual`). */
  start: (manual?: boolean) => void;
  stop: () => void;
  toggle: () => void;
  onPlaying: () => void;
  onError: () => void;
}

export function useHoverPreview(src: string | undefined): HoverPreview {
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const stop = useCallback(() => {
    window.clearTimeout(timer.current);
    const v = videoRef.current;
    if (v) {
      v.pause();
      try {
        v.currentTime = 0;
      } catch {
        /* not seekable yet */
      }
    }
    setActive(false);
    setPlaying(false);
  }, []);
  const stopRef = useRef(stop);
  stopRef.current = stop;
  const release = useCallback(() => {
    if (current === stopRef.current) current = null;
    stop();
  }, [stop]);

  const start = useCallback(
    (manual = false) => {
      if (!src || failed) return;
      if (!manual && prefersReducedMotion()) return;
      if (current && current !== stopRef.current) current();
      current = stopRef.current;
      // A short delay keeps a quick mouse pass over the grid from starting downloads.
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(
        () => {
          setMounted(true);
          setActive(true);
        },
        manual ? 0 : 120,
      );
    },
    [src, failed],
  );

  const toggle = useCallback(() => (active ? release() : start(true)), [active, release, start]);

  useEffect(() => {
    if (!active) return;
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.play().catch(() => {
      // Autoplay refused or the source failed: the error handler marks real failures.
      setActive(false);
    });
  }, [active, mounted]);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => () => {
    if (current === stopRef.current) current = null;
  }, []);

  return {
    mounted,
    active,
    playing,
    failed,
    videoRef,
    start,
    stop: release,
    toggle,
    onPlaying: () => setPlaying(true),
    onError: () => {
      setFailed(true);
      setActive(false);
      setPlaying(false);
    },
  };
}
