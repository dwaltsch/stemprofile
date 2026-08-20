# StemProfile (toptube)

**StemProfile** is a clean, zero-dependency web studio designed for cyclists and racers to convert GPX tracks into millimeter-accurate elevation stickers for bicycle stems and top tubes.

---

## Features

### 1. Block-Segmented Pro Elevation Profile
- **Configurable Spatial Block Sizes**: Discretizes route elevation into uniform, blocky segments like Grand Tour roadbooks:
  - **1.0 km (1000m Blocks)** — Standard Grand Tour roadbook style
  - **500m Blocks** — Detailed roadbook segments
  - **250m Blocks** — Fine granularity
  - **100m Blocks** — Micro segments
  - **Smooth** — Continuous gradient curve
- **In-Block Gradient %**: Prints the exact average gradient percentage (e.g. `8%`, `11%`, `5%`) directly inside each kilometer/block column.
- **4 Gradient Color Zones**:
  - **Zone 1 (< 5%)**: Flat / Rolling (`#2ea043` Green)
  - **Zone 2 (5% – 8%)**: Moderate (`#d29922` Yellow)
  - **Zone 3 (8% – 12%)**: Steep (`#db6d28` Orange)
  - **Zone 4 (> 12%)**: Wall (`#f85149` Red)
- **Automatic Climb Segmentation**: Detects sustained climbs (HC, Cat 1, Cat 2, Cat 3, Cat 4) and renders summit badges (`Cat • Length @ Avg %`).
- **High-Glanceability Race Waypoints & Feed Cues**: Ultra-readable custom markers for race pacing and nutrition:
  - 🍽️ **Feed Zone** (`FEED`)
  - 💧 **Water / Hydration** (`H2O`)
  - 🥪 **Food / Gels / Fuel** (`GEL`)
  - 🟢 **Intermediate Sprints** (`SPRINT`)
  - ⛰️ **Summits & Mountain Passes** (`SUMMIT`)
  - ⚠️ **Caution / Hazards / Gravel** (`CAUTION`)
  - 🔧 **Tech Support / Mechanical** (`TECH`)
  - 🏁 **Checkpoints / Timing** (`CP`)
  - Vertical pin-drop line to exact profile elevation terrain with collision-avoidance height staggering.
  - Automatic extraction of `<wpt>` elements from GPX files (Komoot, RideWithGPS, Strava, Garmin) + instant click-to-place on profile preview.

### 2. Client-Side Ingestion & Processing
- **Private & 100% Offline**: Parses GPX XML via the native browser `DOMParser()`.
- **Haversine Distance**: Computes cumulative distance using Earth radius $R = 6,371,000\,\text{m}$.
- **7-Point Moving Average Filter**: Removes barometric GPS quantization jitter while preserving true road gradients.

### 3. Physical Sizing & Presets
- **Top Tube**: `110 × 35 mm` (Default)
- **Slim Stem**: `100 × 28 mm`
- **Compact Stem**: `75 × 30 mm`
- **Long Top Tube**: `130 × 35 mm`
- **Custom**: User-defined width and height in millimeters.

### 4. Export & Print Options
- **Print-Ready `@media print`**: Exact millimeter scaling with dashed scissor cut guides and multi-sticker sheet layout (1, 2, or 4 copies).
- **Download SVG**: Pure vector `.svg` export.
- **Download PNG (300 DPI)**: High-resolution raster export via an offscreen canvas for vinyl label printers.
- **Copy SVG**: Instant clipboard copy.

---

## Project Structure

```
toptube/
├── index.html          # Minimalist application layout
├── css/
│   └── styles.css      # Clean dark theme & @media print styles
├── js/
│   ├── parser.js       # GPX ingestion via native DOMParser()
│   ├── signal.js       # Haversine distance, 7-pt MA, spatial block discretization, & climb detection
│   ├── renderer.js     # Vector SVG block & curve profile generator
│   ├── export.js       # Print sheet builder, SVG/PNG export, clipboard
│   └── app.js          # Application controller & state manager
└── README.md           # Documentation
```

---

## Quickstart

Run a local static server in the project directory:

```bash
# Using Python 3
python3 -m http.server 8000

# Or using Node
npx serve
```

Open `http://localhost:8000` in any web browser:
1. Drop your `.gpx` route file onto the track dropzone.
2. Select your desired **Segment Block Size** (e.g. `1.0 km`, `500m`, `250m`, `100m`).
3. Select your stem/top-tube physical dimensions.
4. Print (`⌘P` / `Ctrl+P`) or export to **SVG** / **PNG (300 DPI)**.
