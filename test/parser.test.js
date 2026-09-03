/**
 * GPX Parser Test Suite
 *
 * Tests ingestion of standard GPX XML files, track extraction,
 * missing elevation forward-filling, and race waypoint extraction.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/dom-shim.js';
import {
  parseGPX,
  parseTCX,
  parseFIT,
  isFitBuffer,
  isIsoTimestamp,
  parseRouteFile,
  registerParser,
  getSupportedExtensions,
  isBinaryExtension,
  getParserForFile
} from '../js/parser.js';
import { createStore } from '../js/store.js';

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

describe('Parser Module: TCX Ingestion', () => {
  it('parses standard TCX course with trackpoints and elevation', () => {
    const tcxXml = `<?xml version="1.0" encoding="UTF-8"?>
    <TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
      <Courses>
        <Course>
          <Name>Belgian Waffle Ride</Name>
          <Track>
            <Trackpoint>
              <Position>
                <LatitudeDegrees>33.1234</LatitudeDegrees>
                <LongitudeDegrees>-117.1234</LongitudeDegrees>
              </Position>
              <AltitudeMeters>120.5</AltitudeMeters>
            </Trackpoint>
            <Trackpoint>
              <Position>
                <LatitudeDegrees>33.1240</LatitudeDegrees>
                <LongitudeDegrees>-117.1250</LongitudeDegrees>
              </Position>
              <AltitudeMeters>135.0</AltitudeMeters>
            </Trackpoint>
            <Trackpoint>
              <Position>
                <LatitudeDegrees>33.1250</LatitudeDegrees>
                <LongitudeDegrees>-117.1270</LongitudeDegrees>
              </Position>
              <AltitudeMeters>150.2</AltitudeMeters>
            </Trackpoint>
          </Track>
        </Course>
      </Courses>
    </TrainingCenterDatabase>`;

    const result = parseTCX(tcxXml);
    assert.equal(result.title, 'Belgian Waffle Ride');
    assert.equal(result.coords.length, 3);
    assert.equal(result.coords[0].lat, 33.1234);
    assert.equal(result.coords[0].lon, -117.1234);
    assert.equal(result.coords[0].ele, 120.5);
    assert.equal(result.coords[2].ele, 150.2);
  });

  it('parses TCX activity with laps and trackpoints', () => {
    const tcxXml = `<?xml version="1.0" encoding="UTF-8"?>
    <TrainingCenterDatabase>
      <Activities>
        <Activity Sport="Biking">
          <Id>2023-06-15T07:00:00Z</Id>
          <Notes>Morning Gran Fondo Ride</Notes>
          <Lap>
            <Track>
              <Trackpoint>
                <Position>
                  <LatitudeDegrees>46.0</LatitudeDegrees>
                  <LongitudeDegrees>7.0</LongitudeDegrees>
                </Position>
                <AltitudeMeters>500</AltitudeMeters>
              </Trackpoint>
              <Trackpoint>
                <Position>
                  <LatitudeDegrees>46.1</LatitudeDegrees>
                  <LongitudeDegrees>7.1</LongitudeDegrees>
                </Position>
                <AltitudeMeters>550</AltitudeMeters>
              </Trackpoint>
            </Track>
          </Lap>
        </Activity>
      </Activities>
    </TrainingCenterDatabase>`;

    const result = parseTCX(tcxXml);
    assert.equal(result.title, 'Morning Gran Fondo Ride');
    assert.equal(result.coords.length, 2);
    assert.equal(result.coords[0].lat, 46.0);
    assert.equal(result.coords[1].lat, 46.1);
  });

  it('parses TCX activity Id as title when notes or course name are absent', () => {
    const tcxXml = `<?xml version="1.0" encoding="UTF-8"?>
    <TrainingCenterDatabase>
      <Activities>
        <Activity Sport="Biking">
          <Id>2026-09-03T07:31:52.000Z</Id>
          <Lap>
            <Track>
              <Trackpoint>
                <Position>
                  <LatitudeDegrees>46.0</LatitudeDegrees>
                  <LongitudeDegrees>7.0</LongitudeDegrees>
                </Position>
                <AltitudeMeters>500</AltitudeMeters>
              </Trackpoint>
              <Trackpoint>
                <Position>
                  <LatitudeDegrees>46.1</LatitudeDegrees>
                  <LongitudeDegrees>7.1</LongitudeDegrees>
                </Position>
                <AltitudeMeters>550</AltitudeMeters>
              </Trackpoint>
            </Track>
          </Lap>
        </Activity>
      </Activities>
    </TrainingCenterDatabase>`;

    const result = parseTCX(tcxXml);
    assert.equal(result.title, '2026-09-03T07:31:52.000Z');
  });

  it('correctly identifies ISO 8601 timestamps and date codes via isIsoTimestamp', () => {
    assert.equal(isIsoTimestamp('2026-09-03T07:31:52.000Z'), true);
    assert.equal(isIsoTimestamp('2026-09-03T07:31:52Z'), true);
    assert.equal(isIsoTimestamp('2026-09-03 07:31:52'), true);
    assert.equal(isIsoTimestamp('2026-09-03_07-31-52'), true);
    assert.equal(isIsoTimestamp('Passo dello Stelvio'), false);
    assert.equal(isIsoTimestamp('Stage 4 - Galibier'), false);
    assert.equal(isIsoTimestamp('StemProfile'), false);
    assert.equal(isIsoTimestamp(''), false);
    assert.equal(isIsoTimestamp(null), false);
  });

  it('forward-fills missing elevation data in TCX', () => {
    const tcxXml = `<?xml version="1.0" encoding="UTF-8"?>
    <TrainingCenterDatabase>
      <Courses>
        <Course>
          <Name>Elevation Gap Test</Name>
          <Track>
            <Trackpoint>
              <Position>
                <LatitudeDegrees>44.0</LatitudeDegrees>
                <LongitudeDegrees>5.0</LongitudeDegrees>
              </Position>
              <AltitudeMeters>800.0</AltitudeMeters>
            </Trackpoint>
            <Trackpoint>
              <Position>
                <LatitudeDegrees>44.1</LatitudeDegrees>
                <LongitudeDegrees>5.1</LongitudeDegrees>
              </Position>
            </Trackpoint>
            <Trackpoint>
              <Position>
                <LatitudeDegrees>44.2</LatitudeDegrees>
                <LongitudeDegrees>5.2</LongitudeDegrees>
              </Position>
              <AltitudeMeters>950.0</AltitudeMeters>
            </Trackpoint>
          </Track>
        </Course>
      </Courses>
    </TrainingCenterDatabase>`;

    const result = parseTCX(tcxXml);
    assert.equal(result.coords.length, 3);
    assert.equal(result.coords[0].ele, 800.0);
    assert.equal(result.coords[1].ele, 800.0); // Forward-filled from point 0
    assert.equal(result.coords[2].ele, 950.0);
  });

  it('skips trackpoints without GPS Position coordinates', () => {
    const tcxXml = `<?xml version="1.0" encoding="UTF-8"?>
    <TrainingCenterDatabase>
      <Courses>
        <Course>
          <Name>Dropout Test</Name>
          <Track>
            <Trackpoint>
              <Position>
                <LatitudeDegrees>45.0</LatitudeDegrees>
                <LongitudeDegrees>6.0</LongitudeDegrees>
              </Position>
              <AltitudeMeters>100</AltitudeMeters>
            </Trackpoint>
            <Trackpoint>
              <AltitudeMeters>110</AltitudeMeters>
              <HeartRateBpm><Value>140</Value></HeartRateBpm>
            </Trackpoint>
            <Trackpoint>
              <Position>
                <LatitudeDegrees>45.1</LatitudeDegrees>
                <LongitudeDegrees>6.1</LongitudeDegrees>
              </Position>
              <AltitudeMeters>120</AltitudeMeters>
            </Trackpoint>
          </Track>
        </Course>
      </Courses>
    </TrainingCenterDatabase>`;

    const result = parseTCX(tcxXml);
    assert.equal(result.coords.length, 2);
    assert.equal(result.coords[0].lat, 45.0);
    assert.equal(result.coords[1].lat, 45.1);
  });

  it('extracts embedded CoursePoint waypoints with names, types, and notes', () => {
    const tcxXml = `<?xml version="1.0" encoding="UTF-8"?>
    <TrainingCenterDatabase>
      <Courses>
        <Course>
          <Name>Course With Cues</Name>
          <Track>
            <Trackpoint>
              <Position><LatitudeDegrees>44.0</LatitudeDegrees><LongitudeDegrees>5.0</LongitudeDegrees></Position>
              <AltitudeMeters>100</AltitudeMeters>
            </Trackpoint>
            <Trackpoint>
              <Position><LatitudeDegrees>44.5</LatitudeDegrees><LongitudeDegrees>5.5</LongitudeDegrees></Position>
              <AltitudeMeters>500</AltitudeMeters>
            </Trackpoint>
          </Track>
          <CoursePoint>
            <Name>Water Oasis</Name>
            <Position><LatitudeDegrees>44.2</LatitudeDegrees><LongitudeDegrees>5.2</LongitudeDegrees></Position>
            <PointType>Water</PointType>
            <Notes>Cold water refill</Notes>
          </CoursePoint>
          <CoursePoint>
            <Name>Summit Pass</Name>
            <Position><LatitudeDegrees>44.5</LatitudeDegrees><LongitudeDegrees>5.5</LongitudeDegrees></Position>
            <PointType>Summit</PointType>
            <Notes>Pass peak 1200m</Notes>
          </CoursePoint>
        </Course>
      </Courses>
    </TrainingCenterDatabase>`;

    const result = parseTCX(tcxXml);
    assert.equal(result.rawWaypoints.length, 2);
    assert.equal(result.rawWaypoints[0].name, 'Water Oasis');
    assert.equal(result.rawWaypoints[0].sym, 'Water');
    assert.equal(result.rawWaypoints[0].desc, 'Cold water refill');
    assert.equal(result.rawWaypoints[0].typeStr, 'Water');

    assert.equal(result.rawWaypoints[1].name, 'Summit Pass');
    assert.equal(result.rawWaypoints[1].sym, 'Summit');
  });

  it('parses TCX with comma decimals in coordinates and elevations', () => {
    const tcxXml = `<?xml version="1.0" encoding="UTF-8"?>
    <TrainingCenterDatabase>
      <Courses>
        <Course>
          <Name>Comma Course</Name>
          <Track>
            <Trackpoint>
              <Position>
                <LatitudeDegrees>44,1738</LatitudeDegrees>
                <LongitudeDegrees>5,2786</LongitudeDegrees>
              </Position>
              <AltitudeMeters>300,5</AltitudeMeters>
            </Trackpoint>
            <Trackpoint>
              <Position>
                <LatitudeDegrees>44,1745</LatitudeDegrees>
                <LongitudeDegrees>5,2800</LongitudeDegrees>
              </Position>
              <AltitudeMeters>320,8</AltitudeMeters>
            </Trackpoint>
          </Track>
        </Course>
      </Courses>
    </TrainingCenterDatabase>`;

    const result = parseTCX(tcxXml);
    assert.equal(result.coords.length, 2);
    assert.equal(result.coords[0].lat, 44.1738);
    assert.equal(result.coords[0].lon, 5.2786);
    assert.equal(result.coords[0].ele, 300.5);
    assert.equal(result.coords[1].ele, 320.8);
  });

  it('parses namespaced TCX XML elements', () => {
    const tcxXml = `<?xml version="1.0" encoding="UTF-8"?>
    <tcx:TrainingCenterDatabase xmlns:tcx="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
      <tcx:Courses>
        <tcx:Course>
          <tcx:Name>Namespaced TCX Course</tcx:Name>
          <tcx:Track>
            <tcx:Trackpoint>
              <tcx:Position>
                <tcx:LatitudeDegrees>43.5</tcx:LatitudeDegrees>
                <tcx:LongitudeDegrees>4.5</tcx:LongitudeDegrees>
              </tcx:Position>
              <tcx:AltitudeMeters>50</tcx:AltitudeMeters>
            </tcx:Trackpoint>
            <tcx:Trackpoint>
              <tcx:Position>
                <tcx:LatitudeDegrees>43.6</tcx:LatitudeDegrees>
                <tcx:LongitudeDegrees>4.6</tcx:LongitudeDegrees>
              </tcx:Position>
              <tcx:AltitudeMeters>75</tcx:AltitudeMeters>
            </tcx:Trackpoint>
          </tcx:Track>
        </tcx:Course>
      </tcx:Courses>
    </tcx:TrainingCenterDatabase>`;

    const result = parseTCX(tcxXml);
    assert.equal(result.title, 'Namespaced TCX Course');
    assert.equal(result.coords.length, 2);
    assert.equal(result.coords[0].lat, 43.5);
    assert.equal(result.coords[1].ele, 75);
  });

  it('throws descriptive error when no trackpoints exist in TCX', () => {
    const emptyXml = `<?xml version="1.0" encoding="UTF-8"?><TrainingCenterDatabase><Courses><Course><Name>Empty</Name></Course></Courses></TrainingCenterDatabase>`;
    assert.throws(() => parseTCX(emptyXml), /No trackpoints/);
  });

  it('throws descriptive error when fewer than 2 coordinates exist in TCX', () => {
    const singlePointXml = `<?xml version="1.0" encoding="UTF-8"?>
    <TrainingCenterDatabase>
      <Courses>
        <Course>
          <Track>
            <Trackpoint>
              <Position><LatitudeDegrees>45.0</LatitudeDegrees><LongitudeDegrees>6.0</LongitudeDegrees></Position>
              <AltitudeMeters>100</AltitudeMeters>
            </Trackpoint>
          </Track>
        </Course>
      </Courses>
    </TrainingCenterDatabase>`;
    assert.throws(() => parseTCX(singlePointXml), /at least 2 valid coordinates/);
  });
});

describe('Parser Module: Modular Registry & Dispatcher', () => {
  it('returns supported extensions including .gpx and .tcx', () => {
    const extensions = getSupportedExtensions();
    assert.ok(extensions.includes('.gpx'));
    assert.ok(extensions.includes('.tcx'));
  });

  it('identifies binary extensions accurately', () => {
    assert.equal(isBinaryExtension('route.gpx'), false);
    assert.equal(isBinaryExtension('stage.tcx'), false);
    assert.equal(isBinaryExtension('unknown.txt'), false);
  });

  it('dispatches to parseGPX via parseRouteFile with .gpx filename', () => {
    const gpxXml = `<?xml version="1.0"?>
    <gpx version="1.1"><trk><name>GPX Track</name><trkseg>
      <trkpt lat="45.0" lon="6.0"><ele>100</ele></trkpt>
      <trkpt lat="45.1" lon="6.1"><ele>200</ele></trkpt>
    </trkseg></trk></gpx>`;

    const result = parseRouteFile(gpxXml, 'mont-ventoux.gpx');
    assert.equal(result.title, 'GPX Track');
    assert.equal(result.coords.length, 2);
  });

  it('dispatches to parseTCX via parseRouteFile with .tcx filename', () => {
    const tcxXml = `<?xml version="1.0"?>
    <TrainingCenterDatabase><Courses><Course><Name>TCX Course</Name><Track>
      <Trackpoint><Position><LatitudeDegrees>45.0</LatitudeDegrees><LongitudeDegrees>6.0</LongitudeDegrees></Position><AltitudeMeters>100</AltitudeMeters></Trackpoint>
      <Trackpoint><Position><LatitudeDegrees>45.1</LatitudeDegrees><LongitudeDegrees>6.1</LongitudeDegrees></Position><AltitudeMeters>200</AltitudeMeters></Trackpoint>
    </Track></Course></Courses></TrainingCenterDatabase>`;

    const result = parseRouteFile(tcxXml, 'bwr-san-diego.tcx');
    assert.equal(result.title, 'TCX Course');
    assert.equal(result.coords.length, 2);
  });

  it('sniffs format from content when file extension is absent or ambiguous', () => {
    const tcxXml = `<TrainingCenterDatabase><Courses><Course><Name>Sniffed TCX</Name><Track>
      <Trackpoint><Position><LatitudeDegrees>45.0</LatitudeDegrees><LongitudeDegrees>6.0</LongitudeDegrees></Position><AltitudeMeters>100</AltitudeMeters></Trackpoint>
      <Trackpoint><Position><LatitudeDegrees>45.1</LatitudeDegrees><LongitudeDegrees>6.1</LongitudeDegrees></Position><AltitudeMeters>200</AltitudeMeters></Trackpoint>
    </Track></Course></Courses></TrainingCenterDatabase>`;

    const result = parseRouteFile(tcxXml, 'route.xml');
    assert.equal(result.title, 'Sniffed TCX');
  });

  it('throws descriptive error on unsupported file format', () => {
    assert.throws(() => parseRouteFile('dummy content', 'stage.unsupported'), /Unsupported route file format/);
  });

  it('supports registering a new modular parser (custom extension pluggability)', () => {
    // Register a mock custom binary parser
    registerParser({
      id: 'custom-mock',
      name: 'Custom Protocol Mock',
      extensions: ['.custom'],
      isBinary: true,
      sniff: (content) => content instanceof Uint8Array,
      parse: (content, fileName) => ({
        title: 'Mock Custom Stage',
        coords: [
          { lat: 45.0, lon: 6.0, ele: 100 },
          { lat: 45.1, lon: 6.1, ele: 200 }
        ],
        rawWaypoints: []
      })
    });

    assert.ok(getSupportedExtensions().includes('.custom'));
    assert.equal(isBinaryExtension('stage.custom'), true);

    const mockBuffer = new Uint8Array([1, 2, 3]);
    const result = parseRouteFile(mockBuffer, 'stage.custom');
    assert.equal(result.title, 'Mock Custom Stage');
    assert.equal(result.coords.length, 2);
  });

  it('end-to-end: ingests parsed TCX route into Store and verifies waypoint categorization', () => {
    const tcxXml = `<?xml version="1.0" encoding="UTF-8"?>
    <TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
      <Courses>
        <Course>
          <Name>Unbound Gravel 200</Name>
          <Track>
            <Trackpoint>
              <Position><LatitudeDegrees>38.400</LatitudeDegrees><LongitudeDegrees>-96.180</LongitudeDegrees></Position>
              <AltitudeMeters>350</AltitudeMeters>
            </Trackpoint>
            <Trackpoint>
              <Position><LatitudeDegrees>38.420</LatitudeDegrees><LongitudeDegrees>-96.180</LongitudeDegrees></Position>
              <AltitudeMeters>380</AltitudeMeters>
            </Trackpoint>
            <Trackpoint>
              <Position><LatitudeDegrees>38.440</LatitudeDegrees><LongitudeDegrees>-96.180</LongitudeDegrees></Position>
              <AltitudeMeters>420</AltitudeMeters>
            </Trackpoint>
            <Trackpoint>
              <Position><LatitudeDegrees>38.460</LatitudeDegrees><LongitudeDegrees>-96.180</LongitudeDegrees></Position>
              <AltitudeMeters>450</AltitudeMeters>
            </Trackpoint>
          </Track>
          <CoursePoint>
            <Name>Water Refill 1</Name>
            <Position><LatitudeDegrees>38.420</LatitudeDegrees><LongitudeDegrees>-96.180</LongitudeDegrees></Position>
            <PointType>Water</PointType>
            <Notes>Hydration oasis</Notes>
          </CoursePoint>
          <CoursePoint>
            <Name>Alma Neutral Feed</Name>
            <Position><LatitudeDegrees>38.440</LatitudeDegrees><LongitudeDegrees>-96.180</LongitudeDegrees></Position>
            <PointType>Food</PointType>
            <Notes>Food and nutrition</Notes>
          </CoursePoint>
          <CoursePoint>
            <Name>Mud Sector Caution</Name>
            <Position><LatitudeDegrees>38.460</LatitudeDegrees><LongitudeDegrees>-96.180</LongitudeDegrees></Position>
            <PointType>Danger</PointType>
            <Notes>Severe peanut butter mud</Notes>
          </CoursePoint>
        </Course>
      </Courses>
    </TrainingCenterDatabase>`;

    const parsed = parseRouteFile(tcxXml, 'unbound200.tcx');
    assert.equal(parsed.title, 'Unbound Gravel 200');
    assert.equal(parsed.coords.length, 4);
    assert.equal(parsed.rawWaypoints.length, 3);

    const store = createStore();
    store.setTrack(parsed);

    const state = store.getState();
    assert.equal(state.settings.title, 'Unbound Gravel 200');
    assert.ok(state.points.length >= 3);
    assert.ok(state.stats !== null);
    assert.ok(state.stats.totalDist > 0);

    // Verify waypoints were matched and classified by signal engine
    assert.equal(state.waypoints.length, 3);
    assert.equal(state.waypoints[0].type, 'water');
    assert.equal(state.waypoints[1].type, 'feed'); // "Alma Neutral Feed" -> feed
    assert.equal(state.waypoints[2].type, 'caution'); // "Mud Sector Caution" -> caution
  });
});

/**
 * Helper to construct valid in-memory FIT binary buffers for testing.
 */
function createTestFit({
  courseName = 'Transcontinental CP1',
  records = [],
  coursePoints = [],
  isBE = false,
  hasDevData = false,
  useEnhancedAltitude = false
}) {
  const header = new Uint8Array(14);
  header[0] = 14; header[1] = 0x20; header[2] = 0x40; header[3] = 0x08;
  header[8] = 0x2E; header[9] = 0x46; header[10] = 0x49; header[11] = 0x54;
  const chunks = [];

  // Course Msg 6 (Definition + Data)
  if (courseName) {
    chunks.push(new Uint8Array([0x40, 0, isBE ? 1 : 0, isBE ? 0 : 6, isBE ? 6 : 0, 1, 4, 32, 7]));
    const nameBuf = new Uint8Array(1 + 32);
    nameBuf[0] = 0x00;
    Buffer.from(courseName + '\0').copy(nameBuf, 1);
    chunks.push(nameBuf);
  }

  // Record Msg 19 (Definition)
  if (useEnhancedAltitude) {
    chunks.push(new Uint8Array([
      0x41, 0, isBE ? 1 : 0, isBE ? 0 : 19, isBE ? 19 : 0, 3,
      0, 4, 0x85,  // position_lat
      1, 4, 0x85,  // position_long
      73, 4, 0x86  // enhanced_altitude
    ]));
  } else if (hasDevData) {
    // Has 1 standard field + 1 dev field (size 2)
    chunks.push(new Uint8Array([
      0x61, 0, isBE ? 1 : 0, isBE ? 0 : 19, isBE ? 19 : 0, 3,
      0, 4, 0x85,  // position_lat
      1, 4, 0x85,  // position_long
      2, 2, 0x84,  // altitude
      1,           // 1 dev field
      0, 2, 0      // dev field 0, size 2, dev idx 0
    ]));
  } else {
    chunks.push(new Uint8Array([
      0x41, 0, isBE ? 1 : 0, isBE ? 0 : 19, isBE ? 19 : 0, 3,
      0, 4, 0x85,  // position_lat
      1, 4, 0x85,  // position_long
      2, 2, 0x84   // altitude
    ]));
  }

  for (const pt of records) {
    const extraDevBytes = hasDevData ? 2 : 0;
    const buf = new Uint8Array(1 + 4 + 4 + (useEnhancedAltitude ? 4 : 2) + extraDevBytes);
    buf[0] = 0x01; // Data, local 1
    const dv = new DataView(buf.buffer);
    const latSemi = pt.lat !== null && pt.lat !== undefined ? Math.round(pt.lat * (2147483648 / 180)) : 0x7FFFFFFF;
    const lonSemi = pt.lon !== null && pt.lon !== undefined ? Math.round(pt.lon * (2147483648 / 180)) : 0x7FFFFFFF;

    dv.setInt32(1, latSemi, !isBE);
    dv.setInt32(5, lonSemi, !isBE);

    if (useEnhancedAltitude) {
      const altRaw = pt.ele !== null && pt.ele !== undefined ? Math.round((pt.ele + 500) * 5) : 0xFFFFFFFF;
      dv.setUint32(9, altRaw, !isBE);
    } else {
      const altRaw = pt.ele !== null && pt.ele !== undefined ? Math.round((pt.ele + 500) * 5) : 0xFFFF;
      dv.setUint16(9, altRaw, !isBE);
    }

    chunks.push(buf);
  }

  // Course Points Msg 32
  if (coursePoints.length > 0) {
    chunks.push(new Uint8Array([
      0x42, 0, isBE ? 1 : 0, isBE ? 0 : 32, isBE ? 32 : 0, 4,
      2, 4, 0x85,
      3, 4, 0x85,
      5, 1, 0x00,
      6, 16, 0x07
    ]));

    for (const cp of coursePoints) {
      const buf = new Uint8Array(1 + 4 + 4 + 1 + 16);
      buf[0] = 0x02; // Data, local 2
      const dv = new DataView(buf.buffer);
      const latSemi = Math.round(cp.lat * (2147483648 / 180));
      const lonSemi = Math.round(cp.lon * (2147483648 / 180));
      dv.setInt32(1, latSemi, !isBE);
      dv.setInt32(5, lonSemi, !isBE);
      buf[9] = cp.type || 0;
      Buffer.from((cp.name || '') + '\0').copy(buf, 10);
      chunks.push(buf);
    }
  }

  let totalData = 0;
  chunks.forEach(c => totalData += c.length);
  new DataView(header.buffer).setUint32(4, totalData, true);

  const full = new Uint8Array(14 + totalData);
  full.set(header, 0);
  let p = 14;
  chunks.forEach(c => { full.set(c, p); p += c.length; });
  return full.buffer;
}

describe('Parser Module: FIT Ingestion', () => {
  it('parses standard FIT course with records and waypoints', () => {
    const fitBuf = createTestFit({
      courseName: 'Transcontinental CP1',
      records: [
        { lat: 45.1234, lon: 6.1234, ele: 1000 },
        { lat: 45.1240, lon: 6.1250, ele: 1150 },
        { lat: 45.1250, lon: 6.1270, ele: 1300 }
      ],
      coursePoints: [
        { lat: 45.1240, lon: 6.1250, type: 3, name: 'Water Spring' },
        { lat: 45.1250, lon: 6.1270, type: 1, name: 'Col du Galibier' }
      ]
    });

    const result = parseFIT(fitBuf);
    assert.equal(result.title, 'Transcontinental CP1');
    assert.equal(result.coords.length, 3);
    assert.ok(Math.abs(result.coords[0].lat - 45.1234) < 0.0001);
    assert.ok(Math.abs(result.coords[0].lon - 6.1234) < 0.0001);
    assert.equal(result.coords[0].ele, 1000);
    assert.equal(result.coords[2].ele, 1300);

    assert.equal(result.rawWaypoints.length, 2);
    assert.equal(result.rawWaypoints[0].name, 'Water Spring');
    assert.equal(result.rawWaypoints[0].sym, 'Water');
    assert.equal(result.rawWaypoints[1].name, 'Col du Galibier');
    assert.equal(result.rawWaypoints[1].sym, 'Summit');
  });

  it('supports enhanced altitude field (field 73, uint32)', () => {
    const fitBuf = createTestFit({
      records: [
        { lat: 45.0, lon: 6.0, ele: 2400 },
        { lat: 45.1, lon: 6.1, ele: 2750 }
      ],
      useEnhancedAltitude: true
    });

    const result = parseFIT(fitBuf);
    assert.equal(result.coords.length, 2);
    assert.equal(result.coords[0].ele, 2400);
    assert.equal(result.coords[1].ele, 2750);
  });

  it('forward-fills missing elevation data when altitude is invalid (0xFFFF)', () => {
    const fitBuf = createTestFit({
      records: [
        { lat: 45.0, lon: 6.0, ele: 1500 },
        { lat: 45.1, lon: 6.1, ele: null }, // 0xFFFF sentinel
        { lat: 45.2, lon: 6.2, ele: 1800 }
      ]
    });

    const result = parseFIT(fitBuf);
    assert.equal(result.coords.length, 3);
    assert.equal(result.coords[0].ele, 1500);
    assert.equal(result.coords[1].ele, 1500); // Forward-filled
    assert.equal(result.coords[2].ele, 1800);
  });

  it('skips non-GPS trackpoints without valid coordinate fixes', () => {
    const fitBuf = createTestFit({
      records: [
        { lat: 45.0, lon: 6.0, ele: 500 },
        { lat: null, lon: null, ele: 520 }, // Sensor only, no GPS fix
        { lat: 45.1, lon: 6.1, ele: 550 }
      ]
    });

    const result = parseFIT(fitBuf);
    assert.equal(result.coords.length, 2);
    assert.ok(Math.abs(result.coords[0].lat - 45.0) < 0.0001);
    assert.ok(Math.abs(result.coords[1].lat - 45.1) < 0.0001);
  });

  it('parses big-endian architecture FIT files (arch = 1)', () => {
    const fitBuf = createTestFit({
      courseName: 'Big Endian Route',
      records: [
        { lat: 42.5, lon: 1.5, ele: 800 },
        { lat: 42.6, lon: 1.6, ele: 950 }
      ],
      isBE: true
    });

    const result = parseFIT(fitBuf);
    assert.equal(result.title, 'Big Endian Route');
    assert.equal(result.coords.length, 2);
    assert.ok(Math.abs(result.coords[0].lat - 42.5) < 0.0001);
    assert.equal(result.coords[0].ele, 800);
  });

  it('handles developer data fields without desyncing record alignment', () => {
    const fitBuf = createTestFit({
      records: [
        { lat: 44.0, lon: 5.0, ele: 300 },
        { lat: 44.1, lon: 5.1, ele: 350 }
      ],
      hasDevData: true
    });

    const result = parseFIT(fitBuf);
    assert.equal(result.coords.length, 2);
    assert.ok(Math.abs(result.coords[0].lat - 44.0) < 0.0001);
    assert.equal(result.coords[0].ele, 300);
  });

  it('falls back to filename when course message is absent', () => {
    const fitBuf = createTestFit({
      courseName: null,
      records: [
        { lat: 45.0, lon: 6.0, ele: 100 },
        { lat: 45.1, lon: 6.1, ele: 200 }
      ]
    });

    const result = parseFIT(fitBuf, 'haute-route-stage2.fit');
    assert.equal(result.title, 'haute-route-stage2');
  });

  it('throws descriptive error when buffer is too small (< 12 bytes)', () => {
    const tooSmall = new Uint8Array([1, 2, 3]);
    assert.throws(() => parseFIT(tooSmall), /File too small/);
  });

  it('throws descriptive error when .FIT signature is missing', () => {
    const badMagic = new Uint8Array(14);
    badMagic[0] = 14;
    assert.throws(() => parseFIT(badMagic), /missing \.FIT signature/);
  });

  it('throws descriptive error when fewer than 2 valid coordinates exist', () => {
    const singlePoint = createTestFit({
      records: [
        { lat: 45.0, lon: 6.0, ele: 100 }
      ]
    });
    assert.throws(() => parseFIT(singlePoint), /at least 2 valid coordinates/);
  });
});

describe('Parser Module: Modular Registry with FIT', () => {
  it('includes .fit in getSupportedExtensions', () => {
    const extensions = getSupportedExtensions();
    assert.ok(extensions.includes('.fit'));
    assert.ok(extensions.includes('.gpx'));
    assert.ok(extensions.includes('.tcx'));
  });

  it('identifies .fit as binary extension', () => {
    assert.equal(isBinaryExtension('stage.fit'), true);
    assert.equal(isBinaryExtension('stage.gpx'), false);
    assert.equal(isBinaryExtension('stage.tcx'), false);
  });

  it('detects valid FIT buffers via isFitBuffer', () => {
    const valid = createTestFit({
      records: [
        { lat: 45.0, lon: 6.0, ele: 100 },
        { lat: 45.1, lon: 6.1, ele: 200 }
      ]
    });
    assert.equal(isFitBuffer(valid), true);
    assert.equal(isFitBuffer(new Uint8Array([1, 2, 3])), false);
    assert.equal(isFitBuffer('not binary'), false);
  });

  it('dispatches binary ArrayBuffer to parseFIT via parseRouteFile', () => {
    const fitBuf = createTestFit({
      courseName: 'Badlands Gravel Stage',
      records: [
        { lat: 37.0, lon: -3.0, ele: 800 },
        { lat: 37.1, lon: -3.1, ele: 1200 }
      ]
    });

    const result = parseRouteFile(fitBuf, 'badlands.fit');
    assert.equal(result.title, 'Badlands Gravel Stage');
    assert.equal(result.coords.length, 2);
  });

  it('sniffs binary FIT format when file extension is missing or ambiguous', () => {
    const fitBuf = createTestFit({
      courseName: 'Sniffed FIT Stage',
      records: [
        { lat: 45.0, lon: 6.0, ele: 500 },
        { lat: 45.1, lon: 6.1, ele: 600 }
      ]
    });

    const result = parseRouteFile(fitBuf, 'unknown_file.dat');
    assert.equal(result.title, 'Sniffed FIT Stage');
    assert.equal(result.coords.length, 2);
  });

  it('end-to-end: ingests parsed FIT route into Store and verifies waypoint categorization', () => {
    const fitBuf = createTestFit({
      courseName: 'Haute Route Alps',
      records: [
        { lat: 45.00, lon: 6.50, ele: 1200 },
        { lat: 45.02, lon: 6.52, ele: 1400 },
        { lat: 45.04, lon: 6.54, ele: 1600 },
        { lat: 45.06, lon: 6.56, ele: 1800 },
        { lat: 45.08, lon: 6.58, ele: 2000 },
        { lat: 45.10, lon: 6.60, ele: 2200 },
        { lat: 45.12, lon: 6.62, ele: 2400 },
        { lat: 45.14, lon: 6.64, ele: 2600 }
      ],
      coursePoints: [
        { lat: 45.04, lon: 6.54, type: 3, name: 'Water Fountain' },
        { lat: 45.08, lon: 6.58, type: 4, name: 'Energy Food Station' },
        { lat: 45.14, lon: 6.64, type: 1, name: 'Col Summit 2600m' }
      ]
    });

    const parsed = parseRouteFile(fitBuf, 'alps.fit');
    assert.equal(parsed.title, 'Haute Route Alps');
    assert.equal(parsed.coords.length, 8);
    assert.equal(parsed.rawWaypoints.length, 3);

    const store = createStore();
    store.setTrack(parsed);

    const state = store.getState();
    assert.equal(state.settings.title, 'Haute Route Alps');
    assert.ok(state.points.length >= 8);
    assert.ok(state.stats !== null);
    assert.ok(state.stats.totalDist > 0);
    assert.ok(state.stats.elevGain > 0);

    // Verify waypoints categorized by signal engine
    assert.equal(state.waypoints.length, 3);
    assert.equal(state.waypoints[0].type, 'water');
    assert.equal(state.waypoints[1].type, 'food');
    assert.equal(state.waypoints[2].type, 'summit');
  });
});



