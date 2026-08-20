# toptube

Create a single-file, zero-dependency `index.html` application called "StemProfile".

Requirements:
1. Ingestion: Drag-and-drop GPX file upload parsed via native browser DOMParser().
2. Signal Processing: Compute cumulative Haversine distance and apply a 7-point moving average to smooth elevation jitter.
3. Slope Calculation: Calculate gradient percentage (Δele / Δdist) and bucket into 4 gradient zones (<5%, 5-8%, 8-12%, >12%).
4. Rendering: Render an SVG elevation profile fitted to configurable physical dimensions (preset 35x110 mm).
5. Styling: Dark mode glassmorphism UI with clean CSS variables.
6. Export: Print-ready CSS `@media print` with exact millimeter sizing and a button for `window.print()`.