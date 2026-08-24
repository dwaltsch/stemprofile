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

  it('parses coordinates and elevations with comma decimals', () => {
    const gpxXml = `<?xml version="1.0" encoding="UTF-8"?>
    <gpx version="1.1">
      <trk>
        <name>Comma Decimal Track</name>
        <trkseg>
          <trkpt lat="44,1738" lon="5,2786"><ele>300,5</ele></trkpt>
          <trkpt lat="44,1745" lon="5,2800"><ele>320,8</ele></trkpt>
        </trkseg>
      </trk>
    </gpx>`;

    const result = parseGPX(gpxXml);
    assert.equal(result.title, 'Comma Decimal Track');
    assert.equal(result.coords.length, 2);
    assert.equal(result.coords[0].lat, 44.1738);
    assert.equal(result.coords[0].lon, 5.2786);
    assert.equal(result.coords[0].ele, 300.5);
    assert.equal(result.coords[1].ele, 320.8);
  });

  it('parses GPX with uppercase XML tags and attributes', () => {
    const gpxXml = `<?xml version="1.0" encoding="UTF-8"?>
    <GPX VERSION="1.1">
      <TRK>
        <NAME>Uppercase Route</NAME>
        <TRKSEG>
          <TRKPT LAT="45.1" LON="6.1"><ELE>500.0</ELE></TRKPT>
          <TRKPT LAT="45.2" LON="6.2"><ELE>600.0</ELE></TRKPT>
        </TRKSEG>
      </TRK>
    </GPX>`;

    const result = parseGPX(gpxXml);
    assert.equal(result.title, 'Uppercase Route');
    assert.equal(result.coords.length, 2);
    assert.equal(result.coords[0].lat, 45.1);
    assert.equal(result.coords[1].ele, 600.0);
  });

  it('parses namespaced GPX XML elements', () => {
    const gpxXml = `<?xml version="1.0" encoding="UTF-8"?>
    <gpx:gpx xmlns:gpx="http://www.topografix.com/GPX/1/1" version="1.1">
      <gpx:metadata>
        <gpx:name>Namespaced Stage</gpx:name>
      </gpx:metadata>
      <gpx:trk>
        <gpx:trkseg>
          <gpx:trkpt lat="45.0" lon="6.0"><gpx:ele>1200</gpx:ele></gpx:trkpt>
          <gpx:trkpt lat="45.1" lon="6.1"><gpx:ele>1300</gpx:ele></gpx:trkpt>
        </gpx:trkseg>
      </gpx:trk>
      <gpx:wpt lat="45.05" lon="6.05">
        <gpx:name>Feed 1</gpx:name>
        <gpx:sym>Food</gpx:sym>
      </gpx:wpt>
    </gpx:gpx>`;

    const result = parseGPX(gpxXml);
    assert.equal(result.title, 'Namespaced Stage');
    assert.equal(result.coords.length, 2);
    assert.equal(result.coords[0].ele, 1200);
    assert.equal(result.rawWaypoints.length, 1);
    assert.equal(result.rawWaypoints[0].name, 'Feed 1');
  });

  it('extracts title and route points from rte element when trk is absent', () => {
    const gpxXml = `<?xml version="1.0" encoding="UTF-8"?>
    <gpx version="1.1">
      <rte>
        <name>Direct Route Title</name>
        <rtept lat="45.0" lon="6.0"><ele>100</ele></rtept>
        <rtept lat="45.1" lon="6.1"><ele>200</ele></rtept>
      </rte>
    </gpx>`;

    const result = parseGPX(gpxXml);
    assert.equal(result.title, 'Direct Route Title');
    assert.equal(result.coords.length, 2);
    assert.equal(result.coords[0].ele, 100);
    assert.equal(result.coords[1].ele, 200);
  });
});
