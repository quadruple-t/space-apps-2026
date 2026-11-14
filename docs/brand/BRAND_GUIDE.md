# Shadowline — Brand & Style Guide

**For:** marketing, comms, partners, and anyone producing Shadowline material
**Version:** 1.0 · November 2026
**Source of truth:** `app/globals.css` (tokens), `app/layout.tsx` (typefaces), `components/brand/logo.tsx` (mark)

This guide is derived directly from the shipped product. If a value here and the code disagree, the code wins — update this document.

Companion files:
- `docs/brand/brand-guide.html` — visual guide (open in a browser to share or screen-record)
- `docs/brand/shadowline-tokens.css` — copy-paste tokens for decks, landing pages, and vendor work

---

## 1. Brand at a glance

**Shadowline** is an interactive 3D mission-planning environment for the lunar south pole. It shows how terrain shapes sunlight and direct-to-Earth line of sight at candidate landing sites.

| | |
|---|---|
| **Name** | Shadowline — one word, capital S, never "Shadow Line" or "ShadowLine" |
| **Tagline** | Where lunar exploration meets mission intelligence. |
| **Hero line** | Beyond the horizon. |
| **Primary CTA** | Launch Freeplay |
| **Context** | Built for the NASA Space Apps Challenge 2026 |
| **Category** | Lunar mission planning · geospatial visualization · science communication |

### Positioning

Most lunar visualizations show a beautiful rock. Shadowline shows a **decision surface**: where the light falls, where Earth stays in view, and what that means for a mission. The brand should feel like an instrument, not a poster — precise, quiet, and confident enough to leave space around the data.

### Audiences

1. **Mission planners and engineers** — care about geometry, windows, and honest provenance.
2. **Space-curious public** — care about the feeling of standing on the Moon.
3. **Hackathon judges and press** — care about clarity, craft, and credibility.
4. **Educators and students** — care about understanding a concept in one screen.

### Three messaging pillars

1. **See the shadow.** Terrain, not latitude, decides light and communications at the pole.
2. **Plan with intent.** Learn the environment, explore freely, then compare candidates side by side.
3. **Honest by design.** Conceptual visuals are always labeled as conceptual. We never imply measured data we do not have.

---

## 2. Voice & tone

Shadowline sounds like a calm flight director explaining something important: short sentences, concrete nouns, no theatrics. The product is cinematic, but the copy is not.

### Principles

- **Precise over poetic.** "Sun elevation +1.6°, grazing the horizon" beats "bathed in ethereal light."
- **Present tense, active voice.** "Shadowline shows how terrain shapes sunlight."
- **One idea per sentence.** Let the visualization carry the emotion.
- **State uncertainty out loud.** Label illustrative values every time they appear.
- **Lead with the decision, not the technology.** "Find the strongest candidate," not "Multi-factor scoring engine."

### Say this / not this

| Say | Not |
|---|---|
| lunar south pole | Moon's South Pole (in body copy; title case is fine in a headline) |
| landing site | landing zone (unless quoting a source) |
| line of sight | LOS (spell it out on first use) |
| illustrative values | sample data · dummy data · fake data |
| Freeplay · Guided Mission · Mission Comparison | the simulator · mode 1 · the app |
| mission planning | mission intelligence platform (unless in the tagline) |

### Avoid

`revolutionary`, `game-changing`, `unlock`, `seamless`, `cutting-edge`, `AI-powered`, `next-generation`, `reimagine`, `supercharge`, `in today's fast-paced world`, exclamation marks, and stacked em-dashes.

### Required disclosures

Any public-facing material that shows the simulator must carry one of these, set in IBM Plex Mono, small, and low-contrast but still legible (see §4):

> Conceptual preview. Procedurally generated terrain and illustrative values, not mission telemetry or LOLA-derived data.

Short form for social or slides:

> Visuals are conceptual. Not affiliated with or endorsed by NASA.

Never crop, hide, or shrink a disclosure below 11 px equivalent.

### Boilerplate

**25 words**
> Shadowline is an interactive 3D mission-planning environment that shows how lunar south pole terrain shapes sunlight and Earth visibility at candidate landing sites.

**50 words**
> Shadowline is an interactive 3D mission-planning environment for the lunar south pole. Explore how terrain shapes sunlight and direct-to-Earth line of sight, learn the environment in a guided mission, roam the terrain in Freeplay, and compare candidate landing sites side by side. Built for the NASA Space Apps Challenge 2026.

**100 words**
> Shadowline is an interactive 3D mission-planning environment for the lunar south pole. At the pole, the Sun never rises far above the horizon, so terrain decides which sites receive light and which keep a direct line to Earth. Shadowline makes that geometry explorable: a guided mission teaches the fundamentals, Freeplay lets you choose coordinates, dates, and camera angles, and Mission Comparison puts candidates side by side. Terrain and science values are illustrative in this release; LOLA elevation data and JPL Horizons ephemerides are the planned sources. Built for the NASA Space Apps Challenge 2026. Not affiliated with or endorsed by NASA.

### Microcopy rules

- **Sentence case** everywhere in UI and marketing body copy. Display headlines are uppercased by CSS, not retyped in caps.
- **Numbers:** one decimal for angles, degree symbol with a space: `+1.6°`, `89.5° S`, `222.7° E`. Use `+` for above-horizon elevations.
- **Dates:** `14 November 2026` in long form; `2026-11-14` only in data contexts.
- **Buttons:** verb first, two to three words. `Launch Freeplay`, `Begin Tutorial`, `Explore the Moon`, `Compare Missions`.
- **Feature status:** always honest. Use the status badge wording `In development` until a feature is live.

---

## 3. Logo

The mark is a lunar disc cut by a ridgeline with the Sun resting on the horizon — the exact moment of grazing light the product is about.

### Construction

- A 1.5 px circular stroke at 32 × 32.
- A filled ridgeline clipped inside the disc, drawn in `currentColor`.
- A coral sun dot (`--sun`, `#ff5364`), always the only colored element.
- Wordmark: `SHADOWLINE` in Archivo, width axis 125, weight 700, `0.95rem`, tracking `0.14em`. Do not retype it in a different tracking.

### Clear space and minimum size

- **Clear space:** at least half the disc diameter on every side (14 px at the 28 px default size). Nothing enters this zone — no text, rules, or image edges.
- **Minimum size:** mark alone `24 × 24 px`. Full lockup `120 px` wide.
- **Preferred lockup:** horizontal, mark left, wordmark right, gap `10 px` (the shipped `gap-2.5`).

### Color

| Background | Mark stroke + ridge | Sun dot | Wordmark |
|---|---|---|---|
| Void `#080712` | Bone `#f0ebf7` | Sun `#ff5364` | Bone |
| Charcoal `#151327` | Bone | Sun | Bone |
| Photography | Bone via a ≥ 60% void scrim | Sun | Bone |
| Light surface (print exceptions only) | Void `#080712` | Sun | Void |

The sun dot is never recolored, outlined, or removed. The mark is never placed on coral, blue, or purple fills.

### Don't

- Don't rotate, skew, stretch, or add a glow/shadow to the mark.
- Don't rebuild the mark from a screenshot or trace the ridgeline by hand — use the SVG.
- Don't put the lockup in a rounded container or add a border around it.
- Don't set the wordmark in another typeface, add letterspacing, or use all-lowercase.
- Don't place the logo over the bright limb of the Moon without a scrim.

**Asset:** the canonical vector is `components/brand/logo.tsx`. Export `LogoMark` and `Logo` from there; do not maintain a second copy.

---

## 4. Color

A dark-only palette. Color is **semantic, not decorative**: each hue maps to something in the simulation.

### Core palette

| Token | Hex | RGB | Role | Contrast on void |
|---|---|---|---|---|
| `void` | `#080712` | 8, 7, 18 | Page background, cinematic base | — |
| `charcoal` | `#151327` | 21, 19, 39 | Cards, panels, raised surfaces | — |
| `line` | `#302c4a` | 48, 44, 74 | Hairline borders, dividers, rules | 1.5:1 (decorative only) |
| `regolith` | `#a39ab8` | 163, 154, 184 | Secondary text, diagram labels | 7.5:1 |
| `bone` | `#f0ebf7` | 240, 235, 247 | Primary text, logo, lunar linework | 17.6:1 |
| `sun` | `#ff5364` | 255, 83, 100 | Sunlight, active control, focus, primary emphasis | 6.4:1 |
| `sun-dim` | `#963752` | 150, 55, 82 | Shadowed sun, muted emphasis | 2.6:1 (large/decorative) |
| `earth` | `#4b9bff` | 75, 155, 255 | Earth, communications, line of sight | 7.1:1 |
| `earth-dim` | `#365588` | 54, 85, 136 | Muted Earth reference | 2.4:1 (decorative) |
| `retro-purple` | `#a986ff` | 169, 134, 255 | Interface chrome, HUD borders, nav accent | 7.2:1 |
| `retro-blue` | `#4b9bff` | 75, 155, 255 | Alias of `earth` | 7.1:1 |
| `retro-red` | `#ff5364` | 255, 83, 100 | Alias of `sun` | 6.4:1 |

> Contrast ratios are computed against `void`. `sun-dim` and `earth-dim` are for fills, glows, and large graphics — not body text.

### Supporting neutrals

| Token | Hex | Use |
|---|---|---|
| `popover` | `#100e20` | Floating panels above void |
| `secondary` / `muted` | `#211d37` | Chips, quiet surfaces |
| `accent` | `#292341` | Hover surface |
| `muted-foreground` | `#b2abc4` | Body copy on dark (9.1:1) |
| `input` | `#45405f` | Field borders |
| `primary-foreground` | `#100d20` | Text on bone buttons |

### Illustration-only colors

These appear inside 3D scenes and diagrams. Do not promote them to UI or marketing chrome.

| Hex | Use |
|---|---|
| `#ece9e2` | Lit lunar surface, linework, stars |
| `#8b8a85` | Shadowed lunar surface, secondary diagram strokes |
| `#26262a` | Diagram terrain fill |
| `#050506` | Deep scene background / silhouette |
| `#5ac7ff` | Earth atmosphere and astronaut accents (3D only) |
| `#ff91a2` | Sun bloom / highlight (3D only) |

### Semantic rules

1. **Coral = Sun.** Sunlight, grazing light, active controls, focus rings, primary emphasis. Never a large decorative fill. Never used to mean "error" by itself.
2. **Blue = Earth.** Earth visibility, communications, line of sight, the second data series. Never "technology" in the abstract.
3. **Purple = Interface.** Navigation, HUD chrome, panel borders, tertiary data points, retro accent. Never a warning or success state.
4. **No new hues.** No green, yellow, orange, teal, or pink beyond the palette. If a chart needs more series, vary opacity, dash pattern, or line weight before adding color.
5. **One accent per composition.** A layout is primarily void, bone, and regolith; a single coral or purple element carries the emphasis.
6. **Gradients are scrims only.** `void → transparent` for text legibility over imagery. No color-to-color marketing gradients, no rainbow meshes.
7. **Dark only.** There is no light theme. Do not invert the palette for print or day-mode proposals; use a dark page or a bone knockout.

### Color proportion

Aim for roughly **60 / 30 / 10**:

- 60% void and charcoal surfaces
- 30% bone, regolith, and lunar imagery
- 10% accent color (coral, blue, purple)

### Accessible text

- Primary text: `bone` at full strength.
- Secondary text: `muted-foreground` or `bone/75`.
- Tertiary/captions: `bone/60` minimum. **Never below `bone/55`** for readable text.
- On coral, blue, or purple fills, use void text (`#080712`), not bone — all three accents are light enough that bone fails contrast.
- Color never carries meaning alone: pair every colored dot with a label, as the HUD does.

---

## 5. Typography

Three typefaces, three jobs. All are open-source Google Fonts and loaded variable where possible.

| Role | Family | Source | Notes |
|---|---|---|---|
| Display & headings | **Archivo** (variable, width axis) | Google Fonts | Width axis is the signature. Use expanded widths, never condensed. |
| Body & UI | **IBM Plex Sans** | Google Fonts | Humanist, technical, highly legible. |
| Data & labels | **IBM Plex Mono** | Google Fonts | Tabular figures for readouts, coordinates, timestamps. |

### Type roles

**`.type-display`** — hero and section-level statements
```
font-family: Archivo
font-variation-settings: "wdth" 125
font-weight: 800
letter-spacing: -0.01em
line-height: 0.92
text-transform: uppercase
```

**`.type-heading`** — section titles, card titles
```
font-family: Archivo
font-variation-settings: "wdth" 118
font-weight: 700
letter-spacing: -0.005em
line-height: 1
text-transform: uppercase
```

**`.type-data`** — instrument readouts, coordinates, eyebrows, captions
```
font-family: IBM Plex Mono
font-variant-numeric: tabular-nums
letter-spacing: 0.02em
```

### Scale

| Level | Size | Face | Treatment |
|---|---|---|---|
| Hero display | `clamp(2.6rem, 7vw, 6.75rem)` | Archivo 800, wdth 125 | Uppercase, line-height 0.92 |
| Page display | `clamp(2.6rem, 7vw, 6rem)` | Archivo 800, wdth 125 | Uppercase |
| CTA display | `clamp(2.3rem, 5.6vw, 5.25rem)` | Archivo 800, wdth 125 | Uppercase |
| Section heading | `clamp(2rem, 5.2vw, 4.25rem)` | Archivo 700, wdth 118 | Uppercase |
| Card title | `1.5rem` | Archivo 700, wdth 118 | Uppercase |
| Lede | `1.25–1.5rem` | Plex Sans 400 | `bone/85`, balanced wrapping |
| Body large | `1.125rem` | Plex Sans 400 | `leading-relaxed`, max 65–70ch |
| Body | `1rem` | Plex Sans 400 | 1.6 line-height |
| Data value | `0.95rem` | Plex Mono 400/500 | Tabular, bone |
| Data label | `0.58–0.68rem` | Plex Mono 400 | Uppercase, tracking `0.14em`, `bone/70` |
| Eyebrow / marker | `0.75rem` | Plex Mono 400 | Uppercase, muted |
| Caption / legal | `0.7–0.75rem` | Plex Mono or Plex Sans | `bone/60` minimum |

### Typesetting rules

- **Display type is tight and wide.** Never add tracking to Archivo; let the width axis do the work.
- **Uppercase is a CSS treatment, not typed content.** Store copy in sentence case so screen readers and translators get normal text.
- **Headlines hang.** Allow display lines to end short; do not balance them into a perfect block. Two to four words per line at hero scale.
- **Body measure:** 60–70 characters. Never run body text full-width in a 1320 px container.
- **Mono is for facts, not paragraphs.** Numbers, coordinates, labels, disclaimers. Never a sentence longer than one line in Plex Mono.
- **No faux bold, italic, or condensed variants.** Use the real axis/weights.
- **Minimum body size:** 16 px on web, 14 px in dense UI, 11 px for legal only.

---

## 6. Layout, spacing, and surfaces

### Grid

- **Container:** max `1320px`, centered.
- **Gutters:** `20px` mobile, `32px` at `sm`, `48px` at `lg`.
- **Breakpoints:** `sm 640` · `md 768` · `lg 1024` · `xl 1280`.
- **Nav height:** `4rem` fixed; scroll padding accounts for it.

### Vertical rhythm

| Context | Spacing |
|---|---|
| Standard section | `96px` (`py-24`), `128px` at `sm` (`sm:py-32`) |
| Page intro | `pt-128`, `pt-160` at `sm` |
| Heading → lede | `24px` |
| Lede → content | `56–64px` |
| Card padding | `24px`, extra `32px` above footer action |
| Footer | `64px` top/bottom |

### Radii

Base radius `6px` (`--radius: 0.375rem`).

| Token | Value | Use |
|---|---|---|
| `sm` | `3.6px` | Chips, tags, tiny controls |
| `md` | `4.8px` | Inputs, small buttons |
| `lg` | `6px` | Cards, primary buttons, panels |
| `xl` | `8.4px` | Large panels |
| `2xl` | `10.8px` | Hero panels, modals |

Fully round is reserved for dots/status markers only. Avoid pill-shaped buttons.

### Borders and elevation

- **Default border:** `1px solid var(--line)`. Rules are hairlines, never thick dividers.
- **Hover border:** `bone/30`.
- **Panels:** `hud-panel` = 1px purple-tinted border, `void` at 82%, 18 px backdrop blur, deep soft shadow, 1 px inner highlight.
- **Shadows:** large, soft, low-opacity (`0 18px 70px rgb(3 2 14 / 34%)`). Never a hard drop shadow. Glows are accent-colored and subtle (`0 0 10px` on status dots; `0 0 32px -6px` purple on primary hover).

### Density

The product is spacious at the page level and dense inside instruments. Marketing layouts should mirror that: generous margins, then compact mono readouts grouped in a panel.

---

## 7. Motion

Motion is restrained and directional. It explains arrival and hierarchy, never decorates.

| Token | Value | Use |
|---|---|---|
| Easing | `cubic-bezier(0.22, 1, 0.36, 1)` (`--ease-out-quint`) | Everything |
| Color/hover | `200ms` | Links, buttons |
| Borders/backdrop | `300ms` | Nav, cards |
| Scroll reveal | `700ms` | Content entering viewport |
| HUD fade | `900ms`, delayed `620–1400ms` | Instrument panels |
| Hero rise | `1100ms`, clip-path reveal | The single orchestrated hero entrance |

Rules:
- **One entrance per page.** The hero headline rises; everything else reveals gently.
- **Stagger 90–120ms**, never more than four items in a sequence.
- **Respect `prefers-reduced-motion`.** No exceptions. Freeze camera movement, disable reveals, remove the hero entrance, render on demand.
- **No bouncing, no spinning, no parallax for its own sake.** Transform and opacity only.

---

## 8. UI and marketing patterns

### Buttons

| Variant | Appearance | Use |
|---|---|---|
| Primary | Bone fill, void text, subtle 1 px light ring; hover to white with a faint purple glow | The single most important action on a screen |
| Outline | Transparent void at 40%, `bone/25` border, blurred backdrop | Secondary action beside a primary |
| Ghost | No fill until hover (`muted`) | Icon buttons, nav, tertiary actions |
| Destructive | Coral at 10% fill, coral text | Delete/irreversible actions only |

Sizes: `sm 28px` · `default 32px` · `lg 40px` · `xl 48px`. Use `xl` for hero CTAs and `lg` for nav.

### Status badge

A hairline-bordered mono chip with a small coral outline dot. Always paired with honest text (`In development`). Never use a filled colored badge.

### HUD readout

The signature brand element: four corner brackets, a colored dot, a mono uppercase label, a mono value, and an optional note.

```
[ dot ] SUN ELEVATION
+1.6°
Grazing the horizon
```

- Dots: bone = neutral, coral = Sun, blue = Earth. Purple is not a readout tone.
- Corner brackets are `2.5` units of `bone/40`. Keep them.
- Use HUD readouts in marketing to make a number feel operational — but only with real or clearly illustrative values.

### Cards

`charcoal/40` fill, `line` border, `6px` radius, hover to `charcoal/70` and `bone/30` border. Index number top-left in mono, status top-right, title in Archivo, body in Plex Sans, outline CTA pinned to the bottom.

### Section marker

A mono eyebrow plus a `48px` hairline rule before a section title. Optional; one per section maximum.

### Illustration style

- **Line-first.** 1.25 px `#ece9e2` strokes at 55–70% opacity, diagrams on `#26262a` fills.
- **Labeled, not decorative.** Every diagram element gets a mono label (`shadow`, `Earth`, `Sun`, `horizon`).
- **No stock photography.** Use product renders, scene stills, or diagrams. If a real lunar photograph is used, credit the source and keep the palette monochrome plus one accent.
- **No astronaut clip-art, rocket icons, or lens flares.** The 3D scene is the hero imagery.

---

## 9. Marketing applications

### Social (1080 × 1080 or 1080 × 1350)

- Void background. One display headline, two to five words, Archivo 800 widened, bone.
- One accent element: a coral sun dot, a blue Earth marker, or a purple rule.
- HUD readout cluster in one corner for texture — values must be illustrative or real.
- Logo bottom-left at 120 px lockup width, clear space preserved.
- Disclosure bottom-right at no less than 11 px equivalent.
- No more than three text elements total.

### Slides (16:9)

- Margins: `64px`. Title `64–96px` display. Body `24–28px` Plex Sans, `muted-foreground`.
- One idea per slide. Dark slides throughout; no white slide in the middle of a deck.
- Charts: `line` grid at 50% opacity, bone axes, one accent series (coral for Sun, blue for Earth, purple for UI). Label directly; avoid a legend when possible.
- Data slides carry a source/provenance line in Plex Mono at the bottom.

### One-pager / print

- Use a dark page if printing in color; otherwise a bone page with void text and coral/blue accents used sparingly.
- 12-column grid, `1320px` equivalent, 8 px spacing base.
- Keep display type at 80% of on-screen size for print legibility.
- Always include the disclaimer and the Space Apps line.

### Video and screen capture

- Capture at 1440p or higher, on void, no browser chrome.
- Keep the HUD in frame; it is the most recognizable brand element.
- Slow, single-direction camera moves. No quick cuts on UI.
- Captions in Plex Sans; timestamps in Plex Mono.
- End card: logo, tagline, URL, disclaimer.

### Co-branding

- **NASA Space Apps Challenge 2026:** follow the challenge's own lockup rules. Keep clear space around both marks; never merge or lock them into a single unit.
- **NASA affiliation:** never imply endorsement. The footer line is mandatory: *Not affiliated with or endorsed by NASA.*
- **Partner logos:** monochrome bone at 60% opacity, separated by a hairline rule, never competing with the Shadowline lockup.

---

## 10. Accessibility checklist

- [ ] Body text ≥ 16 px; secondary text ≥ 4.5:1 contrast.
- [ ] Nothing meaningful conveyed by color alone — every dot has a label.
- [ ] Focus ring: `2px solid #ff5364`, offset `3px`, visible on every interactive element.
- [ ] Hit targets ≥ 36 px; mobile rows ≥ 48 px.
- [ ] Display headlines are real text, not images of text.
- [ ] Alt text describes the insight, not the pixels: "Horizon profile showing the Sun clearing the ridge at +1.6°."
- [ ] Reduced-motion version exists for any animated asset.
- [ ] Disclosures meet the same contrast floor as captions.
- [ ] Video has captions; audio has a transcript.

---

## 11. Tokens appendix

### CSS

```css
:root {
  --void: #080712;
  --charcoal: #151327;
  --regolith: #a39ab8;
  --bone: #f0ebf7;
  --sun: #ff5364;
  --sun-dim: #963752;
  --earth: #4b9bff;
  --earth-dim: #365588;
  --retro-purple: #a986ff;
  --retro-blue: #4b9bff;
  --retro-red: #ff5364;
  --line: #302c4a;

  --muted-foreground: #b2abc4;
  --secondary: #211d37;
  --accent: #292341;
  --input: #45405f;
  --radius: 0.375rem;
  --ease-out-quint: cubic-bezier(0.22, 1, 0.36, 1);
  --nav-height: 4rem;
}
```

### Tailwind names (in-product)

`bg-void` `bg-charcoal` `text-bone` `text-regolith` `text-muted-foreground` `text-sun` `text-earth` `text-retro-purple` `border-line` `bg-charcoal/40` `text-bone/75`

### Fonts

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">
```

Archivo must be loaded with the `wdth` axis; without it the display face collapses to normal width and the brand disappears.

---

## 12. Quick reference card

```
VOID      #080712   background
CHARCOAL  #151327   cards
LINE      #302c4a   hairlines
REGOLITH  #a39ab8   secondary text
BONE      #f0ebf7   primary text

SUN       #ff5364   sunlight / active / focus
EARTH     #4b9bff   Earth / comms / line of sight
PURPLE    #a986ff   interface chrome

DISPLAY   Archivo 800, wdth 125, uppercase, 0.92 leading
HEADING   Archivo 700, wdth 118, uppercase
BODY      IBM Plex Sans 400
DATA      IBM Plex Mono 400/500, tabular

GRID      1320px max · 20/32/48px gutters
SECTION   96/128px vertical
RADIUS    6px
EASE      cubic-bezier(0.22, 1, 0.36, 1)

TAGLINE   Where lunar exploration meets mission intelligence.
DISCLAIMER  Visuals are conceptual. Not affiliated with or endorsed by NASA.
```
