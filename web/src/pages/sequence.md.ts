// Markdown twin of /sequence (the builder is an interactive island; this says what it does and how to call it).
import type { APIRoute } from "astro";
import { MCP_NAME, MCP_URL, SITE } from "@/lib/site";

export const GET: APIRoute = () =>
  new Response(
    [
      "# B-roll sequence builder",
      "",
      "> Turn a shot list into a b-roll edit in one call: one free stock clip per shot, matched to the target frame (orientation, at least 1080p where possible, long enough for the shot, commercial-safe by default, with direct files), alternatives per shot, and exports for OpenTimelineIO, ffmpeg and Remotion plus the credits.",
      "",
      `The page at ${SITE.url}/sequence is an interactive front end to one API call. Agents and scripts should call the API directly:`,
      "",
      "```bash",
      `curl -X POST ${SITE.url}/v1/sequences \\`,
      '  -H "content-type: application/json" \\',
      `  -d '{"shots":["city skyline at night (4s)","coffee pour close-up (3s)","people walking in the rain"],"orientation":"portrait","fps":30,"totalDuration":15,"commercialOnly":true,"name":"promo"}'`,
      "```",
      "",
      "`shots` is a list, or text with one shot per line; \"(3s)\" at the end of a shot sets its length, the others share `totalDuration` (or get 4 s each). Up to 24 shots. Other fields: `orientation` (landscape, portrait, square) or `width`/`height`, `fps` (default 30), `commercialOnly` (default true), `providers`, `alternatives` (0-5, default 3), `name`.",
      "",
      "## What you get",
      "",
      "- `plan.shots[]`: `index`, `description`, `durationSec`, `inSec` (in-point; skips title cards on long archive films), `clip` (the pick, with its licence), `file` (the rendition the exports use), `alternatives[]` and a `note` when the pick is shorter, smaller or a different shape than the shot.",
      "- `plan.commercialSafe`: true when every pick's verdict is `yes` or `yes-with-credit`. Editorial-flagged picks (`license.editorial`) are still not for ads.",
      "- `exports`: `timeline.otio` (OpenTimelineIO JSON), `concat.sh` (ffmpeg: trim, scale to cover, centre-crop, conform fps, h264, concatenate), `remotion.json` (frames for a Remotion `<Series>` of `<OffthreadVideo>`), `ATTRIBUTION.md` and `credits.json`.",
      "",
      "Media URLs in the exports point at the sources' files: nothing is re-hosted.",
      "",
      "## From the CLI or an AI agent",
      "",
      "- CLI: `npx video-assets-server sequence shots.txt --orientation portrait --total 30 [--download]`",
      `- MCP: connect ${MCP_URL} (as \`${MCP_NAME}\`) and call \`build_sequence\` (shots, orientation, fps, total_duration, commercial_only). Run locally (\`npx -y video-assets-server mcp\`), \`download=true\` saves the clips and writes the exports next to them.`,
      "",
      `Guide: ${SITE.url}/guides/b-roll-sequence-from-shot-list.md`,
      "",
      "---",
      `Source: ${SITE.url}/sequence`,
      "",
    ].join("\n"),
    { headers: { "content-type": "text/markdown; charset=utf-8" } },
  );
