# StemProfile (toptube)

**StemProfile** is a clean, zero-dependency web studio designed for cyclists, racers, and directeur sportifs to convert GPX tracks into millimeter-accurate elevation stickers for bicycle stems and top tubes.

Inspired by Grand Tour roadbooks (Tour de France, Giro d'Italia, Vuelta a España), StemProfile creates high-glanceability tactical elevation profiles with kilometer-by-kilometer gradient blocks, categorized climb summits, and customizable race cues.

---

## Key Features

### 1. Grand Tour Block-Segmented Profile
- **Spatial Block Discretization**: Discretizes route elevation into uniform spatial block columns:
  - **`2.5 km (2500m)`** — High-level stage overview for ultra-endurance & long routes
  - **`1.0 km (1000m)`** — Standard Grand Tour roadbook style (default)
  - **`500 m`** — Granular roadbook segments for punchy rolling terrain
  - **`Smooth`** — Continuous spline elevation curve
  - **`Custom`** — User-defined segment size in meters (e.g. 200m, 750m, 1500m, 3000m)
- **In-Block Gradient %**: Displays the exact average gradient percentage (e.g. `8%`, `11%`, `5%`) directly inside each kilometer/block column across all block sizes with adaptive sizing and multi-tier orientation.
- **4 Pro Cycling Gradient Color Zones**:
  - 🟩 **Zone 1 (< 5%)**: Flat / False Flat (`#16a34a` / `#2ea043`)
  - 🟨 **Zone 2 (5% – 8%)**: Moderate Climb (`#d97706` / `#d29922`)
  - 🟧 **Zone 3 (8% – 12%)**: Steep Climb (`#ea580c` / `#db6d28`)
  - 🟥 **Zone 4 (> 12%)**: Severe Gradient (`#dc2626` / `#f85149`)

### 2. Intelligent Anti-Collision Climb Summit Badges
- **UCI Pro Climb Categorization**: Automatically segments sustained ascents into official categories (**HC**, **Cat 1**, **Cat 2**, **Cat 3**, **Cat 4**).
- **Multi-Tier Anti-Collision Engine**: Automatically staggers overlapping climb badges on dense mountain stages (e.g. Queen stages) across vertical shelf tiers and horizontal candidate slots.
- **Leader Line Pin Connectors**: Draws subtle dashed leader lines from elevated badge pills directly to the exact summit pin dot on the terrain profile.

### 3. High-Glanceability Race Waypoints & Feed Cues
- **Tactical Nutritional & Race Markers**:
  - 🍽️ **Feed Zone** (`FEED`)
  - 💧 **Water / Hydration** (`H2O`)
  - 🥪 **Food / Gels / Fuel** (`GEL`)
  - 🟢 **Intermediate Sprints** (`SPRINT`)
  - ⛰️ **Summits & Mountain Passes** (`SUMMIT`)
  - ⚠️ **Caution / Hazards / Gravel** (`CAUTION`)
  - 🔧 **Tech Support / Mechanical** (`TECH`)
  - 🏁 **Checkpoints / Timing** (`CP`)
  - 📍 **Custom Pin** (`PIN`)
- **Automatic GPX Ingestion**: Automatically extracts `<wpt>` nodes from Strava, Komoot, Garmin, and RideWithGPS files with intelligent semantic type classification.
- **Interactive Click-to-Place**: Click anywhere on the vector profile preview to instantly drop new tactical pins at that exact route kilometer.

### 4. Physical Sizing & Print Presets
- **Top Tube**: `110 × 35 mm` (Standard default)
- **Slim Stem**: `100 × 28 mm`
- **Compact Stem**: `75 × 30 mm`
- **Long Top Tube**: `130 × 35 mm`
- **Custom**: User-defined width and height in millimeters.
- **Corner Radius**: Square (`0mm`), Rounded (`2mm`), or Pill (`4mm`).

### 5. Multi-Format Export Pipelines
- **Print Studio & Sheet Setup (`@media print`)**: Interactive WYSIWYG print modal with exact millimeter scaling, precision corner crop marks (L-ticks for straightedge/razor cutting), 50mm scale calibration check ruler, multi-sticker sheet layout (1, 2, 4, 6, 8 copies), paper size selection (A4 / US Letter), and print theme controls.
- **Print Sheet Vector SVG & 300 DPI PNG Download**: Export entire multi-sticker sheets formatted for print shops and label cutters.
- **Share Link (URL Hash for GitHub Pages)**: Compresses route coordinates, telemetry, waypoints, and custom badge positions via `CompressionStream('gzip')` into a shareable URL hash (`#stage=...`) without needing a backend server or database.
- **Download SVG**: Pure vector `.svg` export for plotters and vinyl cutters.
- **Download PNG (300 DPI)**: High-resolution raster export ($px = \frac{\text{mm}}{25.4} \times 300\text{ DPI}$) for label printers.
- **Copy SVG**: Instant one-click clipboard copy.

### 6. Gradient-Aware Pacing
- Fuel cue times come from a cycling power model (`P = v·m·g·(sin θ + Crr·cos θ) + ½·ρ·CdA·v³`) calibrated so the overall moving average still equals your **Avg Speed** — time shifts from descents to climbs instead of assuming one constant speed.
- Cadence feeds are spaced by elapsed time, so they land closer together (in km) on slow climbs; the hourly carb meter and elapsed-time cues use the same model. Switch **Pacing → Constant** for the old behaviour.

### 7. Undo / Redo
- Header buttons and **⌘Z / ⇧⌘Z** (Ctrl+Z / Ctrl+Y) undo edits to settings, waypoints, label positions and the fueling plan. Rapid edits (typing, sliders) merge into one step; text fields keep their native undo.

### 8. Climb Detail Stickers
- **Toggle "Climb Detail"** in the stage toolbar to replace the profile with one zoomed roadbook sticker per categorized climb (same physical size as the elevation sticker).
- Each card shows auto-sized gradient segments (100 m–2 km, up to 20 per climb) with their %, km-to-summit, start & summit elevation, category, length, average/max gradient, gain and estimated climbing time. Summit waypoints name the climb.
- Exports (SVG / PNG / copy) produce the whole set stacked; Print Studio prints each climb `copies` times ("Active View" in climb mode, or the **Climbs** sticker type). Hide a climb in the Climbs panel to drop it.
---

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
toptube/
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
│   ├── share/          # constants.js · binary.js (protocol v3) · payload.js · compression.js · polyline.js · simplify.js
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
├── test/               # node:test suites; fixtures/ holds frozen share links for compatibility tests
└── README.md           # Architecture & user documentation
```

---

## Quickstart

Run any local static web server in the repository root:

```bash
# With just (https://just.systems): serve, test, stamp, check
just serve          # http://localhost:8000
just check          # what CI runs: asset stamps current + both test runners
just stamp          # after editing js/ or css/: refresh cache-busting hashes in index.html

# Using Python 3
python3 -m http.server 8000

# Or using Node
npx serve
```

Open `http://localhost:8000` in any web browser:
1. **Ingest Route**: Drop your `.gpx` file onto the stage or click to browse.
2. **Configure Granularity**: Select **`2.5 km`**, **`1.0 km`**, **`500 m`**, or enter a **`Custom`** block size.
3. **Set Physical Sizing**: Pick your stem or top-tube dimensions (e.g. `110 × 35 mm`).
4. **Fine-Tune Overlays**: Add feed cues or intermediate sprints.
5. **Print or Export**: Press `⌘P` / `Ctrl+P` to print or export **SVG** / **PNG (300 DPI)**.

---

## Privacy & Security

StemProfile operates **100% client-side** in your web browser. No GPX files, coordinates, or telemetry data are ever transmitted over the network or stored on external servers.

