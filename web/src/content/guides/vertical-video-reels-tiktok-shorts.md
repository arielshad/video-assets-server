---
title: "Vertical video for Reels, TikTok and Shorts: find and crop footage"
seoTitle: "Vertical video for Reels, TikTok and Shorts"
description: "How to find free vertical 9:16 footage, when to crop landscape clips instead, the ffmpeg command for it, and the size short-form platforms expect."
answer: "Search with the orientation set to vertical (or add 'vertical' or '9:16' to the query) to get clips that are already 9:16 and fill a phone screen without losing anything. When only landscape footage fits, crop its centre: a 16:9 frame keeps about a third of its width, so start from 4K where you can. Deliver 1080×1920 and keep subjects and text away from the bottom and right edges, where platforms put their buttons and captions."
section: Production
kind: howto
steps:
  - name: "Search for vertical originals"
    text: "Set Orientation to Vertical in the search, or type 'vertical' or '9:16' with your subject ('vertical ocean waves'). Add a minimum resolution of 1080 so clips fill a 1080×1920 frame."
  - name: "Fall back to landscape, from the biggest source"
    text: "If nothing vertical fits, pick a landscape clip with one central subject, ideally 4K: a 9:16 crop of a 3840×2160 frame is about 1215×2160, enough for 1080×1920 without upscaling."
  - name: "Crop the centre"
    text: "In your editor, set a 9:16 timeline and scale the clip to fill it, then reposition. Or with ffmpeg: crop to the centre and scale to 1080×1920 (command below)."
  - name: "Mind the safe zones"
    text: "Keep faces, products and text in the middle of the frame, away from the bottom and right edges where the caption, account name and buttons sit."
  - name: "Credit and check the licence"
    text: "A crop is a modification: CC BY still needs its credit line (say 'cropped to 9:16'). Editorial-flagged clips stay out of sponsored posts."
faq:
  - q: "What resolution do Reels, TikTok and Shorts use?"
    a: "1080×1920 (9:16) is the standard for all three, and for Stories. Higher-resolution uploads are downscaled; lower ones look soft on modern phones."
  - q: "Can I make a whole vertical b-roll sequence automatically?"
    a: "Yes. Set the sequence builder to 9:16: it prefers vertical originals, and its ffmpeg script scales and centre-crops landscape picks, noting each crop so you can reposition it in your editor."
  - q: "Should I letterbox instead of cropping?"
    a: "Letterboxing (a landscape clip with bars above and below) keeps the whole frame but leaves most of the screen empty. It suits archive or wide shots that would lose their point when cropped; a blurred copy of the clip behind it fills the bars."
searches:
  - { label: "Vertical clips, 1080p+", href: "/search?q=nature&orientation=portrait&min_resolution=1080" }
  - { label: "Vertical NASA visualisations", href: "/search?q=vertical&providers=nasasvs" }
  - { label: "4K landscapes to crop", href: "/search?q=landscape&category=nature&min_resolution=2160&commercial=true" }
collections: [free-vertical-videos, free-vertical-nature-videos, free-4k-nature-footage]
related: [b-roll-sequence-from-shot-list, video-resolution-codecs-containers, credit-cc-by-video]
cites:
  - { name: "FFmpeg filters documentation: crop and scale", url: "https://ffmpeg.org/ffmpeg-filters.html#crop" }
published: 2026-10-28
updated: 2026-10-28
order: 6
---

## Vertical originals beat crops

Short-form video is watched full-screen on a phone held upright. A clip shot vertically uses that whole frame; a landscape clip has to give up most of its width. Free vertical footage is rarer than landscape, but it exists: some NASA visualisations are published in vertical versions, and Wikimedia Commons has phone-shot clips. Free stock sites like Pexels have large vertical libraries too, and every search links to them.

Set **Orientation: Vertical** in the search, or write it in the query: `vertical ocean waves`, `9:16 city night`. The server reads those words as a filter and shows the parsed filter as a chip under the search box.

## The crop maths

| Source | 9:16 crop keeps | Enough for 1080×1920? |
| --- | --- | --- |
| 1920×1080 (1080p) | about 608×1080 | No: upscaled almost 1.8× |
| 2560×1440 (1440p) | 810×1440 | No: upscaled 1.33× |
| 3840×2160 (4K) | about 1215×2160 | Yes |

So for crops, filter by **4K** (`min_resolution=2160`).

## Cropping with ffmpeg

Centre crop to 9:16 and scale to 1080×1920, without audio:

```bash
ffmpeg -i landscape.mp4 -vf "crop=trunc(ih*9/16/2)*2:ih,scale=1080:1920,setsar=1" -c:v libx264 -crf 18 -pix_fmt yuv420p -an vertical.mp4
```

`crop=trunc(ih*9/16/2)*2:ih` takes a 9:16 slice from the middle (rounded to an even width, which H.264 needs). Add `:x=` to move it, for example `crop=trunc(ih*9/16/2)*2:ih:x=iw*0.6-ow/2` to centre on a point 60% across.

The same idea, scale to cover then crop the centre, is what the [sequence builder](/sequence)'s `concat.sh` does for every shot in a 9:16 sequence.

## Safe zones

Each platform overlays its interface on the video: the caption and account name at the bottom, the like, comment and share buttons on the right, sometimes a search bar or tabs at the top. Keep anything important (a face, a product, on-screen text) in the central area of the frame, and pick clips whose action isn't at the very bottom.
