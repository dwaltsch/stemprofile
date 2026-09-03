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

  it('supports registering a new modular parser (future .fit pluggability)', () => {
    // Register a mock FIT binary parser
    registerParser({
      id: 'fit-mock',
      name: 'FIT Protocol Mock',
      extensions: ['.fit'],
      isBinary: true,
      sniff: (content) => content instanceof Uint8Array,
      parse: (content, fileName) => ({
        title: 'Mock FIT Stage',
        coords: [
          { lat: 45.0, lon: 6.0, ele: 100 },
          { lat: 45.1, lon: 6.1, ele: 200 }
        ],
        rawWaypoints: []
      })
    });

    assert.ok(getSupportedExtensions().includes('.fit'));
    assert.equal(isBinaryExtension('stage.fit'), true);

    const mockBuffer = new Uint8Array([1, 2, 3]);
    const result = parseRouteFile(mockBuffer, 'stage.fit');
    assert.equal(result.title, 'Mock FIT Stage');
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


