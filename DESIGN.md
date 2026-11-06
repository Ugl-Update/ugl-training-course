# How the site looks, and why

The course is a tool people work in on a phone, in the middle of their work, in a second language. The look follows the
rules of a working screen, not of a landing page: colour goes on data and state, type is one face at
readable sizes, surfaces are lightness steps, and nothing decorates. Every value below is a token in
`ugl-site.css`; pages, tools, decks and diagrams read the tokens and never name a colour.

## Colour

| Role | Dark (default) | Light | Token |
|---|---|---|---|
| Ground | jet black `#050505` | cool paper `#f4f3f7` | `--u-bg` |
| Surface, nested surface | `#121014`, `#1c191f` | `#ffffff`, `#f8f7fb` | `--u-surface`, `--u-surface-2` |
| Inset (fields, wells) | `#0b0a0d` | `#edebf2` | `--u-inset` |
| Text, secondary, meta | `#ffffff`, `#dcdce0`, `#95959b` | `#121216`, `#34333a`, `#64636b` | `--u-text`, `--u-text-2`, `--u-muted` |
| Brand field | royal amethyst `#3b0a6b` | the same | `--u-acc` (`-hi` hover, `-deep`, `-rgb` for tints) |
| Brand ink (text on the ground) | pale amethyst `#cdb0ff` | amethyst `#3b0a6b` | `--u-acc-ink` |
| Live hue | electric cyan `#00e5ff` | `#00c2d8` fills, `#00788a` text | `--u-live`, `--u-live-ink` |
| Primary control | inverted: white, black label | black, white label | `--u-primary`, `--u-primary-ink` |
| Good, warning, info | green, amber, blue | darker on light | `--u-green`, `--u-amber`, `--u-blue` |

Where each colour may appear:

- **Amethyst** is a field, not a highlight: the sign-in gate, the stop's hero band, the next-stop block,
  the helper's robot button, its card header and your own questions in it, the faint tint behind a rule
  callout, the mile numeral. Never on
  ordinary buttons, tabs or navigation.
- **Cyan** is the one live hue and the only colour on data: the trip meter and progress meters, the
  current and finished markers on the road and the strip, focus rings, links inside text, the selected
  item in a list, the one hue in a diagram. It should cover a few percent of any screen at most.
- **Green, amber, blue** mean good, warning and information only (a right answer, a scale number over the
  limit, a note). They are never used for decoration.
- **Buttons and tabs are neutral.** The one primary action on a screen is the inverted button
  (`.btn--primary`); everything else is a quiet button on `--u-surface-2` with a 1px line. The active
  tab is the brighter label, not a filled pill.
- **No gradients, no glass or blur, no glow, no shadow on anything at rest.** A shadow belongs only to
  what floats: the zoom overlay, the toast, the helper card, a menu.

## Type

- One face, Archivo, for everything people read: body 16px, labels 12 to 13px in sentence case, titles 20
  to 32px. Lesson titles stop at two lines.
- IBM Plex Mono only for what is a figure or a literal: scale tickets and weights, times and money codes,
  message templates and other text the updater copies word for word, ids. Never for labels, eyebrows,
  chips, navigation or captions.
- No uppercase tracked labels. The wordmark in the top bar is the one exception.
- No index numbering as decoration: no `01 / 02`, no `1.2` in front of headings. A real ordered list
  when the order matters; "Drill 3 of 9" is data and stays.
- Labels say what the thing is in the team's words ("To the broker · email", "Rule", "Collect"), in
  sentence case, in `--u-muted`.

## Shape and space

- Corner radius: cards and panels 8px (`--u-r-card`), controls 6px (`--u-r-ctl`), chips and tags 4px
  (`--u-r-chip`), circles for people and markers. Nothing at 10 to 16px, no pills except the
  Mark-as-read button that floats.
- Surfaces are separated by one lightness step or a 1px line at 9 percent, never both with a shadow.
- Icons: one outline set at 16px, grey, never inside a tinted square or circle. The road's numbered
  circles are data, not icons.
- Spacing on a 4px grid; cards 16 to 20px of padding; sections clearly further apart than anything
  inside them.

## Motion

Motion is feedback, never decoration: a press, a hover on a pointer device, the helper card growing
out of its button, a toast. Transform and opacity only, `ease-out` curves, under 300ms for interface motion, nothing on
keyboard-driven actions, and every move has a reduced-motion fallback that keeps the change and drops
the travel. Curves and durations: `--ease-out: cubic-bezier(.23,1,.32,1)`, `--ease-drawer:
cubic-bezier(.32,.72,0,1)`; press 120ms, tooltip 150ms, the helper card 200ms in and 150ms out (it
scales from .96 at the robot button, never slides in from an edge).

## Checking it

`node <design-skill>/scripts/inspect.mjs --app <page>` measures the rules above on a built page;
the offline preview (`tools/build_preview.py`) is the quickest page to point it at. Fix every FAIL;
a WARN is wrong unless it can be defended in one sentence.
