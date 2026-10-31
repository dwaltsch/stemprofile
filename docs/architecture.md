# Architecture

How StemProfile works under the hood. For usage, see the [README](../README.md).

## Security & Robustness

Route files and share links are untrusted input. The app is static (no backend), so the goal is that nothing a file or link contains can run script, freeze the tab or corrupt the stickers:

- **Escaping & CSP**: every user / file / link string is escaped before reaching HTML or SVG (`js/escape.js`), and a Content Security Policy only allows same-origin scripts.
- **Share links**: payloads are inflated through a bounded reader (2 MB cap against compression bombs), links over 1M chars are refused, and decoded settings are type-checked and clamped (`clampSettings`); coordinates are capped at 20k points, waypoints at 255.
- **Route files**: files over 50 MB are refused before reading; `DOCTYPE` / `ENTITY` declarations are rejected (no entity-expansion attacks); invalid or out-of-range coordinates are dropped, impossible elevations filled from neighbours, GPS teleport glitches removed, tracks over 100k points thinned, waypoints capped at 500 and titles / labels length-limited (`js/limits.js`).
- **Render caps**: at most 2,000 profile columns and 64 print cells, whatever the settings.
- **Saved fuel plans** from browser storage are validated field by field; broken entries fall back to a fresh plan.

`test/robustness.test.js` replays the hostile inputs these defences were built against.

---

## Signal Processing & Mathematical Pipeline

### 1. Cumulative Haversine Distance
The cumulative distance $D_i$ between consecutive GPS coordinates $(\phi_1, \lambda_1)$ and $(\phi_2, \lambda_2)$ is computed using spherical trigonometry with Earth radius $R = 6,371,000\text{ m}$:

$$\Delta \phi = \phi_2 - \phi_1, \quad \Delta \lambda = \lambda_2 - \lambda_1$$

$$a = \sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta \lambda}{2}\right)$$

$$d = 2R \cdot \operatorname{atan2}\left(\sqrt{a}, \sqrt{1-a}\right)$$

### 2. 7-Point Moving Average Elevation Filter
GPS and barometric altimeters exhibit quantization steps and high-frequency jitter. A symmetric moving-average window smooths noise while strictly preserving road gradients:

$$E_{\text{smooth}}[i] = \frac{1}{2k+1}\sum_{j=-k}^{k} E_{\text{raw}}[i+j]$$

### 3. Rolling 5-Sample Gradient Filter & Sustained Max Pitch
To eliminate GPS quantization noise and false spikes (e.g. single-point 35% anomalies), gradients are calculated over a stabilized baseline ($\ge 20\text{m}$) and smoothed via a rolling 5-sample moving average filter:

$$G_{\text{filtered}}[i] = \frac{1}{5}\sum_{j=-2}^{2} G_{\text{raw}}[i+j]$$

`Max Gradient` is evaluated over sustained segments ($\ge 50\text{m}$) to report genuine climb pitches.

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

---

## Project Structure

```
stemprofile/
├── index.html          # Clean application layout & control workstation
├── favicon.svg         # Modern vector cycling elevation profile favicon
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
│   │
│   │   # Each entry module below re-exports its folder, so `import … from './share.js'` keeps working.
│   ├── parser.js       # Route file parser registry (format sniffing & dispatch)
│   ├── parsers/        # gpx.js · tcx.js · fit.js · xml-utils.js
│   ├── signal.js       # processTrackSignal pipeline & shared JSDoc types
│   ├── signal/         # geo.js · despike.js · blocks.js · climbs.js · waypoint-match.js
│   ├── renderer.js     # renderProfileSVG: composes the sticker layers
│   ├── renderer/       # themes.js · waypoints-config.js · profile-layers.js · climb-detail.js
│   ├── fueling.js      # Fueling strategy API
│   ├── fueling/        # presets.js · terrain.js · timing.js · pacing.js (power model) · plan.js
│   ├── fueling-renderer.js # Vertical fueling cue sheet SVG
│   ├── export.js       # Export & print API
│   ├── export/         # config.js · print-sheet.js · download.js (SVG / 300 DPI PNG)
│   ├── share.js        # URL hash sharing API (serialize / deserialize / copy link)
│   ├── share/          # constants.js · binary.js (protocol v3) · payload.js · compression.js · simplify.js
│   └── ui/             # Focused UI component controllers
│       ├── workbench.js      # Center preview & elevation / fueling view-mode chrome
│       ├── stats-strip.js    # Route stats, status pill & export button states
│       ├── actions.js        # Header, stage, export & print button wiring
│       ├── mobile-tabs.js    # Mobile segmented tab navigation
│       ├── dropzone.js       # GPX drag & drop target & file parsing
│       ├── controls.js       # Dimension inputs, presets, theme & units
│       ├── print-modal.js    # Print Studio modal & WYSIWYG sheet preview
│       ├── climbs-panel.js   # Climbs table & bi-directional highlighting
│       ├── waypoints-panel.js # Tactical cues form & list
│       ├── fueling-panel.js  # Fueling controls & presets (list in fueling/list.js, reorder in fueling/drag-sort.js)
│       ├── drag-engine.js    # 60fps SVG pointer drag & leader lines
│       ├── tooltip.js        # Instantaneous hover telemetry tracking
│       ├── theme.js          # Light / dark mode persistence
│       └── toast.js          # Non-blocking notification toasts
├── test/               # node:test suites (robustness.test.js replays hostile inputs)
└── README.md           # Architecture & user documentation
```
