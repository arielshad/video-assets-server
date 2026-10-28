import { creativeCommons, license } from "../src/core/licence.js";
import type { ClipDetails, HttpClient, Provider } from "../src/core/types.js";
import { filterLocal, makeClip, paginate } from "../src/core/util.js";

/** A CC0 4K landscape ocean clip: master, two renditions, a preview and a poster. */
export const OCEAN: ClipDetails = {
  ...makeClip({
    provider: "fake",
    nativeId: "ocean",
    title: "Ocean Waves at Sunset",
    tags: ["ocean", "waves", "sunset"],
    url: "https://fake.example/ocean",
    posterUrl: "https://cdn.fake.example/ocean.jpg",
    previewUrl: "https://cdn.fake.example/ocean-360.mp4",
    license: license("CC0-1.0"),
    price: { free: true },
    width: 3840,
    height: 2160,
    fps: 30,
    durationSec: 14.5,
    hasAudio: false,
    downloadable: true,
  }),
  files: [
    { url: "https://cdn.fake.example/ocean-360.mp4", filename: "ocean-360.mp4", format: "mp4", role: "preview", width: 640, height: 360, sizeBytes: 4 },
    { url: "https://cdn.fake.example/ocean.mov", filename: "ocean.mov", format: "mov", role: "original", width: 3840, height: 2160, codec: "prores", sizeBytes: 4 },
    { url: "https://cdn.fake.example/ocean-1080.mp4", filename: "ocean-1080.mp4", format: "mp4", role: "rendition", width: 1920, height: 1080, codec: "h264", sizeBytes: 4 },
    { url: "https://cdn.fake.example/ocean-720.webm", filename: "ocean-720.webm", format: "webm", role: "rendition", width: 1280, height: 720, codec: "vp9", sizeBytes: 4 },
    { url: "https://cdn.fake.example/ocean.jpg", filename: "ocean.jpg", format: "jpg", role: "poster" },
  ],
};

/** A CC BY-NC vertical city timelapse: never commercial-safe. */
export const CITY: ClipDetails = {
  ...makeClip({
    provider: "fake",
    nativeId: "city",
    title: "City Traffic Timelapse at Night",
    tags: ["city", "traffic", "night"],
    url: "https://fake.example/city",
    posterUrl: "https://cdn.fake.example/city.jpg",
    previewUrl: "https://cdn.fake.example/city.mp4",
    license: creativeCommons({ nc: true }),
    price: { free: true },
    width: 1080,
    height: 1920,
    fps: 60,
    durationSec: 42,
    downloadable: true,
  }),
  files: [{ url: "https://cdn.fake.example/city.mp4", filename: "city.mp4", format: "mp4", role: "original", width: 1080, height: 1920, sizeBytes: 4 }],
};

/** A clip whose files need an account. */
const ROCKET = makeClip({
  provider: "fake",
  nativeId: "rocket",
  title: "Rocket Launch",
  tags: ["rocket", "launch"],
  url: "https://fake.example/rocket",
  license: license("CC0-1.0"),
  price: { free: true },
  downloadable: false,
});

export const fakeProvider: Provider = {
  id: "fake",
  name: "Fake",
  homepage: "https://fake.example",
  description: "Test provider",
  categories: ["nature", "city", "space"],
  access: "api",
  pricing: "free",
  supportsDownload: true,
  buildSearchUrl: (q) => `https://fake.example/search?q=${encodeURIComponent(q.query)}`,
  async search(q) {
    const items = filterLocal([OCEAN, CITY, ROCKET], q);
    return { clips: paginate(items, q), total: items.length };
  },
  async getClip(id) {
    return id === "ocean" ? OCEAN : id === "city" ? CITY : null;
  },
};

export const brokenProvider: Provider = {
  ...fakeProvider,
  id: "broken",
  name: "Broken",
  getClip: undefined,
  async search() {
    throw new Error("boom");
  },
};

export const slowProvider: Provider = {
  ...fakeProvider,
  id: "slow",
  name: "Slow",
  search: () => new Promise(() => undefined),
};

/** HttpClient that serves the bytes "data:<file>" for any URL and records requests. */
export function bytesHttp(): HttpClient & { requests: string[] } {
  const requests: string[] = [];
  const body = (url: string) => new TextEncoder().encode(`data:${url.slice(url.lastIndexOf("/") + 1)}`);
  return {
    requests,
    async raw(url) {
      requests.push(url);
      return new Response(body(url));
    },
    async text(url) {
      requests.push(url);
      return new TextDecoder().decode(body(url));
    },
    async json() {
      throw new Error("not used");
    },
  };
}
