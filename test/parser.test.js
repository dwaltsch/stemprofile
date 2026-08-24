/**
 * GPX Parser Test Suite
 *
 * Tests ingestion of standard GPX XML files, track extraction,
 * missing elevation forward-filling, and race waypoint extraction.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/dom-shim.js';
import { parseGPX } from '../js/parser.js';

describe('Parser Module: GPX Ingestion', () => {
  it('parses standard GPX track with trkpt nodes and elevation', () => {
    const gpxXml = `<?xml version="1.0" encoding="UTF-8"?>
    <gpx version="1.1" creator="StravaGPX">
      <metadata>
        <name>Mont Ventoux Ascent</name>
      </metadata>
      <trk>
        <name>Mont Ventoux Ascent</name>
        <trkseg>
          <trkpt lat="44.1738" lon="5.2786"><ele>300.0</ele></trkpt>
          <trkpt lat="44.1745" lon="5.2800"><ele>320.5</ele></trkpt>
          <trkpt lat="44.1750" lon="5.2820"><ele>350.0</ele></trkpt>
        </trkseg>
      </trk>
    </gpx>`;

    const result = parseGPX(gpxXml);
    assert.equal(result.title, 'Mont Ventoux Ascent');
    assert.equal(result.coords.length, 3);
    assert.equal(result.coords[0].lat, 44.1738);
    assert.equal(result.coords[0].lon, 5.2786);
    assert.equal(result.coords[0].ele, 300.0);
    assert.equal(result.coords[2].ele, 350.0);
  });

  it('forward-fills missing elevation data from previous point', () => {
    const gpxXml = `<?xml version="1.0" encoding="UTF-8"?>
    <gpx version="1.1">
      <trk>
        <name>Missing Elevation Test</name>
        <trkseg>
          <trkpt lat="45.00" lon="6.00"><ele>1000.0</ele></trkpt>
          <trkpt lat="45.01" lon="6.01"></trkpt>
          <trkpt lat="45.02" lon="6.02"><ele>1050.0</ele></trkpt>
        </trkseg>
      </trk>
    </gpx>`;

    const result = parseGPX(gpxXml);
    assert.equal(result.coords.length, 3);
    assert.equal(result.coords[1].ele, 1000.0); // Forward-filled from point 0
    assert.equal(result.coords[2].ele, 1050.0);
  });

  it('extracts embedded waypoints with name and symbol attributes', () => {
    const gpxXml = `<?xml version="1.0" encoding="UTF-8"?>
    <gpx version="1.1">
      <wpt lat="45.05" lon="6.05">
        <name>Feed Station 1</name>
        <sym>Food</sym>
        <desc>Water and gels</desc>
      </wpt>
      <trk>
        <name>Route with Waypoint</name>
        <trkseg>
          <trkpt lat="45.00" lon="6.00"><ele>500</ele></trkpt>
          <trkpt lat="45.10" lon="6.10"><ele>600</ele></trkpt>
        </trkseg>
      </trk>
    </gpx>`;

    const result = parseGPX(gpxXml);
    assert.equal(result.rawWaypoints.length, 1);
    assert.equal(result.rawWaypoints[0].name, 'Feed Station 1');
    assert.equal(result.rawWaypoints[0].sym, 'Food');
    assert.equal(result.rawWaypoints[0].desc, 'Water and gels');
  });

  it('throws descriptive error when no trackpoints exist', () => {
    const emptyXml = `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1"><metadata><name>Empty</name></metadata></gpx>`;
    assert.throws(() => parseGPX(emptyXml), /No trackpoints/);
  });
});
