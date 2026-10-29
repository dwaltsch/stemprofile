/**
 * FIT Builder Test Helper
 *
 * Builds valid in-memory Garmin FIT binaries (course, records, course points)
 * for parser tests and as seed inputs for the fuzz suite.
 */

/**
 * Helper to construct valid in-memory FIT binary buffers for testing.
 */
export function createTestFit({
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
