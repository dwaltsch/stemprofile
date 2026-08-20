# StemProfile (toptube)

**StemProfile** is a zero-dependency web studio designed for endurance cyclists, racers, and bikepackers to convert GPX files into glance-ready, millimeter-accurate elevation stickers for bicycle stems and top-tubes.

Inspired by the physical roadbook stickers used in the professional peloton (Tour de France, Giro d'Italia, Spring Classics), StemProfile declutters course data into high-contrast elevation profiles with **segmented climb callouts** and **race cue points** that can be read instantly at 40+ km/h.

---

## Key Features

### 1. Glance-Ready Pro Stem Design
- **Climb Segmentation**: Automatically detects and categorizes major climbs (HC, Cat 1, Cat 2, Cat 3, Cat 4) along the route, displaying clean summit badges (`Cat • Length @ Avg %`) and start/summit markers directly over the profile.
- **Race Cue Points**: Add custom markers for **Feed Zones (🥛)**, **Intermediate Sprints (⚡)**, **Gravel Sectors (🪨)**, and **Hazards (⚠️)** at precise kilometer marks.
- **High-Contrast Themes**: Includes **Pro Roadbook White** (solid color-blocked climbs on pure white background—standard in Grand Tour roadbooks) and **Dark Cockpit** (stealth dark mode).

### 2. Client-Side Ingestion & Signal Processing
- **100% Client-Side GPX Ingestion**: Parsed via the native browser `DOMParser()` without external dependencies or server uploads (fully private & offline).
- **Haversine Distance**: Computes cumulative distance using the Earth radius $R = 6,371,000\,\text{m}$.
- **7-Point Moving Average Filter**: Removes barometric GPS quantization jitter while preserving true road gradients.
- **4-Tier Gradient Zones**:
  - **Zone 1 (< 5%)**: Flat / False Flat / Recovery (`#10b981` Emerald)
  - **Zone 2 (5% – 8%)**: Moderate Climbing (`#eab308` Amber)
  - **Zone 3 (8% – 12%)**: Steep Climbing (`#f97316` Orange)
  - **Zone 4 (> 12%)**: Wall / Extreme Pitch (`#ef4444` Crimson)

### 3. Physical Millimeter Sizing & Presets
- **Standard Top Tube**: `110 × 35 mm` (Default)
- **Slim Stem**: `100 × 28 mm`
- **Compact Stem**: `75 × 30 mm`
- **Long Top Tube**: `130 × 35 mm`
- **Custom**: User-defined width and height in millimeters with adjustable corner radius.

### 4. Export & Print Options
- **Print-Ready `@media print`**: Exact millimeter scaling with dashed scissor cut guides and multi-sticker sheet layout (1, 2, or 4 copies).
- **Download SVG**: Pure vector `.svg` export.
- **Download PNG (300 DPI)**: High-resolution raster export via an offscreen canvas for vinyl label printers and cutting plotters.
- **Copy SVG**: Instant clipboard copy.

---

## Project Structure

```
toptube/
├── index.html          # Clean application layout and shell
├── css/
│   └── styles.css      # Cockpit UI, CSS variables, & @media print styles
├── js/
│   ├── parser.js       # GPX ingestion via native DOMParser()
│   ├── signal.js       # Haversine distance, 7-pt MA, & climb segmentation
│   ├── renderer.js     # Exact millimeter SVG profile & climb badge generator
│   ├── export.js       # Print sheet builder, SVG/PNG export, clipboard
│   └── app.js          # Main application controller & state manager
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

Open `http://localhost:8000` in your browser:
1. Drop your `.gpx` route file onto the ingestion dropzone.
2. Review auto-detected climbs in the **Categorized Climb Segments** panel.
3. Add custom race cues (feed zones, sprints, gravel) if desired.
4. Select your stem/top-tube physical sizing preset.
5. Print (`⌘P` / `Ctrl+P`) or export to **SVG** / **PNG (300 DPI)**.
