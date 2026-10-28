---
title: "How to credit CC BY video in your own videos"
seoTitle: "How to credit CC BY video (with examples)"
description: "The credit line a CC BY clip needs (title, author, source, licence, changes) and where to put it on YouTube, social posts and client work, with examples."
answer: "Name the clip, its author, where it came from and its licence with a link, and say that you edited it, for example: “Ocean waves 04” by Jane Doe (Wikimedia Commons, https://commons.wikimedia.org/wiki/File:…), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), trimmed and graded. Put it where viewers can find credits: the video description, the end credits, or a credits page you link to."
section: Licensing
kind: howto
steps:
  - name: "Collect the facts when you download"
    text: "Note the clip's title, the author's name or username, the URL of its page and the exact licence with its version. Video Assets Server's attribution field and ATTRIBUTION.md contain all four."
  - name: "Write one line per clip"
    text: "Use the TASL pattern: Title, Author, Source, Licence. Add links to the source page and the licence, and a word about changes such as 'trimmed', 'cropped to 9:16' or 'colour-graded'."
  - name: "Put the credits where viewers look"
    text: "On YouTube, in the description. On Instagram, TikTok and other social posts, in the caption or a pinned comment, or on a credits page linked from your profile. In a film or client video, in the end credits."
  - name: "Keep the paperwork"
    text: "Store the credit lines and licence links in the project folder. If a client, a platform or a rights holder asks where a shot came from, you can answer in minutes."
faq:
  - q: "Do I have to credit CC0 or public-domain footage?"
    a: "No. A short 'footage: Wikimedia Commons (CC0)' line is a courtesy many editors include anyway, and it helps the next person find the source."
  - q: "Does NASA footage need a credit?"
    a: "NASA asks to be credited, for example 'Video: NASA' or the credit line the item gives (such as NASA/Goddard). Video Assets Server writes that line for every NASA clip."
  - q: "What if the author's real name isn't given?"
    a: "Use the name or username they publish under. CC BY asks you to credit the creator in the way they requested, if they did."
  - q: "Is a credit enough for CC BY-SA or CC BY-NC clips?"
    a: "No. A credit satisfies CC BY. Share-alike adds the obligation to license your video the same way, and non-commercial forbids commercial use whatever you credit."
searches:
  - { label: "CC BY footage with ready credit lines", href: "/search?q=nature&providers=wikimediacommons&commercial=true" }
  - { label: "NASA launches (credit NASA)", href: "/search?q=rocket+launch&providers=nasa" }
collections: [free-ocean-footage, free-timelapse-videos, rocket-launch-footage]
related: [free-stock-footage-commercial-use, nasa-footage-rules, ai-agent-find-and-license-footage]
cites:
  - { name: "CC BY 4.0 legal code, section 3(a): attribution", url: "https://creativecommons.org/licenses/by/4.0/legalcode.en#s3a" }
  - { name: "Creative Commons: recommended practices for attribution", url: "https://wiki.creativecommons.org/wiki/Recommended_practices_for_attribution" }
  - { name: "Wikimedia Commons: reusing content outside Wikimedia", url: "https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia" }
published: 2026-10-28
updated: 2026-10-28
order: 2
---

## What CC BY asks for

The Attribution licences ask you to keep four things with the work: who made it, what it is called, where it is published and which licence it is under, plus a note if you changed it. Creative Commons calls this TASL: **T**itle, **A**uthor, **S**ource, **L**icence. Version 4.0 is flexible about format: credit may be given "in any reasonable manner based on the medium, means, and context", and a link to a page that holds the credits is acceptable.

Older versions (CC BY 2.0, 3.0) ask for much the same; follow the version the clip states.

## Copy-paste examples

One clip, in a YouTube description:

```text
Footage: “Ocean waves 04” by Jane Doe (https://commons.wikimedia.org/wiki/File:Ocean_waves_04.webm), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Trimmed and colour-graded.
```

Several clips, as an end-credits or description block:

```text
Stock footage
- “Clouds over the plain” by skywatcher (Wikimedia Commons), CC BY 4.0, https://creativecommons.org/licenses/by/4.0/
- “Rocket launch, pad 39A”, NASA (images.nasa.gov)
- Ocean timelapse from Wikimedia Commons (CC0)
```

The names above are examples. Video Assets Server writes the real line for every clip: copy it from the clip's detail view, read the `attribution` field from the API, or fetch `ATTRIBUTION.md` from `/v1/clips/{id}/credits`. The [sequence builder](/sequence) writes one ATTRIBUTION.md for a whole edit.

## Where the credit goes

- **YouTube, Vimeo**: the description. Put it above the fold if the clip is prominent.
- **Short-form platforms**: the caption, or a credits page linked from your profile when the caption is too short.
- **Client work and ads**: the end credits or the delivery notes, and tell the client: they publish it, so they need the credit too.
- **Films and documentaries**: the end credits, with the stock footage credits.
- **Websites and apps**: a credits or legal page, linked from where the footage appears.

If the clip is cropped to vertical, graded or sped up, say so ("cropped to 9:16"). Indicating changes is part of CC BY 4.0's attribution requirement.
