# Fortune Drum — in-game samples (Days of Fortune)

The one Instrument in either game with **four** sounds. Every other percussion
Instrument has eight; the wiki is explicit that the Fortune Drum "offers only 4
sounds instead of the usual 8, all of which are unpitched sounds that do not
correspond to different musical notes". Hence the new `sky-1x4` Shape (labels
sliced from `DRUMS_8_LABELS`' top row, so its keys and number marks stay
byte-identical with the other drums) and the new `drums-4` preset, whose notes
are Assigned Buttons (`pitched: false`) like the rest of the drums.

Source: the `Assets-audio-For-SkyAutoMusicIOS` instrument dump. 4 sounds,
44.1 kHz stereo 192 kbps, 0.43–1.55 s. Pitch detection finds no stable
fundamental on any of them, which is the wiki's "unpitched" confirmed by ear-free
measurement.

Processing (one-off script, see `docs/skills/instrument-from-sequential-capture`):
downmix to mono, trim to onset/tail, DC removal, peak-normalize to ~−3.5 dBFS,
128 kbps CBR mono MP3.

This README is documentation only — the build copies exactly the files
`meta.json` references, so it never ships.
