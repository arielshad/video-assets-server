---
title: "Build a b-roll sequence from a shot list (OTIO, ffmpeg, Remotion)"
seoTitle: "Build a b-roll sequence from a shot list"
description: "Turn a shot list into a cut b-roll sequence with free stock footage: pick the frame, review the picks, export to DaVinci Resolve, ffmpeg or Remotion."
answer: "Write one line per shot (\"city skyline at night (4s)\"), pick the frame (16:9, 9:16 or 1:1), the frame rate and the total length, and let the sequence builder pick one commercial-safe clip per shot with alternatives. Then export: timeline.otio opens in DaVinci Resolve or Kdenlive, concat.sh renders the sequence with ffmpeg straight from the sources, remotion.json drives a Remotion composition, and ATTRIBUTION.md holds the credits."
section: Production
kind: howto
steps:
  - name: "Write the shot list"
    text: "One shot per line, described like a search: subject, setting, light, movement. End a line with '(3s)' to fix its length; the other shots share the total length, or get 4 seconds each."
  - name: "Choose the frame"
    text: "16:9 for YouTube and websites, 9:16 for Reels, TikTok and Shorts, 1:1 for square posts. Pick the frame rate of your project (24, 25, 30, 50 or 60 fps)."
  - name: "Review the picks"
    text: "Each shot shows its pick with a hover preview, its licence verdict and notes when the clip is shorter than the shot, below the frame size or a different shape. Swap in an alternative by opening it."
  - name: "Export"
    text: "Download timeline.otio for your editor, concat.sh to render with ffmpeg, remotion.json for a Remotion project, and ATTRIBUTION.md for the description or end credits."
  - name: "Finish in your editor"
    text: "Trim, reframe crops, grade the shots so they match, add music and titles. Keep ATTRIBUTION.md with the project."
faq:
  - q: "Does the sequence builder download the clips?"
    a: "On the website and the hosted API, no: the exports point at the source files, which ffmpeg, Resolve and Remotion read over HTTPS. The CLI and a local MCP server can download the picks (sequence --download, build_sequence with download=true) and then write exports that use the local files."
  - q: "Why does a shot say it will freeze or be upscaled?"
    a: "The best clip found was shorter than the shot or smaller than the frame. The ffmpeg script holds the last frame and scales up so the sequence keeps its length and size; pick an alternative or adjust the shot length if that matters."
  - q: "Is every pick commercial-safe?"
    a: "By default only clips with a Commercial use OK verdict are picked, and the result says when every pick is cleared. Editorial-flagged picks, such as NASA footage, still need care in ads."
  - q: "Can I use it from code?"
    a: "Yes: POST /v1/sequences with the shots and frame, the build_sequence MCP tool, or video-assets-server sequence shots.txt from the CLI."
searches:
  - { label: "Clouds timelapse", href: "/search?q=clouds+timelapse" }
  - { label: "City at night, 1080p+", href: "/search?q=city+night&min_resolution=1080" }
collections: [free-city-footage, free-cloud-timelapses, free-ocean-footage]
related: [vertical-video-reels-tiktok-shorts, video-resolution-codecs-containers, ai-agent-find-and-license-footage]
cites:
  - { name: "OpenTimelineIO documentation", url: "https://opentimelineio.readthedocs.io" }
  - { name: "FFmpeg concat demuxer", url: "https://ffmpeg.org/ffmpeg-formats.html#concat-1" }
  - { name: "Remotion: <Series>", url: "https://www.remotion.dev/docs/series" }
  - { name: "Remotion: <OffthreadVideo>", url: "https://www.remotion.dev/docs/offthreadvideo" }
published: 2026-10-28
updated: 2026-10-28
order: 7
---

## A shot list that searches well

Each line is searched across every source, so write it the way you would search: what is in the frame, where, and how it moves.

```text
City skyline at night (4s)
Coffee pour close-up (3s)
People walking in the rain
Ocean waves at sunset
Clouds timelapse (5s)
```

Lengths in brackets fix a shot's duration; the rest share the total. The builder looks for clips in your frame's orientation, at least 1080p where possible, at least as long as the shot, commercial-safe and with direct files, never uses a clip twice, and keeps three alternatives per shot.

## What each export is for

**timeline.otio** is an [OpenTimelineIO](https://opentimeline.io) timeline with one video track: each clip at its in-point and length, its source URL as the media reference, and its licence in the clip metadata. Import it in DaVinci Resolve or Kdenlive; OTIO adapters convert it for Premiere Pro and Final Cut Pro. Your editor may ask you to relink the media to downloaded files.

**concat.sh** renders the sequence with ffmpeg in one go. For each shot it seeks to the in-point, reads the clip from the source over HTTPS, scales it to cover the frame, centre-crops, conforms the frame rate, encodes H.264 without audio, and finally joins the parts with the concat demuxer:

```bash
sh concat.sh   # writes <name>.mp4 next to it
```

**remotion.json** lists, per shot, the source URL, the start frame and the length in frames, plus the composition's size and fps. In a Remotion project:

```tsx
import { OffthreadVideo, Series } from "remotion";
import data from "./remotion.json";

export const Broll = () => (
  <Series>
    {data.shots.map((s) => (
      <Series.Sequence key={s.id} durationInFrames={s.durationInFrames}>
        <OffthreadVideo src={s.src} startFrom={s.startFrom} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </Series.Sequence>
    ))}
  </Series>
);
```

**ATTRIBUTION.md** and **credits.json** list every clip with its source, author, licence and credit line.

## Before you publish

Archive films start part-way in to skip their title cards, but check every cut. Grade the shots so they sit together, especially when mixing NASA, Commons and archive footage. And paste the credits from ATTRIBUTION.md into the description or end credits.
