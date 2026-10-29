# OpenMoji (vendored)

[OpenMoji](https://openmoji.org/) is an open-source emoji project of the HfG
Schwäbisch Gmünd. This folder holds the colour emoji **font** so the icon picker
(`<smd-image-picker>` → "OpenMoji" tab) and `<smd-image image="om:<name>">` work
offline with no third-party requests.

| File | Source |
| --- | --- |
| `OpenMoji-color-glyf_colr_0.woff2` | `https://cdn.jsdelivr.net/gh/hfg-gmuend/openmoji@17.0.0/font/OpenMoji-color-glyf_colr_0/OpenMoji-color-glyf_colr_0.woff2` |
| `openmoji.css` | `font/OpenMoji-color-glyf_colr_0/openmoji.css` from the same release, with the family renamed to `OpenMoji`, `font-display: block` and a local `url()` |

- Version: **17.0.0** (Unicode Emoji 17.0).
- Format: **COLRv0** in OpenType, woff2. Widely supported (Chrome 53+, Edge 79+,
  Firefox 31+, Safari/iOS 11.1+/11.3+). Colour glyphs cannot be tinted by CSS —
  a theme cannot recolour them.
- Multi-codepoint emoji (flags, skin tones, ZWJ families, keycaps) are joined by
  the font's single `ccmp` ligature lookup, so the renderers emit one code point
  per hyphen-separated part of the hexcode.

## Metadata

`shared/vendor/openmoji-icons.json` (`{ "om": { "<name>": { "h": "<HEXCODE>" } } }`)
is generated — do not hand-edit:

```
npm run regen:openmoji      # node shared/regen_openmoji_data.js
```

Names are the kebab-case OpenMoji `annotation` (`grinning face` →
`grinning-face`); the ~12 collisions with a reused annotation get the lowercase
hexcode appended (`donkey-1facf`). Entries keep OpenMoji's own order.

## Licence

All emojis designed by [OpenMoji](https://openmoji.org/) – the open-source emoji
and icon project. License: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

The attribution is shown in every app's Settings page
(`<smd-openmoji-credit>`).
