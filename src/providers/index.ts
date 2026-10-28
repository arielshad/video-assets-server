import type { Provider } from "../core/types.js";
import { internetarchive } from "./internetarchive.js";
import { linkedProviders } from "./linked.js";
import { nasa } from "./nasa.js";
import { nasasvs } from "./nasasvs.js";
import { wikimediacommons } from "./wikimediacommons.js";

/**
 * Every built-in provider, in the order results are reported. Originals come
 * before mirrors: when the same clip is found twice, de-duplication keeps the
 * copy from the source listed first (NASA before a Commons re-upload of it).
 */
export const allProviders: Provider[] = [nasa, nasasvs, wikimediacommons, internetarchive, ...linkedProviders];
