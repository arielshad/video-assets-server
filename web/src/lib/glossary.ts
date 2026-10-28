/**
 * The glossary (/glossary, /glossary.md): clip, music and licence terms in
 * plain words. Each term has a stable id used as its URL fragment
 * (/glossary#cc-by) and as the DefinedTerm @id in JSON-LD. `see` links point
 * at guides, collections or searches on this site; `ref` at an authoritative
 * external definition (licence deeds, specifications).
 */

export interface Term {
  id: string;
  term: string;
  aliases?: string[];
  group: (typeof GLOSSARY_GROUPS)[number];
  definition: string;
  see?: { label: string; href: string }[];
  ref?: string;
}

export const GLOSSARY_GROUPS = ["Clips", "Music", "Audio files", "Licences and rights", "Tools and formats"] as const;

export const GLOSSARY: Term[] = [
  // Clips
  { id: "clip", term: "Clip", group: "Clips", definition: "A recorded sound reused in new music: a single drum hit, a note, a loop, a vocal phrase or a field recording. Producers trigger, chop, pitch and layer clips in a sampler or DAW.", see: [{ label: "Search clips", href: "/search" }] },
  { id: "one-shot", term: "One-shot", aliases: ["hit"], group: "Clips", definition: "A single sound, such as one kick, one chord or one shout, that plays once when triggered. Drum kits and 808 basslines are built from one-shots.", see: [{ label: "One-shots vs loops", href: "/guides/one-shots-vs-loops" }, { label: "Kick one-shots", href: "/clips/free-kick-clips" }] },
  { id: "loop", term: "Loop", group: "Clips", definition: "A recorded pattern, usually one to eight bars long at a fixed tempo, that repeats seamlessly. Loops carry a performance with feel built in and must be matched to the project's BPM and key.", see: [{ label: "Drum loops", href: "/clips/free-drum-loops" }, { label: "Finding clips by BPM and key", href: "/guides/find-clips-by-bpm-and-key" }] },
  { id: "phrase", term: "Phrase", group: "Clips", definition: "A short performed passage that is not designed to loop, such as a vocal line, a guitar lick or a drum fill." },
  { id: "multisample", term: "Multisample", aliases: ["multisampled instrument"], group: "Clips", definition: "A set of recordings of one instrument at many notes, and often several velocities, mapped across a keyboard so it can be played like the real instrument. Free orchestral and piano libraries are usually multisamples.", see: [{ label: "Piano clips", href: "/clips/free-piano-clips" }] },
  { id: "clip-pack", term: "Clip pack", aliases: ["clip library", "construction kit"], group: "Clips", definition: "A collection of clips sold or given away together, usually in a zip. A construction kit is a pack whose loops share one tempo and key, so they combine into a track." },
  { id: "stem", term: "Stem", group: "Clips", definition: "One part of a mixed track exported on its own, such as drums, bass or vocals. Remix contests and communities such as ccMixter share stems so others can rebuild a song." },
  { id: "a-cappella", term: "A cappella", aliases: ["acapella", "acappella"], group: "Clips", definition: "A vocal performance without the music, often isolated from a song or recorded for remixing. Free a cappellas come mostly from Creative Commons remix communities.", see: [{ label: "Free a cappellas", href: "/clips/free-acapellas" }] },
  { id: "vocal-chop", term: "Vocal chop", group: "Clips", definition: "A short slice of a vocal, often a single syllable, replayed rhythmically or as a melody from a sampler.", see: [{ label: "Free vocal chops", href: "/clips/free-vocal-chops" }] },
  { id: "breakbeat", term: "Breakbeat", aliases: ["break", "drum break"], group: "Clips", definition: "A drum solo section of a record, or any looped acoustic drum performance with that feel. Breaks from commercial records are still copyrighted; openly licensed breaks are the safe alternative.", see: [{ label: "Free breakbeats", href: "/clips/free-breakbeats" }] },
  { id: "foley", term: "Foley", group: "Clips", definition: "Everyday sounds performed and recorded to match picture: footsteps, doors, cloth, paper, glass. Named after Jack Foley, a sound-effects artist at Universal Studios.", see: [{ label: "Footstep sounds", href: "/clips/free-footstep-sounds" }] },
  { id: "ambience", term: "Ambience", aliases: ["atmosphere", "field recording", "soundscape"], group: "Clips", definition: "A recording of a place rather than an event: rain, a forest, a city street, an empty room. Used to set a scene in film and games and for texture under music.", see: [{ label: "Forest ambience", href: "/clips/free-forest-ambience" }] },
  { id: "room-tone", term: "Room tone", group: "Clips", definition: "The background sound of a space when nobody is speaking. Editors use it to fill gaps in dialogue so cuts are inaudible.", see: [{ label: "Room tone recordings", href: "/clips/free-room-tone" }] },
  { id: "riser", term: "Riser", aliases: ["uplifter"], group: "Clips", definition: "An effect that climbs in pitch, filter or volume to build tension into a drop or new section. Its opposite, played after the moment, is a downlifter.", see: [{ label: "Free risers", href: "/clips/free-riser-sound-effects" }, { label: "Downlifters", href: "/clips/free-downlifter-sound-effects" }] },
  { id: "impact", term: "Impact", aliases: ["hit", "boom"], group: "Clips", definition: "A short, heavy hit used to mark a downbeat or a cut, often with a low boom or sub drop.", see: [{ label: "Free impacts", href: "/clips/free-impact-sound-effects" }] },

  // Music
  { id: "808", term: "808", aliases: ["TR-808", "808 bass"], group: "Music", definition: "The Roland TR-808 analogue drum machine (1980–1983), and by extension its long, tuned bass drum used as the bassline in trap, drill and hip hop.", see: [{ label: "What is an 808?", href: "/guides/what-is-an-808" }, { label: "808 clips", href: "/clips/free-808-clips" }] },
  { id: "909", term: "909", aliases: ["TR-909"], group: "Music", definition: "The Roland TR-909 drum machine (1983), with analogue drums and sampled cymbals, whose kick, clap and hats are the foundation of house and techno.", see: [{ label: "TR-909 clips", href: "/clips/free-tr-909-drum-clips" }] },
  { id: "bpm", term: "BPM", aliases: ["tempo", "beats per minute"], group: "Music", definition: "Beats per minute: the tempo of a track or loop. Loops must match the project's BPM, or be time-stretched to it; half and double tempo also fit.", see: [{ label: "Finding clips by BPM and key", href: "/guides/find-clips-by-bpm-and-key" }] },
  { id: "key", term: "Key", aliases: ["musical key", "tonality"], group: "Music", definition: "The set of notes and the home note (tonic) a piece is built on, such as F minor or A major. Melodic clips sound best in the project's key or its relative key.", see: [{ label: "808s in F minor", href: "/search?q=808&category=bass.808&key=F+minor" }] },
  { id: "relative-key", term: "Relative key", group: "Music", definition: "A major and a minor key that share the same notes, such as C major and A minor. A clip in one usually works in a track in the other, so Video Assets Server matches both." },
  { id: "root-note", term: "Root note", group: "Music", definition: "The pitch a one-shot sounds at when played unchanged. A sampler needs it to play the clip in tune across the keyboard." },
  { id: "time-stretching", term: "Time-stretching", aliases: ["warping"], group: "Music", definition: "Changing a clip's length or tempo without changing its pitch. Small changes are transparent; large ones add artefacts." },
  { id: "choke-group", term: "Choke group", group: "Music", definition: "A sampler setting where one sound cuts another off, as a closed hi-hat stops an open one on a real kit." },

  // Audio files
  { id: "clip-rate", term: "Clip rate", group: "Audio files", definition: "How many times per second audio is measured, in hertz. 44.1 kHz is the music standard and 48 kHz the video standard.", see: [{ label: "WAV, AIFF, FLAC or MP3?", href: "/guides/clip-formats-wav-mp3-flac" }] },
  { id: "bit-depth", term: "Bit depth", group: "Audio files", definition: "How precisely each measurement is stored, which sets the dynamic range: about 96 dB at 16-bit, far more at 24-bit. 32-bit float files can't clip inside a DAW." },
  { id: "lossless", term: "Lossless", aliases: ["WAV", "AIFF", "FLAC"], group: "Audio files", definition: "Formats that keep every detail of the recording: uncompressed WAV and AIFF, and losslessly compressed FLAC. Use them for production." },
  { id: "lossy", term: "Lossy", aliases: ["MP3", "Ogg Vorbis", "Opus"], group: "Audio files", definition: "Formats that discard detail to make files smaller, such as MP3, Ogg Vorbis and Opus. Fine for previews; avoid them in a release." },
  { id: "preview", term: "Preview", group: "Audio files", definition: "A lossy, streamable copy of a clip that a site offers for auditioning. Video Assets Server plays previews from the source; the original file is the one to produce with." },

  // Licences and rights
  { id: "copyright", term: "Copyright", group: "Licences and rights", definition: "The exclusive rights a creator holds in a work, including copying and adapting it. A recorded clip is protected unless its owner licenses it, waives the rights or the term has expired." },
  { id: "public-domain", term: "Public domain", aliases: ["PD"], group: "Licences and rights", definition: "Works no one owns, usually because copyright expired or never applied. Anyone may use them for anything. Note that a new recording of an old public-domain piece has its own copyright." },
  { id: "cc0", term: "CC0", aliases: ["CC0 1.0", "public domain dedication"], group: "Licences and rights", definition: "Creative Commons Zero: a tool by which a creator waives all rights in a work as far as the law allows. CC0 clips may be used commercially with no credit.", see: [{ label: "CC0 vs CC BY vs royalty-free", href: "/guides/cc0-vs-cc-by-vs-royalty-free" }], ref: "https://creativecommons.org/publicdomain/zero/1.0/" },
  { id: "cc-by", term: "CC BY", aliases: ["Attribution", "CC BY 4.0", "CC BY 3.0"], group: "Licences and rights", definition: "Creative Commons Attribution: any use, commercial included, as long as you credit the creator, name the work, link the licence and indicate changes.", see: [{ label: "How to credit CC BY clips", href: "/guides/credit-cc-by-clips" }], ref: "https://creativecommons.org/licenses/by/4.0/" },
  { id: "share-alike", term: "ShareAlike (SA)", aliases: ["BY-SA", "CC BY-SA"], group: "Licences and rights", definition: "A Creative Commons condition requiring adaptations to be released under the same licence. For a song that uses an SA clip, the whole track may have to be CC BY-SA, which labels rarely accept.", ref: "https://creativecommons.org/licenses/by-sa/4.0/" },
  { id: "non-commercial", term: "NonCommercial (NC)", aliases: ["BY-NC", "CC BY-NC"], group: "Licences and rights", definition: "A Creative Commons condition forbidding use primarily intended for commercial advantage or money. Selling, royalty-paying streams, monetised videos and beat leases are all commercial.", see: [{ label: "What counts as commercial use?", href: "/guides/what-counts-as-commercial-use" }], ref: "https://creativecommons.org/licenses/by-nc/4.0/" },
  { id: "no-derivatives", term: "NoDerivatives (ND)", aliases: ["BY-ND", "CC BY-ND"], group: "Licences and rights", definition: "A Creative Commons condition allowing only unchanged copies. Placing a clip inside a new track makes an adaptation, so ND sounds can't be sampled.", ref: "https://creativecommons.org/licenses/by-nd/4.0/" },
  { id: "sampling-plus", term: "Sampling+", aliases: ["CC Sampling Plus", "NC Sampling+"], group: "Licences and rights", definition: "A retired Creative Commons licence for sampling: transformation is allowed for any purpose except advertising, while copies of the whole work may only be shared non-commercially. The NC variant forbids commercial use.", see: [{ label: "What is CC Sampling+?", href: "/guides/cc-sampling-plus" }], ref: "https://creativecommons.org/licenses/sampling+/1.0/" },
  { id: "royalty-free", term: "Royalty-free", group: "Licences and rights", definition: "A licence, usually a site's or store's own, that lets you use sounds in your music without paying per use or per sale, while forbidding redistribution of the clips themselves. Royalty-free does not mean free of charge.", see: [{ label: "CC0 vs CC BY vs royalty-free", href: "/guides/cc0-vs-cc-by-vs-royalty-free" }] },
  { id: "attribution", term: "Attribution", aliases: ["credit line", "TASL"], group: "Licences and rights", definition: "The credit a licence requires: the work's title, its author, its source and its licence (TASL), plus a note of changes. Video Assets Server writes the line for every clip that needs one.", see: [{ label: "How to credit CC BY clips", href: "/guides/credit-cc-by-clips" }] },
  { id: "redistribution", term: "Redistribution", group: "Licences and rights", definition: "Sharing the clip files themselves, for example in a pack, a repository or a dataset. Most royalty-free licences forbid it even when they allow use in music." },
  { id: "clearance", term: "Clip clearance", aliases: ["clearing a clip"], group: "Licences and rights", definition: "Getting permission, usually paid, to use a clip from an existing record: from the owner of the recording (master) and from the owner of the composition (publishing).", see: [{ label: "Clip clearance and Content ID", href: "/guides/clip-clearance-and-content-id" }] },
  { id: "master-and-publishing", term: "Master and publishing rights", aliases: ["master", "publishing"], group: "Licences and rights", definition: "The two copyrights in a released song: the sound recording (master), usually owned by a label, and the composition (publishing), owned by songwriters and publishers." },
  { id: "interpolation", term: "Interpolation", aliases: ["replay"], group: "Licences and rights", definition: "Re-recording part of an existing song instead of sampling the original recording. It needs the publisher's permission but not the master owner's." },
  { id: "content-id", term: "Content ID", aliases: ["audio fingerprinting"], group: "Licences and rights", definition: "YouTube's system that matches uploads against reference audio from rights holders. It matches sound, not licences, so a licensed clip can still be claimed and the claim disputed.", see: [{ label: "Clip clearance and Content ID", href: "/guides/clip-clearance-and-content-id" }] },
  { id: "verdict", term: "Licence verdict", group: "Licences and rights", definition: "Video Assets Server's one-word answer to whether a clip can go into a commercial release: yes, yes-with-credit, restricted, clearance-required, check-terms or no.", see: [{ label: "Clip licences explained", href: "/docs/licences" }] },
  { id: "uploader-asserted", term: "Uploader-asserted licence", group: "Licences and rights", definition: "A licence stated by whoever uploaded a file, not verified by the site. Video Assets Server never rates such licences better than check-terms, because uploaders may not own what they share." },

  // Tools and formats
  { id: "daw", term: "DAW", aliases: ["digital audio workstation"], group: "Tools and formats", definition: "Software for recording, arranging and mixing music, such as Ableton Live, FL Studio, Logic Pro or Reaper." },
  { id: "sampler", term: "Sampler", group: "Tools and formats", definition: "An instrument that plays recordings from MIDI notes, pitching them across the keyboard, looping and layering them. Drum racks are samplers specialised for kits." },
  { id: "sfz", term: "SFZ", group: "Tools and formats", definition: "An open, plain-text format that maps audio files to notes, velocities and articulations, read by free samplers such as sfizz. Video Assets Server writes SFZ maps for drum kits.", see: [{ label: "Build a drum kit from free clips", href: "/guides/build-a-drum-kit-from-free-clips" }], ref: "https://sfzformat.com/" },
  { id: "general-midi", term: "General MIDI", aliases: ["GM", "GM drum map"], group: "Tools and formats", definition: "A standard that assigns instruments to MIDI programs and drums to notes (kick 36, snare 38, clap 39, closed hat 42, open hat 46), so patterns play the right sounds on any compatible kit." },
  { id: "midi", term: "MIDI", group: "Tools and formats", definition: "A protocol and file format for musical events (notes, velocities, controllers) rather than audio. MIDI packs give you parts to play with your own sounds." },
  { id: "strudel", term: "Strudel", aliases: ["TidalCycles"], group: "Tools and formats", definition: "A browser-based live-coding environment for music, a JavaScript port of TidalCycles. It loads clips from a clip map and plays patterns written in mini-notation.", see: [{ label: "Kit builder", href: "/kit" }], ref: "https://strudel.cc/" },
  { id: "mcp", term: "MCP", aliases: ["Model Context Protocol"], group: "Tools and formats", definition: "The Model Context Protocol, an open standard for connecting AI assistants to tools and data. Video Assets Server's MCP server lets agents search clips, check licences and build kits.", see: [{ label: "AI agents and MCP", href: "/guides/ai-agents-find-and-license-clips" }], ref: "https://modelcontextprotocol.io/" },
];

export const GLOSSARY_PATH = "/glossary";
export const GLOSSARY_TITLE = "Glossary of clip and licence terms";
export const GLOSSARY_DESCRIPTION = "Plain definitions of the words producers meet when finding clips: one-shot, loop, 808, BPM, key, clip rate, CC0, CC BY, NC, Sampling+, clearance, SFZ.";

const abs = (site: string, path: string) => (path.startsWith("http") ? path : `${site}${path}`);

export function glossaryMarkdown(site: string): string {
  return [
    `# ${GLOSSARY_TITLE}`,
    "",
    `> ${GLOSSARY_DESCRIPTION}`,
    "",
    ...GLOSSARY_GROUPS.flatMap((group) => [
      `## ${group}`,
      "",
      ...GLOSSARY.filter((t) => t.group === group).flatMap((t) => [
        `### ${t.term}`,
        "",
        `${t.definition}${t.aliases?.length ? ` Also: ${t.aliases.join(", ")}.` : ""}`,
        ...(t.see?.length || t.ref ? ["", [...(t.see ?? []).map((s) => `[${s.label}](${abs(site, s.href)})`), ...(t.ref ? [`[reference](${t.ref})`] : [])].join(" · ")] : []),
        "",
      ]),
    ]),
    "---",
    `Source: ${site}${GLOSSARY_PATH}`,
    "",
  ].join("\n");
}
