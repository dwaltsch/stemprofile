/**
 * Garmin FIT binary parser: record messages, course points and header validation.
 *
 * @module parsers/fit
 */

/**
 * Garmin FIT Course Point Type enum mapping.
 * Translates numeric course point IDs into human-readable descriptors.
 */
export const FIT_COURSE_POINT_TYPES = {
  0: 'Generic',
  1: 'Summit',
  2: 'Valley',
  3: 'Water',
  4: 'Food',
  5: 'Danger',
  6: 'Left',
  7: 'Right',
  8: 'Straight',
  9: 'First Aid',
  10: 'Category 4',
  11: 'Category 3',
  12: 'Category 2',
  13: 'Category 1',
  14: 'Hors Category',
  15: 'Sprint',
  16: 'Left Fork',
  17: 'Right Fork',
  18: 'Middle Fork',
  19: 'Slight Left',
  20: 'Sharp Left',
  21: 'Slight Right',
  22: 'Sharp Right',
  23: 'U-Turn',
  24: 'Segment Start',
  25: 'Segment End',
  27: 'Campsite',
  28: 'Aid Station',
  29: 'Rest Area'
};

/**
 * Checks whether the given buffer or view contains a valid Garmin FIT file header.
 *
 * @param {ArrayBuffer|ArrayBufferView} content - Binary content
 * @returns {boolean} True if content has a valid .FIT header signature
 */
export function isFitBuffer(content) {
  if (!content) return false;
  let view;
  if (content instanceof ArrayBuffer) {
    view = new DataView(content);
  } else if (ArrayBuffer.isView(content)) {
    view = new DataView(content.buffer, content.byteOffset, content.byteLength);
  } else {
    return false;
  }
  if (view.byteLength < 14) return false;
  const headerSize = view.getUint8(0);
  if (headerSize < 12 || headerSize > 32) return false;
  return (
    view.getUint8(8) === 0x2E && // '.'
    view.getUint8(9) === 0x46 && // 'F'
    view.getUint8(10) === 0x49 && // 'I'
    view.getUint8(11) === 0x54    // 'T'
  );
}

/**
 * Safely decodes a null-terminated string from a DataView slice.
 *
 * @param {DataView} view - Source view
 * @param {number} offset - Byte offset
 * @param {number} size - Maximum field size in bytes
 * @returns {string} Decoded string
 */
function decodeFitString(view, offset, size) {
  let end = offset;
  while (end < offset + size && view.getUint8(end) !== 0) {
    end++;
  }
  if (end === offset) return '';
  const bytes = new Uint8Array(view.buffer, view.byteOffset + offset, end - offset);
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder('utf-8').decode(bytes).trim();
  }
  let str = '';
  for (let i = 0; i < bytes.length; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return str.trim();
}

/**
 * Parses raw Garmin FIT binary course or activity file into structured coordinates and waypoints.
 *
 * 100% zero-dependency binary protocol implementation using native DataView.
 * Extracts course metadata, GPS trackpoint records (converting semicircles to decimal degrees),
 * elevation profiles (with scale/offset conversion and forward-filling), and course point waypoints.
 * Supports both Little-Endian and Big-Endian architectures, developer data fields, and compressed headers.
 *
 * @param {ArrayBuffer|ArrayBufferView} buffer - Raw FIT binary buffer
 * @param {string} [fileName=''] - File name for fallback title extraction
 * @returns {GpxParseResult} Parsed route metadata, coordinate array, and waypoints
 * @throws {Error} When FIT syntax is invalid or no trackpoints are found
 */
export function parseFIT(buffer, fileName = '') {
  if (!buffer) throw new Error('No FIT data provided.');
  let view;
  if (buffer instanceof ArrayBuffer) {
    view = new DataView(buffer);
  } else if (ArrayBuffer.isView(buffer)) {
    view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  } else {
    throw new Error('Invalid FIT buffer type: expected ArrayBuffer or TypedArray.');
  }

  const totalLen = view.byteLength;
  if (totalLen < 12) {
    throw new Error('File too small to be a valid FIT file.');
  }

  let offset = 0;
  let title = '';
  const coords = [];
  const rawWaypoints = [];

  while (offset + 12 <= totalLen) {
    const headerSize = view.getUint8(offset);
    if (headerSize < 12 || offset + headerSize > totalLen) break;

    const magic = String.fromCharCode(
      view.getUint8(offset + 8),
      view.getUint8(offset + 9),
      view.getUint8(offset + 10),
      view.getUint8(offset + 11)
    );

    if (magic !== '.FIT') {
      if (offset === 0) {
        throw new Error('Invalid FIT file: missing .FIT signature in header.');
      }
      break;
    }

    const dataSize = view.getUint32(offset + 4, true);
    const dataEnd = Math.min(offset + headerSize + dataSize, totalLen);
    let cur = offset + headerSize;

    const definitions = new Map();

    while (cur < dataEnd) {
      const recHeader = view.getUint8(cur);
      cur += 1;

      const isCompressed = (recHeader & 0x80) !== 0;
      let isDef = false;
      let hasDevData = false;
      let localMsgType = 0;

      if (isCompressed) {
        localMsgType = (recHeader >> 5) & 0x03;
      } else {
        isDef = (recHeader & 0x40) !== 0;
        hasDevData = (recHeader & 0x20) !== 0;
        localMsgType = recHeader & 0x0F;
      }

      if (isDef) {
        if (cur + 5 > dataEnd) break;
        cur += 1; // reserved
        const arch = view.getUint8(cur); cur += 1;
        const isLE = arch === 0;
        const globalMsgNum = view.getUint16(cur, isLE); cur += 2;
        const numFields = view.getUint8(cur); cur += 1;

        const fields = [];
        let totalMsgDataSize = 0;
        for (let i = 0; i < numFields; i++) {
          if (cur + 3 > dataEnd) break;
          const fieldDefNum = view.getUint8(cur);
          const size = view.getUint8(cur + 1);
          const baseType = view.getUint8(cur + 2);
          cur += 3;
          fields.push({ fieldDefNum, size, baseType });
          totalMsgDataSize += size;
        }

        let devDataSize = 0;
        if (hasDevData && cur < dataEnd) {
          const numDevFields = view.getUint8(cur); cur += 1;
          for (let i = 0; i < numDevFields; i++) {
            if (cur + 3 > dataEnd) break;
            const devSize = view.getUint8(cur + 1);
            cur += 3;
            devDataSize += devSize;
          }
        }

        definitions.set(localMsgType, {
          globalMsgNum,
          isLE,
          fields,
          totalDataSize: totalMsgDataSize + devDataSize
        });
      } else {
        const def = definitions.get(localMsgType);
        if (!def) {
          break; // Cannot decode without known definition
        }

        if (cur + def.totalDataSize > dataEnd) {
          break; // Truncated record
        }

        const isLE = def.isLE;

        if (def.globalMsgNum === 6) { // Course Message
          let fOffset = cur;
          for (const f of def.fields) {
            if (f.fieldDefNum === 4) { // name
              const courseName = decodeFitString(view, fOffset, f.size);
              if (courseName) title = courseName;
            }
            fOffset += f.size;
          }
        } else if (def.globalMsgNum === 19) { // Record Message
          let fOffset = cur;
          let latSint = null;
          let lonSint = null;
          let altMeters = NaN;

          for (const f of def.fields) {
            if (f.fieldDefNum === 0 && f.size === 4) { // position_lat (sint32)
              const raw = view.getInt32(fOffset, isLE);
              if (raw !== 0x7FFFFFFF && raw !== 0) latSint = raw;
            } else if (f.fieldDefNum === 1 && f.size === 4) { // position_long (sint32)
              const raw = view.getInt32(fOffset, isLE);
              if (raw !== 0x7FFFFFFF && raw !== 0) lonSint = raw;
            } else if (f.fieldDefNum === 73 && f.size === 4) { // enhanced_altitude (uint32)
              const raw = view.getUint32(fOffset, isLE);
              if (raw !== 0xFFFFFFFF) altMeters = (raw / 5) - 500;
            } else if (f.fieldDefNum === 2 && f.size === 2 && isNaN(altMeters)) { // altitude (uint16)
              const raw = view.getUint16(fOffset, isLE);
              if (raw !== 0xFFFF) altMeters = (raw / 5) - 500;
            }
            fOffset += f.size;
          }

          if (latSint !== null && lonSint !== null) {
            // Convert semicircles to decimal degrees
            const lat = latSint * (180 / 2147483648);
            const lon = lonSint * (180 / 2147483648);
            const ele = !isNaN(altMeters)
              ? altMeters
              : (coords.length > 0 ? coords[coords.length - 1].ele : 0);

            coords.push({ lat, lon, ele });
          }
        } else if (def.globalMsgNum === 32) { // Course Point Message
          let fOffset = cur;
          let latSint = null;
          let lonSint = null;
          let cpType = 0;
          let cpName = '';

          for (const f of def.fields) {
            if (f.fieldDefNum === 2 && f.size === 4) { // position_lat (sint32)
              const raw = view.getInt32(fOffset, isLE);
              if (raw !== 0x7FFFFFFF) latSint = raw;
            } else if (f.fieldDefNum === 3 && f.size === 4) { // position_long (sint32)
              const raw = view.getInt32(fOffset, isLE);
              if (raw !== 0x7FFFFFFF) lonSint = raw;
            } else if (f.fieldDefNum === 5 && f.size === 1) { // type (enum)
              cpType = view.getUint8(fOffset);
            } else if (f.fieldDefNum === 6) { // name (string)
              cpName = decodeFitString(view, fOffset, f.size);
            }
            fOffset += f.size;
          }

          if (latSint !== null && lonSint !== null) {
            const lat = latSint * (180 / 2147483648);
            const lon = lonSint * (180 / 2147483648);
            const typeLabel = FIT_COURSE_POINT_TYPES[cpType] || 'Point';
            rawWaypoints.push({
              lat,
              lon,
              name: cpName || typeLabel,
              sym: typeLabel,
              desc: typeLabel,
              typeStr: typeLabel
            });
          }
        }

        cur += def.totalDataSize;
      }
    }

    offset = dataEnd;
  }

  if (coords.length < 2) {
    throw new Error('FIT file must contain at least 2 valid coordinates with GPS positions.');
  }

  const cleanFallback = fileName ? fileName.replace(/\.[^.]+$/i, '') : '';
  return {
    title: title || cleanFallback || 'StemProfile',
    coords,
    rawWaypoints
  };
}
