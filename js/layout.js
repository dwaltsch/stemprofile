/**
 * Layout, Anti-Collision & Geometry Engine Module
 *
 * Implements:
 * 1. Multi-tier anti-collision solver for climb summit badges and waypoints
 * 2. Unified leader line connector anchor calculations
 * 3. Distance & physical sticker size aware roadbook block recommendation heuristics
 * 4. Dynamic in-block gradient percentage scaling, spacing & orientation engine
 *
 * @module layout
 */

/**
 * @typedef {Object} ClimbBadgePlacement
 * @property {number} x - Top-left X coordinate in millimeters
 * @property {number} y - Top-left Y coordinate in millimeters
 * @property {number} w - Badge bounding box width in millimeters
 * @property {number} h - Badge bounding box height in millimeters
 * @property {number} catW - Width of the category pill slice in millimeters
 * @property {string} catCode - Compact category label string
 * @property {string} statsLength - Formatted climb length
 * @property {string} statsGrade - Formatted climb gradient
 * @property {string} label - Combined badge label text
 * @property {number} fontSize - Font size in millimeters
 * @property {number} summitX - Peak summit pin X coordinate in millimeters
 * @property {number} summitY - Peak summit pin Y coordinate in millimeters
 * @property {import('./signal.js').DetectedClimb} climb - Source climb metadata
 */

/**
 * Calculates optimal leader-line connection point on a badge boundary to a target apex point.
 *
 * @param {{ x: number, y: number, w: number, h: number }} badgeBox - Badge boundary box
 * @param {{ x: number, y: number }} apex - Target summit/waypoint apex point
 * @returns {{ connX: number, connY: number, distToApex: number, isVisible: boolean }}
 */
export function calculateLeaderLineAnchor(badgeBox, apex) {
  const { x, y, w, h } = badgeBox;
  const summitX = apex.x;
  const summitY = apex.y;

  const badgeCenterX = x + (w / 2);
  const badgeBottomY = y + h;
  const badgeTopY = y;

  let connX = badgeCenterX;
  let connY = badgeBottomY;

  if (badgeBottomY <= summitY - 0.6) {
    connX = badgeCenterX;
    connY = badgeBottomY;
  } else if (badgeTopY >= summitY + 0.6) {
    connX = badgeCenterX;
    connY = badgeTopY;
  } else if (badgeCenterX <= summitX) {
    connX = x + w;
    connY = y + (h / 2);
  } else {
    connX = x;
    connY = y + (h / 2);
  }

  const distToApex = Math.hypot(connX - summitX, connY - summitY);
  return {
    connX: parseFloat(connX.toFixed(2)),
    connY: parseFloat(connY.toFixed(2)),
    distToApex,
    isVisible: distToApex > 1.8
  };
}

/**
 * Multi-tier anti-collision layout solver for climb summit badges.
 *
 * Staggers overlapping badges across vertical shelf tiers and horizontal candidate offsets
 * with proximity scoring.
 *
 * @param {import('./signal.js').DetectedClimb[]} climbs - Array of detected route climbs
 * @param {function(number): number} toX - Function mapping distance in meters to X mm
 * @param {function(number): number} toY - Function mapping elevation in meters to Y mm
 * @param {number} padLeft - Left plotting boundary padding in mm
 * @param {number} padRight - Right plotting boundary padding in mm
 * @param {number} minY - Topmost allowed Y coordinate for badges in mm
 * @param {number} maxY - Bottommost allowed Y coordinate for badges in mm
 * @param {number} W - Total sticker width in mm
 * @param {Array<Object>} [waypoints=[]] - Active waypoints for joint collision avoidance
 * @param {Record<string, {x: number, y: number}>} [customPositions={}] - User-overridden drag coordinates
 * @returns {ClimbBadgePlacement[]} Array of non-overlapping badge placement objects
 */
export function computeClimbBadgeLayout(
  climbs,
  toX,
  toY,
  padLeft,
  padRight,
  minY,
  maxY,
  W,
  waypoints = [],
  customPositions = {}
) {
  if (!climbs || climbs.length === 0) return [];

  const sortedClimbs = [...climbs].sort((a, b) => a.summitKm - b.summitKm);
  const placedBadges = [];
  const isDense = sortedClimbs.length >= 4;

  sortedClimbs.forEach((climb, climbIdx) => {
    const summitX = toX(climb.summitKm * 1000);
    const summitY = toY(climb.summitEle);

    const catStr = (climb.category || '').toUpperCase();
    const catCode = isDense ? catStr.replace(/CAT\s*/i, 'C') : catStr;
    const statsLength = `${climb.lengthKm.toFixed(1)}k`;
    const statsGrade = `${climb.avgGrade}%`;

    const fontSize = isDense ? 1.5 : 1.65;
    const badgeH = isDense ? 3.1 : 3.4;

    const catCharW = isDense ? 1.05 : 1.25;
    const catW = Math.max(isDense ? 5.5 : 8.5, catCode.length * catCharW + 2.4);
    const statsText = `${statsLength} ${statsGrade}`;
    const statsCharW = isDense ? 1.0 : 1.2;
    const statsW = statsText.length * statsCharW + 3.5;
    const badgeW = Math.min(32, catW + statsW);

    const label = `${catCode} | ${statsLength} · ${statsGrade}`;

    // If custom drag position was saved by the user, prioritize it directly
    if (customPositions && customPositions['climb-' + climb.id]) {
      const customPos = customPositions['climb-' + climb.id];
      placedBadges.push({
        x: customPos.x,
        y: customPos.y,
        w: badgeW,
        h: badgeH,
        catW,
        catCode,
        statsLength,
        statsGrade,
        label,
        fontSize,
        summitX,
        summitY,
        climb
      });
      return;
    }

    const naturalX = summitX - (badgeW / 2);
    const clampedNaturalX = Math.max(padLeft, Math.min(W - padRight - badgeW, naturalX));

    // Check if near previous climb (Delta X < 10.5mm / ~40px)
    let isConsecutiveNear = false;
    if (climbIdx > 0) {
      const prevSummitX = toX(sortedClimbs[climbIdx - 1].summitKm * 1000);
      if (Math.abs(summitX - prevSummitX) < 10.5) {
        isConsecutiveNear = true;
      }
    }

    // Alternating Two-Tier Offsets: y1 = summit - 3.2mm (~12px), y2 = summit - 7.4mm (~28px)
    const tier1Y = Math.max(minY, summitY - badgeH - 3.2);
    const tier2Y = Math.max(minY, summitY - badgeH - 7.4);

    // Primary candidates
    const candidateTiersY = isConsecutiveNear && (climbIdx % 2 === 1)
      ? [
          tier2Y,                                       // Tier 2: Elevated offset for alternating proximity
          tier1Y,                                       // Tier 1: Base offset
          minY + 0.3,                                   // Tier 3: Top shelf
          minY + badgeH + 0.7,                          // Tier 4: Top shelf tier 2
          Math.max(minY, summitY - badgeH - 11.5)       // Tier 5: High
        ]
      : [
          tier1Y,                                       // Tier 1: Base offset
          tier2Y,                                       // Tier 2: Elevated offset
          minY + 0.3,                                   // Tier 3: Top shelf
          minY + badgeH + 0.7,                          // Tier 4: Top shelf tier 2
          Math.max(minY, summitY - badgeH - 11.5)       // Tier 5: High
        ];

    // Horizontal nudge offsets
    const candidateDxs = [0, -3.5, 3.5, -7.0, 7.0, -11.0, 11.0, -15.0, 15.0, -20.0, 20.0];

    let bestCandidate = null;
    let minCost = Infinity;

    for (let t = 0; t < candidateTiersY.length; t++) {
      const candY = candidateTiersY[t];
      if (candY < minY || candY + badgeH > maxY) continue;

      for (let d = 0; d < candidateDxs.length; d++) {
        const dx = candidateDxs[d];
        const candX = Math.max(padLeft, Math.min(W - padRight - badgeW, clampedNaturalX + dx));

        // Check collision against already placed badges
        let collides = false;
        const marginX = 0.8;
        const marginY = 0.5;

        for (const pb of placedBadges) {
          const overlapX = (candX < pb.x + pb.w + marginX) && (candX + badgeW + marginX > pb.x);
          const overlapY = (candY < pb.y + pb.h + marginY) && (candY + badgeH + marginY > pb.y);
          if (overlapX && overlapY) {
            collides = true;
            break;
          }
        }

        // Check collision against the summit peak dot itself (avoid badge covering the summit)
        const overlapsSummit = (candY + badgeH > summitY - 0.5) && (candY < summitY + 0.5) && (candX < summitX + 1.5) && (candX + badgeW > summitX - 1.5);

        const distFromSummit = Math.hypot((candX + badgeW / 2) - summitX, (candY + badgeH) - summitY);
        const cost = (collides ? 10000 : 0) + (overlapsSummit ? 8000 : 0) + distFromSummit + (t * 1.5) + (Math.abs(dx) * 0.8);

        if (cost < minCost) {
          minCost = cost;
          bestCandidate = {
            x: candX,
            y: candY,
            w: badgeW,
            h: badgeH,
            catW,
            catCode,
            statsLength,
            statsGrade,
            label,
            fontSize,
            summitX,
            summitY,
            climb
          };
          if (!collides && !overlapsSummit && d === 0 && t === 0) {
            break;
          }
        }
      }
      if (bestCandidate && minCost < 8000 && t === 0) {
        break;
      }
    }

    if (!bestCandidate) {
      bestCandidate = {
        x: clampedNaturalX,
        y: tier1Y,
        w: badgeW,
        h: badgeH,
        catW,
        catCode,
        statsLength,
        statsGrade,
        label,
        fontSize,
        summitX,
        summitY,
        climb
      };
    }

    placedBadges.push(bestCandidate);
  });

  return placedBadges;
}

/**
 * Calculates recommended block size preset options and default dynamically
 * based on both track distance AND physical sticker dimensions (width & height).
 *
 * @param {number} totalDistMeters - Total track distance in meters
 * @param {number} [widthMm=110] - Physical sticker width in millimeters
 * @param {number} [heightMm=35] - Physical sticker height in millimeters
 * @returns {{ defaultBlockM: number, options: Array<{ label: string, value: number|string }> }}
 */
export function getRecommendedBlockPresets(totalDistMeters, widthMm = 110, heightMm = 35) {
  const km = (totalDistMeters || 0) / 1000;
  // Effective distance normalized to standard 110mm width baseline
  const widthFactor = 110 / Math.max(35, widthMm || 110);
  const effectiveKm = km * widthFactor;

  if (effectiveKm < 40) {
    return {
      defaultBlockM: 500,
      options: [
        { label: '250 m', value: 250 },
        { label: '500 m', value: 500 },
        { label: '1.0 km', value: 1000 },
        { label: 'Smooth', value: 0 },
        { label: 'Custom', value: 'custom' }
      ]
    };
  } else if (effectiveKm < 100) {
    return {
      defaultBlockM: 1000,
      options: [
        { label: '500 m', value: 500 },
        { label: '1.0 km', value: 1000 },
        { label: '2.5 km', value: 2500 },
        { label: 'Smooth', value: 0 },
        { label: 'Custom', value: 'custom' }
      ]
    };
  } else if (effectiveKm < 180) {
    return {
      defaultBlockM: 2000,
      options: [
        { label: '1.0 km', value: 1000 },
        { label: '2.0 km', value: 2000 },
        { label: '5.0 km', value: 5000 },
        { label: 'Smooth', value: 0 },
        { label: 'Custom', value: 'custom' }
      ]
    };
  } else {
    // Ultra-distance stages or compact width stickers
    return {
      defaultBlockM: 5000,
      options: [
        { label: '2.0 km', value: 2000 },
        { label: '5.0 km', value: 5000 },
        { label: '10.0 km', value: 10000 },
        { label: 'Smooth', value: 0 },
        { label: 'Custom', value: 'custom' }
      ]
    };
  }
}

/**
 * Picks a free spot for a waypoint pin and its label, avoiding climb badges,
 * summit dots and earlier waypoints. Candidates are tried from the preferred
 * spot outwards; when nothing is free, the least crowded one wins.
 *
 * @param {Object} options
 * @param {number} options.pinX - Preferred pin center X in mm
 * @param {number[]} options.pinYs - Pin center Y candidates in mm, best first
 * @param {number[]} [options.pinDxs=[0]] - Horizontal pin offset candidates in mm, best first
 * @param {number} options.pinR - Pin radius in mm
 * @param {number} options.tagW - Label width in mm (0 when labels are hidden)
 * @param {number} options.tagH - Label height in mm
 * @param {boolean} options.preferAbove - Try the label above the pin first
 * @param {number} options.W - Sticker width in mm
 * @param {number} options.minY - Top limit in mm, below the header
 * @param {number} options.maxY - Bottom limit in mm
 * @param {Array<{x: number, y: number, w: number, h: number}>} options.obstacles - Occupied rectangles
 * @returns {{ pinX: number, pinY: number, tagX: number, tagY: number, boxes: Array<{x: number, y: number, w: number, h: number}> }}
 *   Pin center, label offset from the pin, and the rectangles now occupied
 */
export function placeWaypointLabel({ pinX, pinYs, pinDxs = [0], pinR, tagW, tagH, preferAbove, W, minY, maxY, obstacles }) {
  const marginMm = 0.4;
  const hits = (a, b) => a.x < b.x + b.w + marginMm && a.x + a.w + marginMm > b.x &&
    a.y < b.y + b.h + marginMm && a.y + a.h + marginMm > b.y;

  let best = null;
  let bestCost = Infinity;

  for (let dxIdx = 0; dxIdx < pinDxs.length; dxIdx++) {
    for (let yIdx = 0; yIdx < pinYs.length; yIdx++) {
      for (const above of [preferAbove, !preferAbove]) {
        const x = pinX + pinDxs[dxIdx];
        const pinY = pinYs[yIdx];
        const tagLeft = Math.max(0.8, Math.min(W - 0.8 - tagW, x - tagW / 2));
        const tagTop = above ? pinY - pinR - 0.2 - tagH : pinY + pinR + 0.6;
        const pinBox = { x: x - pinR, y: pinY - pinR, w: pinR * 2, h: pinR * 2 };
        const tagBox = { x: tagLeft, y: tagTop, w: tagW, h: tagH };
        const boxes = tagW > 0 ? [pinBox, tagBox] : [pinBox];
        const outOfBounds = pinY - pinR < minY || (tagW > 0 && (tagTop < minY || tagTop + tagH > maxY));
        const overlaps = obstacles.reduce((n, o) => n + boxes.filter(b => hits(b, o)).length, 0);
        // Staying on the sticker and out of the header outranks avoiding other labels
        const cost = (outOfBounds ? 100000 : 0) + overlaps * 1000;
        const candidate = { pinX: x, pinY, tagX: tagLeft - x, tagY: tagTop - pinY, boxes };

        if (cost === 0) return candidate;
        if (cost < bestCost) {
          bestCost = cost;
          best = candidate;
        }
      }
    }
  }

  return best;
}

/**
 * Computes dynamic in-block gradient percentage layout, sizing, and orientation
 * based on physical sticker dimensions, column height, and block width.
 *
 * @param {Object} params - Layout computation parameters
 * @returns {{ shouldRender: boolean, markup: string, nextRenderedTextX: number }}
 */
export function computeBlockPctLayout({
  block,
  idx,
  baseStride = 1,
  blockWidthMm,
  colHeight,
  topMidY,
  yBase,
  midX,
  lastRenderedTextX = -999,
  widthMm = 110,
  heightMm = 35,
  themeKey = 'white'
}) {
  const sizeScale = Math.min(1.4, Math.max(0.72, Math.min(widthMm / 110, heightMm / 35)));
  const isCompactHeight = heightMm <= 28;

  const minSpacingMm = blockWidthMm >= (3.2 * sizeScale)
    ? (2.8 * sizeScale)
    : (blockWidthMm >= (2.0 * sizeScale) ? (3.4 * sizeScale) : (4.2 * sizeScale));

  const hasSpacing = (lastRenderedTextX === -999) || (midX - lastRenderedTextX >= minSpacingMm);
  const isStride = (baseStride === 1) || (idx % baseStride === 0);
  const isKeyPitch = (block.absGrade >= 5.0) && (midX - lastRenderedTextX >= (minSpacingMm * 0.65));

  const minRequiredHeight = isCompactHeight ? (1.6 * sizeScale) : (2.0 * sizeScale);
  const shouldRender = (isStride || isKeyPitch) && (hasSpacing || isKeyPitch) && (colHeight >= minRequiredHeight);

  if (!shouldRender) {
    return { shouldRender: false, markup: '', nextRenderedTextX: lastRenderedTextX };
  }

  const rawGrade = block.grade !== undefined ? block.grade : (block.absGrade || 0);
  const roundedGrade = Math.round(rawGrade);
  const gradeVal = Object.is(roundedGrade, -0) || roundedGrade === 0 ? 0 : roundedGrade;
  const gradeText = `${gradeVal}%`;

  // Dynamic adaptive contrast based on zone and theme brightness
  const isLightBackground = (block.zone <= 1) && (themeKey === 'white' || themeKey === 'tour' || themeKey === 'giro' || themeKey === 'gravel');
  const textFill = isLightBackground ? '#000000' : '#ffffff';
  const strokeColor = isLightBackground ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.85)';
  const strokeWidth = ((isLightBackground ? 0.42 : 0.34) * sizeScale).toFixed(2);

  let labelMarkup = '';

  if (blockWidthMm >= (2.8 * sizeScale)) {
    // Wide block: Horizontal text with outline halo
    const fontSize = (1.75 * sizeScale).toFixed(2);
    const textY = Math.min(yBase - 1.0 * sizeScale, topMidY + (colHeight * (isCompactHeight ? 0.42 : 0.45)));
    labelMarkup = `
      <text x="${midX.toFixed(2)}" y="${textY.toFixed(2)}" fill="${textFill}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linejoin="round" paint-order="stroke fill" font-size="${fontSize}" font-weight="900" font-family="system-ui, -apple-system, sans-serif" text-anchor="middle">${gradeText}</text>
    `;
  } else if (blockWidthMm >= (1.3 * sizeScale)) {
    // Medium block: Compact horizontal or vertical text depending on available height
    if (colHeight >= (5.0 * sizeScale)) {
      const fontSize = (1.5 * sizeScale).toFixed(2);
      const textY = (topMidY + yBase) / 2;
      labelMarkup = `
        <text x="${midX.toFixed(2)}" y="${textY.toFixed(2)}" transform="rotate(-90, ${midX.toFixed(2)}, ${textY.toFixed(2)})" fill="${textFill}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linejoin="round" paint-order="stroke fill" font-size="${fontSize}" font-weight="900" font-family="system-ui, -apple-system, sans-serif" text-anchor="middle">${gradeText}</text>
      `;
    } else {
      const fontSize = (1.35 * sizeScale).toFixed(2);
      const textY = Math.min(yBase - 0.7 * sizeScale, topMidY + (colHeight * 0.48));
      labelMarkup = `
        <text x="${midX.toFixed(2)}" y="${textY.toFixed(2)}" fill="${textFill}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linejoin="round" paint-order="stroke fill" font-size="${fontSize}" font-weight="900" font-family="system-ui, -apple-system, sans-serif" text-anchor="middle">${gradeText}</text>
      `;
    }
  } else if (blockWidthMm >= (0.42 * sizeScale)) {
    // Narrow block: Vertical text like Grand Tour roadbooks
    if (colHeight >= (3.5 * sizeScale)) {
      const fontSize = (1.25 * sizeScale).toFixed(2);
      const textY = (topMidY + yBase) / 2;
      labelMarkup = `
        <text x="${midX.toFixed(2)}" y="${textY.toFixed(2)}" transform="rotate(-90, ${midX.toFixed(2)}, ${textY.toFixed(2)})" fill="${textFill}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linejoin="round" paint-order="stroke fill" font-size="${fontSize}" font-weight="900" font-family="system-ui, -apple-system, sans-serif" text-anchor="middle">${gradeText}</text>
      `;
    }
  }

  return {
    shouldRender: Boolean(labelMarkup),
    markup: labelMarkup,
    nextRenderedTextX: labelMarkup ? midX : lastRenderedTextX
  };
}
