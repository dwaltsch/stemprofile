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
- **Print Sheet Ready (`@media print`)**: Exact millimeter scaling with dashed scissor cut guides and multi-sticker sheet layout (1, 2, or 4 copies).
- **Download SVG**: Pure vector `.svg` export for plotters and vinyl cutters.
- **Download PNG (300 DPI)**: High-resolution raster export ($px = \frac{\text{mm}}{25.4} \times 300\text{ DPI}$) for label printers.
- **Copy SVG**: Instant one-click clipboard copy.

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

### 3. UCI Climb Categorization Index
Climbs are evaluated using the official UCI difficulty index based on climb length and average pitch:

$$\text{Score} = \left(\frac{\text{Length}_{\text{m}}}{1000}\right) \times (\text{AvgGrade}_{\%})^2$$

| Category | Elevation Gain | UCI Score Threshold |
| :--- | :--- | :--- |
| **HC (Hors Catégorie)** | $\ge 900\text{ m}$ | $\text{Score} > 180$ |
| **Cat 1** | $\ge 500\text{ m}$ | $\text{Score} > 100$ |
| **Cat 2** | $\ge 280\text{ m}$ | $\text{Score} > 50$ |
| **Cat 3** | $\ge 130\text{ m}$ | $\text{Score} > 25$ |
| **Cat 4** | $\ge 35\text{ m}$ | $\text{Length} \ge 600\text{ m}, \text{Grade} \ge 3\%$ |

---

## Project Structure

```
toptube/
├── index.html          # Clean application layout & control workstation
├── css/
│   └── styles.css      # Dark cockpit & light theme, @media print matrix styles
├── js/
│   ├── parser.js       # Native DOMParser GPX XML ingestion & waypoint extractor
│   ├── signal.js       # Haversine distance, 7-pt MA, spatial blocks, & climb detection
│   ├── renderer.js     # Vector SVG generator & anti-collision layout engine
│   ├── export.js       # 300 DPI canvas rasterizer, SVG download, print sheet
│   └── app.js          # Reactive application controller & event manager
└── README.md           # Architecture & user documentation
```

---

## Quickstart

Run any local static web server in the repository root:

```bash
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

