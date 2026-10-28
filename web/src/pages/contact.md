---
layout: ../layouts/PageLayout.astro
title: Contact
description: How to reach the Video Assets Server maintainers for support, bug reports, security issues, source and licence questions, and requests from video sites.
schemaType: ContactPage
---

# Contact

Video Assets Server is maintained in the open on GitHub. There is no support email or phone line: GitHub is the fastest way to reach the people who run it.

## Support and bug reports

Open an issue at [github.com/arielshad/video-assets-server/issues](https://github.com/arielshad/video-assets-server/issues). Helpful details: the search query or clip id (for example `nasa:GSFC_20161212_Tidal_m12450_Magnetic`), the URL or MCP tool you called, what you expected and what happened. For API problems, include the response status and body. For a clip that won't play, say which browser you used.

## Security

Please do not open a public issue for a vulnerability. Report it privately through GitHub's security advisories at [github.com/arielshad/video-assets-server/security/advisories/new](https://github.com/arielshad/video-assets-server/security/advisories/new). You will get an acknowledgement, and fixes are released as soon as they are ready.

## Video sites and licences

If you run one of the sites the service searches or links to and want your source changed, rate-limited further or removed, or if a licence or verdict is shown incorrectly, open an issue with the clip id or source name. Requests from site owners are handled first. Video is never hosted here, so questions about using a specific clip go to its creator on the source site.

If you are a creator and believe a clip of yours appears under the wrong licence on a source site, contact that site first: Video Assets Server shows what the source states, and will mark or hide the result once the source corrects it.

## Partnerships and integrations

Building something on top of the API or the MCP server, or want your footage library added as a source? Open an issue describing the integration. Sources are searched directly only when their terms allow automated search and the integration passes the test suite against the live site; the others get deep links.
