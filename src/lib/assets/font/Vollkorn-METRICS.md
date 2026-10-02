# Vollkorn web fonts

The six `Vollkorn-*.woff2` files are modified copies of the normal variable
Vollkorn v30 subsets served by Google Fonts. They remain under the
[SIL Open Font License](../../../../static/assets/licenses/Vollkorn-OFL.txt).

Each file has the same OpenType changes, made with FontTools:

| Table  | Field            | Original | Bundled |
| ------ | ---------------- | -------: | ------: |
| `head` | `unitsPerEm`     |     1000 |     952 |
| `hhea` | `ascent`         |      952 |     930 |
| `hhea` | `descent`        |     -441 |    -210 |
| `OS/2` | `sTypoAscender`  |      952 |     930 |
| `OS/2` | `sTypoDescender` |     -441 |    -210 |

The line gaps remain zero. The smaller em scales the glyphs by about 5% at the
same CSS font size. The ascent and descent give a 16px font a 20px line box in
Chromium: 16px above and 4px below the baseline. This keeps text centered
without CSS font metric descriptors. Glyph
outlines and advance widths were not edited. Windows clipping metrics were
left alone so tall glyphs can still be drawn.

Original files came from
`https://fonts.gstatic.com/s/vollkorn/v30/<suffix>.woff2`:

| Subset       | Suffix                       | Original SHA-256                                                   |
| ------------ | ---------------------------- | ------------------------------------------------------------------ |
| cyrillic-ext | `0yb9GDoxxrvAnPhYGxkkaE0GrQ` | `ced6d4d4fbb0580e7b87ffdd7235eaa0ea13d7647b19ff1dba225beade7b8277` |
| cyrillic     | `0yb9GDoxxrvAnPhYGxktaE0GrQ` | `0a30dfec06879aabe5edaa29e9feb425557f108eb234eb8937da48f23067643d` |
| greek        | `0yb9GDoxxrvAnPhYGxkqaE0GrQ` | `8c67f52775cfcc4b4fb38b9b80cebaaaaf9466baac27d51ab08505a8e17090ab` |
| vietnamese   | `0yb9GDoxxrvAnPhYGxkmaE0GrQ` | `644ecf45a3ccab266280b909a27c29be9025bc4a8b67fc74e4324cb8f41de887` |
| latin-ext    | `0yb9GDoxxrvAnPhYGxknaE0GrQ` | `fd562f72811cac53a5bf14f86732e952a3f5cfd3c61896b7b809e164978fd7dd` |
| latin        | `0yb9GDoxxrvAnPhYGxkpaE0`    | `3d9ff812bd542e52bb7f0c204f3a21152e22aead4572ff09722c1b38f30d7567` |
