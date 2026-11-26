# Architecture

How StemProfile works under the hood. For usage, see the [README](../README.md).

## Security & Robustness

Route files and share links are untrusted input. The app is static (no backend), so the goal is that nothing a file or link contains can run script, freeze the tab or corrupt the stickers:

- **Escaping & CSP**: every user / file / link string is escaped before reaching HTML or SVG (`js/escape.js`), and a Content Security Policy only allows same-origin scripts.
- **Share links**: payloads are inflated through a bounded reader (2 MB cap against compression bombs), links over 1M chars are refused, and decoded settings are type-checked and clamped (`clampSettings`); coordinates are capped at 20k points, waypoints at 255.
- **Route files**: files over 50 MB are refused before reading; `DOCTYPE` / `ENTITY` declarations are rejected (no entity-expansion attacks); invalid or out-of-range coordinates are dropped, impossible elevations filled from neighbours, GPS teleport glitches removed, tracks over 100k points thinned, waypoints capped at 500 and titles / labels length-limited (`js/limits.js`).
- **Render caps**: at most 2,000 profile columns and 64 print cells, whatever the settings.
- **Saved fuel plans** from browser storage and fuel plans in share links are validated field by field against the route length (`js/fueling/sanitize.js`); broken entries fall back to a fresh plan.

`test/robustness.test.js` replays the hostile inputs these defences were built against.

---

## Signal Processing & Mathematical Pipeline

### 1. Cumulative Haversine Distance
The cumulative distance $D_i$ between consecutive GPS coordinates $(\phi_1, \lambda_1)$ and $(\phi_2, \lambda_2)$ is computed using spherical trigonometry with Earth radius $R = 6,371,000\text{ m}$:

$$\Delta \phi = \phi_2 - \phi_1, \quad \Delta \lambda = \lambda_2 - \lambda_1$$

$$a = \sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta \lambda}{2}\right)$$

$$d = 2R \cdot \operatorname{atan2}\left(\sqrt{a}, \sqrt{1-a}\right)$$

Every filter below works in metres along the route, not in point counts (`js/signal/smooth.js`), so a ride recorded every metre and a route drawn every 100 m give the same numbers. The profile is treated as piecewise linear between points, which keeps each filter exact for any spacing and $O(N)$.

### 2. Distance-Window Elevation Smoothing
GPS and barometric altimeters exhibit quantization steps and high-frequency jitter. Each point becomes the mean elevation of the route within a window of width $w$ around it (truncated at the route ends), integrated exactly over the piecewise-linear profile:

$$E_{\text{smooth}}(d) = \frac{1}{b-a}\int_a^b E(x)\,dx, \quad a = \max(0, d - \tfrac{w}{2}),\; b = \min(D, d + \tfrac{w}{2})$$

The smoothing slider sets $w = 15\text{ m} \times$ its value (default 7, so 105 m).

### 3. Gradients, Sustained Max Pitch & Climbing Totals
- **Point gradient**: slope of the smoothed profile over a fixed $\pm 50\text{ m}$ baseline, clamped to $\pm 35\%$.
- **Max gradient**: the steepest ascent over sustained spans of 50 m (at least 30 m near the route end). Climbs use the same measure, so a climb never quotes a steeper pitch than the route.
- **Elevation gain / loss**: counted with 2 m hysteresis. A change only counts once the profile has moved 2 m in one direction, then counts in full from turning point to turning point, so sensor jitter adds nothing.

### 4. Standard Cycling Climb Difficulty Index
Climbs are categorized using the standard cycling difficulty index:

$$\text{Score} = \text{Distance (km)} \times (\text{AvgGrade}_{\%})^2 = \left(\frac{\text{Length}_{\text{m}}}{1000}\right) \times (\text{AvgGrade}_{\%})^2$$

| Category | Difficulty Score Bracket | Elevation Gain Qualifier |
| :--- | :--- | :--- |
| **HC (Hors Catégorie)** | $\text{Score} \ge 600$ | or $\text{Gain} \ge 800\text{m}$ |
| **Cat 1** | $300 \le \text{Score} < 600$ | or $\text{Gain} \ge 500\text{m}$ |
| **Cat 2** | $150 \le \text{Score} < 300$ | or $\text{Gain} \ge 250\text{m}$ |
| **Cat 3** | $75 \le \text{Score} < 150$ | or $\text{Gain} \ge 120\text{m}$ |
| **Cat 4** | $20 \le \text{Score} < 75$ | or $\text{Gain} \ge 40\text{m}$ ($\text{Length} \ge 500\text{m}, \text{Grade} \ge 3\%$) |

A detected climb also needs at least the "smallest climb" gain (setting `climbMinGainM`, default 35 m).

**Climb ids** are the summit position in decametres, not a list index, so a hidden badge or a dragged badge position stays on its climb when other climbs appear or disappear. When smoothing or the threshold moves a summit by less than 500 m, the climb takes over the id the settings still refer to (`adoptClimbIds`).

**Manual climbs** (`settings.manualClimbs`, `[startM, summitM]` pairs) are measured and categorized like detected ones and replace every detected climb they overlap, which is how riders merge or split climbs.

---

## Project Structure

```
stemprofile/
├── index.html          # Clean application layout & control workstation
├── sw.js               # Service worker: offline copy (precache list + SHA-256 integrity generated by stamp-assets)
├── manifest.webmanifest # Installable app & .gpx / .tcx / .fit file handler
├── favicon.svg         # Modern vector cycling elevation profile favicon
├── info/               # Static "How it works" page for search engines
├── scripts/            # stamp-assets.mjs: asset hashes, import map, CSP hash, sw.js precache
├── css/
│   ├── base.css        # Theme tokens, resets, accessibility helpers
│   ├── header.css      # Header bar, buttons, mobile tab switcher
│   ├── layout.css      # Studio grid, sidebar, form controls
│   ├── stage.css       # Center workbench, zoom, stats strip
│   ├── panels.css      # Climbs, legend, waypoints panels
│   ├── print.css       # Print Studio modal & @media print matrix
│   ├── toast.css       # Toast notifications
│   ├── responsive.css  # Mobile breakpoints
│   └── fueling.css     # Fueling mode & nutrition panel
│                       # (linked in this order in index.html; order matters)
├── js/
│   ├── app.js          # Application coordinator & bootstrapper (store → UI wiring)
│   ├── store.js        # Reactive application state store & event bus
│   ├── units.js        # Unit conversions & coordinate normalizers
│   ├── escape.js       # Shared HTML/SVG escaping for untrusted strings
│   ├── layout.js       # Multi-tier anti-collision solver & leader line geometry
│   ├── limits.js       # Input size limits (route length, points, waypoints, text)
│   ├── load-guard.js   # Only the newest of overlapping file / link loads is applied
│   ├── plan-storage.js # Per-route fuel plans in localStorage (bounded, most-recently-used)
│   ├── example-route.js # Built-in example stage (#example)
│   ├── offline.js      # Service worker registration & files opened with the installed app
│   │
│   │   # Each entry module below re-exports its folder, so `import … from './share.js'` keeps working.
│   ├── parser.js       # Route file parser registry (format sniffing & dispatch)
│   ├── parsers/        # gpx.js · tcx.js · fit.js · xml-utils.js
│   ├── signal.js       # processTrackSignal pipeline & shared JSDoc types
│   ├── signal/         # geo.js · despike.js · smooth.js (distance-domain filters) · blocks.js · climbs.js · waypoint-match.js
│   ├── renderer.js     # renderProfileSVG: composes the sticker layers
│   ├── renderer/       # themes.js · waypoints-config.js · profile-layers.js · climb-detail.js
│   ├── fueling.js      # Fueling strategy API
│   ├── fueling/        # presets.js · terrain.js · timing.js · pacing.js (power model) · plan.js · sanitize.js
│   ├── fueling-renderer.js # Vertical fueling cue sheet SVG
│   ├── export.js       # Export & print API
│   ├── export/         # config.js · print-sheet.js · download.js (SVG / 300 DPI PNG)
│   ├── share.js        # URL hash sharing API (serialize / deserialize / copy link)
│   ├── share/          # constants.js · binary.js (protocol v4: profile, settings, climbs, cues, fuel plan) · payload.js · compression.js · simplify.js
│   └── ui/             # Focused UI component controllers
│       ├── workbench.js      # Center preview & elevation / fueling view-mode chrome
│       ├── stats-strip.js    # Route stats, status pill & export button states
│       ├── actions.js        # Header, stage, export & print button wiring
│       ├── mobile-tabs.js    # Mobile segmented tab navigation
│       ├── dropzone.js       # GPX drag & drop target & file parsing
│       ├── controls.js       # Dimension inputs, presets, theme & units
│       ├── print-modal.js    # Print Studio modal & WYSIWYG sheet preview
│       ├── climbs-panel.js   # Climbs table, bi-directional highlighting & climb editor
│       ├── waypoints-panel.js # Tactical cues form & list
│       ├── fueling-panel.js  # Fueling controls & presets (list in fueling/list.js, reorder in fueling/drag-sort.js)
│       ├── drag-engine.js    # 60fps SVG pointer drag, keyboard label moves & leader lines
│       ├── html.js           # The only place markup is written (Trusted Types ready)
│       ├── error-boundary.js # Per-section render isolation & error toasts
│       ├── tooltip.js        # Instantaneous hover telemetry tracking
│       ├── theme.js          # Light / dark mode persistence
│       └── toast.js          # Non-blocking notification toasts
├── test/               # node:test suites (robustness.test.js replays hostile inputs)
└── README.md           # Architecture & user documentation
```
