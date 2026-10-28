---
layout: ../../layouts/DocsLayout.astro
title: Video licences explained
crumb: Video licences explained
description: What CC0, public domain, CC BY, BY-SA, NC and ND, NASA media, uploader-asserted and editorial footage mean for a commercial video, and how verdicts are decided.
---

# Video licences explained

Every clip Video Assets Server returns carries a **licence**, a **verdict** that answers "can this go into a commercial video?", and an **editorial** flag when people, insignia or brands appear without releases. This page explains the licences you will meet, how the verdict is decided, and what to do with each. It is practical guidance, not legal advice.

"Commercial video" here means anything that earns money or promotes something: an ad, a sponsored or monetised video, a client project, a product demo, a paid course.

## The verdicts

| Verdict | API value | What you can do |
| --- | --- | --- |
| Commercial use OK | `yes` | Use it in any video, including ads and client work. No credit needed. |
| Commercial use OK with credit | `yes-with-credit` | Same, as long as you credit the source with the `attribution` line. |
| Restricted: read the conditions | `restricted` | Allowed only under conditions that rule out most projects (share-alike). |
| Needs a paid licence or releases | `clearance-required` | Paid stock: license it per use or by subscription before publishing. |
| Unclear: check the terms | `check-terms` | Nobody verified the licence, or a third party may own the footage. |
| Non-commercial only | `no` | Study and personal projects only. |

The **Commercial-safe** switch (`commercial=true` in the API, `commercial_only` in MCP, on by default for agents) keeps only the first two.

## The editorial flag

A licence covers the copyright in the footage. It does not cover the **people** in it, the **brands and logos** in frame, or an organisation's **insignia**. When those appear without model or property releases, footage is fine for editorial use (news, documentary, education, commentary) but not for advertising, product promotion or anything that implies endorsement.

`license.editorial: true` marks such clips. It is set for all **NASA** footage (NASA forbids implying endorsement and using its insignia, and asks for permission before identifiable astronauts or staff appear in ads) and for **historic and archive footage**, which shows people and brands who never signed a release. A clip can be `yes-with-credit` and editorial at the same time: use it freely in a documentary, but keep it out of an ad.

## Licences you will meet

### Public domain and CC0

**Public domain** footage has no copyright owner: the copyright expired, was never claimed, or the work was made by a US federal agency, whose works are not copyrighted in the US. **CC0** is a creator's dedication of their work to the public domain. Both are `yes`: use, edit and publish freely, no credit required. Crediting the source is still good practice, and publicity, trademark and privacy rights can still apply to what is in frame.

### NASA media

NASA's images and video are generally not copyrighted in the US. NASA asks you to credit it, not to use the NASA insignia or logotype, not to imply endorsement, and to get permission before using identifiable astronauts or staff in advertising. NASA clips are therefore `yes-with-credit` and editorial. Some NASA-hosted footage belongs to a partner (a launch company, a university, another agency) named in the credit line; those clips are `check-terms`. NASA's Scientific Visualization Studio visualisations show data, not people, so they are not flagged editorial. [NASA's media usage guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/).

### CC BY (Attribution)

Use it for anything, including commercial work, if you credit it: title, author, source and licence, with links, and a note that you edited it. The `attribution` field and [ATTRIBUTION.md](/docs/api#credits) give you that line. Verdict `yes-with-credit`. [How to credit CC BY video](/guides/credit-cc-by-video).

### CC BY-SA (ShareAlike)

Like CC BY, but a video that includes the clip must itself be released under CC BY-SA. That works for a Wikipedia explainer, not for a client ad or a broadcast. Verdict `restricted`.

### CC BY-NC and CC BY-ND

**NC** (NonCommercial) rules out commercial use. **ND** (NoDerivatives) forbids sharing adapted versions, and trimming, cropping or grading a clip inside your own edit generally counts as adapting it. Both get `no`. Open archives rarely carry them because this server only searches the Internet Archive for CC0, public-domain and CC BY(-SA) items.

### Uploader-asserted licences

On the Internet Archive anyone can upload a film and pick its licence, and the Archive does not check that choice. Some modern films carry a public-domain mark they should not. These licences are recorded with `assertedBy: "uploader"` and capped at `check-terms`. The **Prelinger Archives** are the exception: the collection's own curators state that its films are public domain. [Public-domain archive films](/guides/prelinger-public-domain-films).

### Free stock site licences (Pexels, Pixabay, Coverr, Mixkit)

These sites use their own licences: free commercial use without credit, but no reselling or redistributing the clips as they are, and rules about identifiable people. They are linked, not searched, so open the clip on the site and read its licence there.

### Paid stock (Shutterstock, Adobe Stock, Getty Images, Storyblocks, Pond5…)

Footage you license per clip or by subscription. Linked searches show where to look; the purchase and the licence happen on their site. Verdict `clearance-required`.

## How a verdict is decided

1. **Read the licence the source states** for that clip (Wikimedia Commons and NASA record it per file; the Internet Archive per item).
2. **Map it to a known licence**: CC0, public domain, CC BY / BY-SA / BY-NC / BY-ND in any version, NASA media, US government work, or the site's own licence.
3. **Apply one table for every source**: CC0 and public domain → `yes`; CC BY and NASA → `yes-with-credit`; SA → `restricted`; NC or ND → `no`; paid → `clearance-required`; nothing stated → `check-terms`.
4. **Cap unverified claims**: a licence asserted by an anonymous uploader is never better than `check-terms`.
5. **Flag editorial footage**: NASA media and historic footage get `editorial: true`.

Each `license` object carries `id` (SPDX where one exists), `name`, `url`, `attributionRequired`, `shareAlike`, `redistribution`, `editorial`, `assertedBy`, `verdict` and a one-line `note`.

## Before you publish

- Keep the credit lines: `GET /v1/clips/{id}/credits` gives ATTRIBUTION.md, and the sequence builder writes one for the whole edit.
- Check the clip's own page for anything unusual (a partner credit, a "courtesy of" line, a takedown notice).
- Keep editorial footage out of ads and endorsements, and get releases for recognisable people and private property you feature.
- Don't re-upload the clips themselves as stock footage unless their licence allows it; free stock site licences such as Pexels' and Pixabay's forbid it.
