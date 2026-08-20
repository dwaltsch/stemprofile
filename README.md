# StemProfile (toptube)

**StemProfile** is a zero-dependency web application designed for cyclists, bikepackers, and race organizers to transform GPX tracks into millimeter-accurate elevation profile stickers for bicycle stems and top tubes.

---

## Features & Methodology

### 1. Client-Side GPX Ingestion
- Uses native browser `DOMParser()` to parse GPX XML without third-party libraries or server uploads.
- Drag-and-drop file upload target with standard file picker support.
- Fully offline and private—all processing happens entirely in the browser.

### 2. Signal Processing & Jitter Smoothing
- **Haversine Great-Circle Distance**: Computes cumulative distance between successive GPS coordinates using Earth radius $R = 6,371,000\,\text{m}$:
  $$\Delta d = 2R \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta \text{lat}}{2}\right) + \cos(\text{lat}_1)\cos(\text{lat}_2)\sin^2\left(\frac{\Delta \text{lon}}{2}\right)}\right)$$
- **7-Point Moving Average Filter**: Applies a sliding window filter over elevation points to eliminate barometric sensor jitter and GPS quantization noise:
  $$\text{ele}_{\text{smooth}}[i] = \frac{1}{2k + 1} \sum_{j = i - k}^{i + k} \text{ele}_{\text{raw}}[j] \quad (k = 3 \text{ for 7-point MA})$$
- Real-time telemetry dashboard calculating total distance, elevation gain ($\uparrow$), elevation loss ($\downarrow$), altitude range, and max/average gradient.

### 3. Slope Calculation & 4-Tier Gradient Bucketing
Computes localized segment slope $\text{Grade} = \left(\frac{\Delta \text{ele}}{\Delta \text{dist}}\right) \times 100\%$ and classifies every section into 4 standardized cycling gradient zones:

| Zone | Gradient Range | Color | Description |
| :--- | :--- | :--- | :--- |
| **Zone 1** | $< 5.0\%$ | `#10b981` (Emerald) | Flat / False Flat / Recovery |
| **Zone 2** | $5.0\% - 8.0\%$ | `#eab308` (Amber) | Moderate Climbing |
| **Zone 3** | $8.0\% - 12.0\%$ | `#f97316` (Orange) | Steep Climbing |
| **Zone 4** | $> 12.0\%$ | `#ef4444` (Crimson) | Extreme Wall |

Includes a real-time gradient distribution bar chart and distance/% breakdown per zone.

### 4. Vector SVG Sticker Rendering
- Vector profile drawing fitted to physical millimeter dimensions with an SVG `viewBox="0 0 W H"`.
- Multi-colored polygon slices reflecting slope zones under the curve.
- Anti-aliased top boundary stroke line.
- Dynamic distance grid ticks and numerical axis labels.
- Min and max altitude markers.
- Route statistics header (Title, Total Distance, Elevation Gain, Max Grade).
- Interactive hover crosshair displaying exact distance, altitude, and gradient at the cursor.
- Outer dashed cut guidelines with customizable corner radii.

### 5. Physical Dimension Presets
- **Standard Top Tube**: `110 × 35 mm` (Default preset)
- **Slim Stem**: `100 × 28 mm`
- **Compact Stem**: `75 × 30 mm`
- **Long Top Tube**: `130 × 35 mm`
- **Custom**: User-configurable Width & Height in millimeters.

### 6. Export & Print Options
- **Print-Ready `@media print`**: Exact physical millimeter scale (`width: var(--sticker-width-mm); height: var(--sticker-height-mm);`) with multi-copy layout options (1, 2, or 4 copies per sheet) and dashed cut marks.
- **Download SVG**: Pure vector `.svg` file export.
- **Download PNG (300 DPI)**: High-resolution raster export rendered via an offscreen canvas for vinyl label printers and cutting plotters.
- **Copy SVG**: One-click SVG markup clipboard copy.

---

## Project Structure

```
toptube/
├── index.html          # Semantic application layout & shell
├── css/
│   └── styles.css      # Dark cockpit UI, CSS variables, & @media print styles
├── js/
│   ├── parser.js       # GPX ingestion via native DOMParser()
│   ├── signal.js       # Haversine distance, 7-point MA, & gradient zones
│   ├── renderer.js     # Exact millimeter SVG profile generator
│   ├── export.js       # Print sheet builder, SVG/PNG export, clipboard
│   └── app.js          # Main application controller & state manager
└── README.md           # Documentation
```

---

## Quickstart

Since the project uses zero external dependencies and standard ES modules, serve the directory with any local HTTP server:

```bash
# Using Python 3
python3 -m http.server 8000

# Or using Node
npx serve
```

Then open `http://localhost:8000` in any modern web browser.

1. Drag and drop your `.gpx` track onto the upload dropzone.
2. Select your desired sticker dimensions or enter custom millimeter measurements.
3. Fine-tune smoothing, theme, and label overlays as needed.
4. Click **Print Sticker** (`⌘P` / `Ctrl+P`) or export to **SVG** / **PNG (300 DPI)**.
