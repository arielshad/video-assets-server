---
title: "4K, 1080p, codecs and containers: picking the right stock video file"
seoTitle: "Picking the right stock video file: 4K, codecs"
description: "Which rendition to download: resolution tiers, frame rates, H.264 vs VP9, MP4 vs WebM, file sizes, and why the master isn't always the best choice."
answer: "Download the smallest file that reaches your timeline's resolution: for a 1080p edit, a 1080p rendition, not the 4K master, unless you want room to crop, stabilise or reframe. Prefer MP4 (H.264) for easy editing; WebM (VP9) from Wikimedia Commons works in most editors or converts with one ffmpeg command. Match frame rates to your project, and keep clips shot at 50 or 60 fps for slow motion."
section: Production
kind: article
faq:
  - q: "Why is the original file so much bigger than the 1080p rendition?"
    a: "Masters keep the full resolution and a high bitrate. Renditions are transcodes made by the source for streaming and quick download. For most edits the visual difference at your output size is small."
  - q: "Can I convert WebM to MP4?"
    a: "Yes: ffmpeg -i clip.webm -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac clip.mp4 re-encodes the video to H.264 in an MP4 container, which every editor reads."
  - q: "What does the 1080p badge mean for a vertical clip?"
    a: "Resolution tiers here go by the short side of the frame, so a vertical 1080×1920 clip is 1080p, the same as a landscape 1920×1080 one."
searches:
  - { label: "4K nature footage", href: "/search?q=nature&min_resolution=2160" }
  - { label: "60 fps footage", href: "/search?q=slow+motion+60fps" }
collections: [free-4k-nature-footage, free-slow-motion-footage, nasa-data-visualizations]
related: [vertical-video-reels-tiktok-shorts, b-roll-sequence-from-shot-list, free-stock-footage-commercial-use]
cites:
  - { name: "FFmpeg H.264 encoding guide", url: "https://trac.ffmpeg.org/wiki/Encode/H.264" }
  - { name: "Wikimedia Commons: video", url: "https://commons.wikimedia.org/wiki/Commons:Video" }
  - { name: "NASA Image and Video Library", url: "https://images.nasa.gov" }
published: 2026-10-28
updated: 2026-10-28
order: 8
---

## Resolution tiers

| Badge | Short side | Typical frame |
| --- | --- | --- |
| 4K | 2160 px | 3840×2160 (UHD), 4096×2160 (DCI) |
| 1440p | 1440 px | 2560×1440 |
| 1080p | 1080 px | 1920×1080, or 1080×1920 vertical |
| 720p | 720 px | 1280×720 |
| 480p and below | under 720 px | Archive transfers, previews |

A frame within 3% of a tier counts as that tier, so a slightly cropped 1920×1050 master is still 1080p.

## Renditions: what the sources give you

- **NASA Image and Video Library**: every video as the original MP4 master plus H.264 renditions named large (1080p), medium (720p), small (360p) and two tiny previews.
- **NASA Scientific Visualization Studio**: MP4 files per page, often 1080p and 4K, frequently at 30 or 60 fps, sometimes with a vertical cut.
- **Wikimedia Commons**: originals in WebM or Ogg Theora (Commons doesn't host MP4), plus VP9 WebM transcodes from 240p to 2160p and a small MPEG-4 rendition.
- **Internet Archive**: the uploaded original plus derivatives, usually an H.264 MP4 (often 480p) and an Ogg video.

The detail view of every clip lists them all with size, container, codec and file size, and the API's `download?height=1080` picks the smallest file that reaches 1080p.

## Codecs and containers

The **container** (MP4, WebM, MOV, Ogg) is the file format; the **codec** (H.264, HEVC, VP9, AV1, Theora) is how the picture is compressed inside it. H.264 in MP4 plays and edits everywhere. VP9 in WebM is efficient and plays in every modern browser; DaVinci Resolve, Premiere Pro and most editors import it, and anything else can convert it with ffmpeg. Theora is old: convert it before editing.

## Frame rates

Most web footage is 24, 25, 29.97/30, 50 or 60 fps. Mixing rates in one timeline works, but motion can stutter when a clip's rate doesn't divide evenly into the timeline's. For slow motion you need headroom: a 60 fps clip plays at half speed on a 30 fps timeline without inventing frames. Timelapses often come at 24 or 30 fps.

## How much is enough

- **Same as your output** for clips you show full-frame without moving.
- **One tier above** when you want to crop, stabilise, punch in or reframe for vertical.
- **Previews** only for rough cuts and storyboards: they are tiny and heavily compressed.

A 4K master can run to hundreds of megabytes per minute, and a long one to gigabytes; pull it only when you need it, and keep the credit line with whichever file you use.
