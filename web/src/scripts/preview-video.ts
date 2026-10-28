/**
 * Hover previews on static pages (collections, source pages, the home page):
 * hovering or focusing a `[data-preview-card]` plays its source's muted
 * preview (`data-preview`) in the card's `[data-preview-box]`, straight from
 * the source's CDN. One plays at a time, nothing loads before the first hover
 * (preload="none"), and leaving pauses and rewinds. With
 * prefers-reduced-motion nothing plays on hover.
 */
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
let current: HTMLVideoElement | null = null;
let timer: number | undefined;

function videoFor(card: HTMLElement): HTMLVideoElement | null {
  const src = card.dataset.preview;
  const box = card.querySelector<HTMLElement>("[data-preview-box]");
  if (!src || !/^https:\/\//.test(src) || !box || card.dataset.previewFailed) return null;
  let v = box.querySelector("video");
  if (!v) {
    v = document.createElement("video");
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = "none";
    v.setAttribute("aria-hidden", "true");
    v.tabIndex = -1;
    v.className = `absolute inset-0 size-full opacity-0 transition-opacity duration-200 ${card.dataset.fit === "contain" ? "object-contain" : "object-cover"}`;
    const source = document.createElement("source");
    source.src = src;
    if (card.dataset.previewType) source.type = card.dataset.previewType;
    v.append(source);
    v.addEventListener("playing", () => v!.classList.replace("opacity-0", "opacity-100"));
    const fail = () => {
      card.dataset.previewFailed = "1";
      v?.remove();
    };
    v.addEventListener("error", fail);
    source.addEventListener("error", fail);
    box.append(v);
  }
  return v;
}

function stop(v: HTMLVideoElement | null) {
  if (!v) return;
  v.pause();
  try {
    v.currentTime = 0;
  } catch {
    /* not seekable yet */
  }
  v.classList.replace("opacity-100", "opacity-0");
  if (current === v) current = null;
}

function start(card: HTMLElement) {
  if (reduced.matches) return;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    const v = videoFor(card);
    if (!v) return;
    if (current && current !== v) stop(current);
    current = v;
    void v.play().catch(() => stop(v));
  }, 120);
}

const cardOf = (t: EventTarget | null) => (t instanceof Element ? t.closest<HTMLElement>("[data-preview-card]") : null);

document.addEventListener("mouseover", (e) => {
  const card = cardOf(e.target);
  if (card && !card.contains(e.relatedTarget as Node | null)) start(card);
});
document.addEventListener("mouseout", (e) => {
  const card = cardOf(e.target);
  if (card && !card.contains(e.relatedTarget as Node | null)) {
    window.clearTimeout(timer);
    stop(card.querySelector("video"));
  }
});
document.addEventListener("focusin", (e) => {
  const card = cardOf(e.target);
  if (card) start(card);
});
document.addEventListener("focusout", (e) => {
  const card = cardOf(e.target);
  if (card && !card.contains(e.relatedTarget as Node | null)) {
    window.clearTimeout(timer);
    stop(card.querySelector("video"));
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") stop(current);
});
