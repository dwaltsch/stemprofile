import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FUELING_CONFIG,
  FUEL_PRESETS,
  evaluateGradientAt,
  detectTerrainHazard,
  findNearestSafeWindow,
  formatElapsedSeconds,
  distToElapsedSeconds,
  generateDefaultFuelPlan,
  calculateHourlyIntake
} from '../js/fueling.js';

describe('Fueling Module: Presets & Config', () => {
  it('defines valid default configuration with 60-80g CHO target', () => {
    assert.strictEqual(DEFAULT_FUELING_CONFIG.targetCarbsPerHour, 75);
    assert.ok(DEFAULT_FUELING_CONFIG.targetCarbsPerHour >= 60 && DEFAULT_FUELING_CONFIG.targetCarbsPerHour <= 80);
    assert.strictEqual(DEFAULT_FUELING_CONFIG.avgSpeedKmh, 25);
    assert.strictEqual(DEFAULT_FUELING_CONFIG.displayMode, 'km');
    assert.strictEqual(DEFAULT_FUELING_CONFIG.hazardClimbThreshold, 8.5);
    assert.strictEqual(DEFAULT_FUELING_CONFIG.hazardDescentThreshold, -5.0);
  });

  it('provides complete pro cycling nutrition item presets', () => {
    assert.ok(FUEL_PRESETS.gel);
    assert.strictEqual(FUEL_PRESETS.gel.carbsG, 25);
    assert.ok(FUEL_PRESETS.bottle_mix);
    assert.strictEqual(FUEL_PRESETS.bottle_mix.carbsG, 40);
    assert.ok(FUEL_PRESETS.feed_zone);
    assert.strictEqual(FUEL_PRESETS.feed_zone.type, 'feed_zone');
    assert.ok(FUEL_PRESETS.water);
    assert.strictEqual(FUEL_PRESETS.water.carbsG, 0);
  });
});

describe('Fueling Module: Pacing & Time Formatting', () => {
  it('converts distance to elapsed seconds accurately based on speed', () => {
    // 25 km at 25 km/h = 1 hour = 3600 seconds
    const sec = distToElapsedSeconds(25000, 25);
    assert.strictEqual(sec, 3600);

    // 50 km at 25 km/h = 2 hours = 7200 seconds
    assert.strictEqual(distToElapsedSeconds(50000, 25), 7200);

    // 12.5 km at 25 km/h = 30 mins = 1800 seconds
    assert.strictEqual(distToElapsedSeconds(12500, 25), 1800);
  });

  it('formats elapsed seconds into readable HH:MM string', () => {
    assert.strictEqual(formatElapsedSeconds(0), '0:00 h');
    assert.strictEqual(formatElapsedSeconds(1800), '0:30 h');
    assert.strictEqual(formatElapsedSeconds(3600), '1:00 h');
    assert.strictEqual(formatElapsedSeconds(5520), '1:32 h');
    assert.strictEqual(formatElapsedSeconds(7200), '2:00 h');
  });
});

describe('Fueling Module: Terrain Gradient Hazard Evaluation', () => {
  // Synthetic track: 0km to 10km flat, 10km to 15km steep climb (10%), 15km to 20km steep descent (-8%)
  const mockPoints = [
    { dist: 0, smoothEle: 100 },
    { dist: 5000, smoothEle: 100 },
    { dist: 10000, smoothEle: 100 },
    { dist: 15000, smoothEle: 600 },  // 500m climb over 5000m = 10%
    { dist: 20000, smoothEle: 200 }   // 400m drop over 5000m = -8%
  ];

  it('evaluates flat gradients correctly', () => {
    const grade = evaluateGradientAt(mockPoints, 5000, 100);
    assert.strictEqual(grade, 0);
  });

  it('evaluates steep climbing gradient correctly', () => {
    const grade = evaluateGradientAt(mockPoints, 12500, 100);
    assert.strictEqual(grade, 10.0);
  });

  it('evaluates steep descending gradient correctly', () => {
    const grade = evaluateGradientAt(mockPoints, 17500, 100);
    assert.strictEqual(grade, -8.0);
  });

  it('flags steep climb hazard when gradient exceeds 8.5%', () => {
    const hazard = detectTerrainHazard(mockPoints, 12500, []);
    assert.strictEqual(hazard.isHazard, true);
    assert.strictEqual(hazard.type, 'climb');
    assert.strictEqual(hazard.grade, 10.0);
    assert.ok(hazard.message.includes('Steep incline'));
  });

  it('flags fast descent hazard when gradient is below -5.0%', () => {
    const hazard = detectTerrainHazard(mockPoints, 17500, []);
    assert.strictEqual(hazard.isHazard, true);
    assert.strictEqual(hazard.type, 'descent');
    assert.strictEqual(hazard.grade, -8.0);
    assert.ok(hazard.message.includes('Fast descent'));
  });

  it('identifies safe feed zones on flat/moderate terrain', () => {
    const hazard = detectTerrainHazard(mockPoints, 4000, []);
    assert.strictEqual(hazard.isHazard, false);
    assert.strictEqual(hazard.type, 'none');
    assert.ok(hazard.message.includes('Safe feed zone'));
  });

  it('finds nearest safe window before a steep climb', () => {
    // 12000m is inside the 10% climb. Searching backwards should snap to <=10000m (flat)
    const safeD = findNearestSafeWindow(mockPoints, 12000, 3000, 'backward');
    assert.ok(safeD <= 10000, `Expected safeD <= 10000, got ${safeD}`);
    const safeGrade = evaluateGradientAt(mockPoints, safeD, 80);
    assert.ok(safeGrade >= -2.5 && safeGrade <= 5.5);
  });

  it('recognizes long sustained climbs (>=5km) for necessary mid-climb fueling', () => {
    const mockClimbs = [{
      id: 1,
      category: 'Cat 1',
      startKm: 10,
      summitKm: 16,
      lengthKm: 6.0,
      avgGrade: 9.5
    }];

    const hazard = detectTerrainHazard(mockPoints, 13000, mockClimbs);
    assert.strictEqual(hazard.isHazard, true);
    assert.strictEqual(hazard.isLongClimb, true);
    assert.ok(hazard.message.includes('Long climb'));
    assert.ok(hazard.message.includes('mid-climb'));
  });
});

describe('Fueling Module: Default Plan Generation', () => {
  const mockPoints = [
    { dist: 0, smoothEle: 200 },
    { dist: 10000, smoothEle: 200 },
    { dist: 20000, smoothEle: 200 },
    { dist: 30000, smoothEle: 220 },
    { dist: 40000, smoothEle: 240 },
    { dist: 50000, smoothEle: 250 },
    { dist: 60000, smoothEle: 250 }
  ];

  const mockStats = {
    totalDist: 60000,
    elevGain: 250,
    elevLoss: 200,
    minEle: 200,
    maxEle: 250,
    maxGrade: 3.2
  };

  const mockWaypoints = [
    { id: 'w1', distM: 25000, type: 'feed', label: 'Feed Station 1', enabled: true },
    { id: 'w2', distM: 45000, type: 'water', label: 'Water Refill', enabled: true }
  ];

  it('generates a well-balanced default fueling plan for a 60km stage', () => {
    const plan = generateDefaultFuelPlan({
      points: mockPoints,
      stats: mockStats,
      climbs: [],
      waypoints: mockWaypoints,
      config: { targetCarbsPerHour: 75, avgSpeedKmh: 25 }
    });

    assert.ok(plan.length >= 4, `Expected at least 4 fuel items, got ${plan.length}`);

    // Verify waypoints were extracted as aid stations
    const feedItem = plan.find(it => it.isAidStation && it.name.includes('Feed Station 1'));
    assert.ok(feedItem, 'Expected Feed Station 1 to be extracted');
    assert.strictEqual(feedItem.distM, 25000);

    const waterItem = plan.find(it => it.isAidStation && it.name.includes('Water Refill'));
    assert.ok(waterItem, 'Expected Water Refill to be extracted');
    assert.strictEqual(waterItem.distM, 45000);

    // Verify chronological order
    for (let i = 1; i < plan.length; i++) {
      assert.ok(plan[i].distM >= plan[i - 1].distM, 'Items must be in ascending distance order');
    }

    // Verify calculated fields
    plan.forEach(it => {
      assert.ok(it.id);
      assert.ok(it.name);
      assert.ok(it.icon);
      assert.ok(typeof it.carbsG === 'number');
      assert.ok(typeof it.timeSec === 'number');
      assert.ok(typeof it.timeStr === 'string');
      assert.ok(typeof it.grade === 'number');
    });
  });

  it('places caffeine / high-carb gel before categorized climbs', () => {
    const mockClimbs = [{
      id: 'c1',
      category: 'Cat 1',
      startKm: 30,
      summitKm: 38,
      lengthKm: 8.0,
      avgGrade: 8.0,
      enabled: true
    }];

    const plan = generateDefaultFuelPlan({
      points: mockPoints,
      stats: mockStats,
      climbs: mockClimbs,
      waypoints: [],
      config: { targetCarbsPerHour: 75, avgSpeedKmh: 25 }
    });

    const preClimbItem = plan.find(it => it.distM >= 26000 && it.distM <= 30000);
    assert.ok(preClimbItem, 'Expected pre-climb fueling item before 30km');
    assert.ok(preClimbItem.type === 'caff_gel' || preClimbItem.type === 'gel_high_carb');
  });

  it('handles empty points or zero distance gracefully', () => {
    const emptyPlan = generateDefaultFuelPlan({ points: [], stats: null });
    assert.deepStrictEqual(emptyPlan, []);
  });
});

describe('Fueling Module: Hourly Carbohydrate Distribution', () => {
  it('calculates hourly distribution and total intake accurately', () => {
    const mockItems = [
      { distM: 10000, carbsG: 40, fluidMl: 500 }, // ~24 min (Hour 1)
      { distM: 20000, carbsG: 35, fluidMl: 0 },   // ~48 min (Hour 1)
      { distM: 35000, carbsG: 25, fluidMl: 0 },   // ~1h 24m (Hour 2)
      { distM: 45000, carbsG: 40, fluidMl: 500 }  // ~1h 48m (Hour 2)
    ];

    const result = calculateHourlyIntake(mockItems, 50000, 25); // 50km at 25 km/h = 2.0 hours
    assert.strictEqual(result.totalCarbsG, 140);
    assert.strictEqual(result.totalFluidMl, 1000);
    assert.strictEqual(result.hours.length, 2);
    assert.strictEqual(result.hours[0].carbsG, 75);
    assert.strictEqual(result.hours[1].carbsG, 65);
    assert.strictEqual(result.avgCarbsPerHour, 70);
  });
});

describe('Fueling Renderer Module: SVG Output', () => {
  it('generates valid vector SVG markup matching physical dimensions', async () => {
    const { renderFuelingSVG } = await import('../js/fueling-renderer.js');
    const mockState = {
      settings: {
        widthMm: 110,
        heightMm: 35,
        radiusMm: 2,
        theme: 'white',
        units: 'metric',
        showHeader: true,
        showCutGuidelines: true
      },
      stats: { totalDist: 60000 },
      fueling: {
        mode: 'km',
        targetCarbsPerHour: 75,
        avgSpeedKmh: 25,
        items: [
          { id: 'f1', distM: 15000, name: 'Carb Drink 500ml', carbsG: 40, icon: '🍾', type: 'bottle', isHazard: false },
          { id: 'f2', distM: 30000, name: 'Energy Gel', carbsG: 25, icon: '⚡', type: 'gel', isHazard: false },
          { id: 'f3', distM: 45000, name: 'Steep Climb Gel', carbsG: 30, icon: '⚡☕', type: 'caff_gel', isHazard: true, hazardType: 'climb', grade: 10.5 }
        ]
      }
    };

    const svg = renderFuelingSVG(mockState);
    assert.ok(svg.includes('id="fueling-svg-elem"'));
    assert.ok(svg.includes('width="35mm"'));
    assert.ok(svg.includes('height="115mm"'));
    assert.ok(svg.includes('viewBox="0 0 35 115"'));
    assert.ok(svg.includes('15.0k'));
    assert.ok(svg.includes('Carb Drink 500ml'));
    assert.ok(svg.includes('40g'));
    assert.ok(svg.includes('▲11%')); // Hazard tag

    // Custom dimensions override
    const customSvg = renderFuelingSVG(mockState, { widthMm: 30, heightMm: 95 });
    assert.ok(customSvg.includes('width="30mm"'));
    assert.ok(customSvg.includes('height="95mm"'));
  });

  it('renders time mode with HH:MM format tags', async () => {
    const { renderFuelingSVG } = await import('../js/fueling-renderer.js');
    const mockState = {
      settings: { widthMm: 100, heightMm: 28, theme: 'dark' },
      stats: { totalDist: 50000 },
      fueling: {
        mode: 'time',
        targetCarbsPerHour: 75,
        avgSpeedKmh: 25,
        items: [
          { id: 'f1', distM: 12500, timeSec: 1800, name: 'Maurten Gel', carbsG: 25, icon: '⚡', type: 'gel' }
        ]
      }
    };

    const svg = renderFuelingSVG(mockState);
    assert.ok(svg.includes('0:30'));
    assert.ok(svg.includes('Maurten Gel'));
  });

  it('renders pro typographic badge pills (MIX, GEL, CAF, HC) and excludes raw emojis from SVG', async () => {
    const { renderFuelingSVG, CUE_BADGES, getCueBadgeStyle } = await import('../js/fueling-renderer.js');
    assert.ok(CUE_BADGES.gel);
    assert.equal(CUE_BADGES.gel.code, 'GEL');
    assert.equal(CUE_BADGES.bottle_mix.code, 'MIX');
    assert.equal(CUE_BADGES.caff_gel.code, 'CAF');
    assert.equal(CUE_BADGES.feed_zone.code, 'AID');

    const darkStyle = getCueBadgeStyle({ type: 'caff_gel' }, true);
    assert.equal(darkStyle.code, 'CAF');

    const mockState = {
      settings: { fuelingWidthMm: 35, fuelingHeightMm: 115, theme: 'white' },
      stats: { totalDist: 60000 },
      fueling: {
        mode: 'km',
        targetCarbsPerHour: 75,
        avgSpeedKmh: 25,
        items: [
          { id: 'f1', distM: 15000, name: 'Drink Mix', carbsG: 40, icon: '🍾', type: 'bottle_mix' },
          { id: 'f2', distM: 30000, name: 'Energy Gel', carbsG: 25, icon: '⚡', type: 'gel' },
          { id: 'f3', distM: 45000, name: 'Caff Shot', carbsG: 30, icon: '☕', type: 'caff_gel' }
        ]
      }
    };

    const svg = renderFuelingSVG(mockState);
    // Verifies pro badges are rendered
    assert.ok(svg.includes('>MIX<'));
    assert.ok(svg.includes('>GEL<'));
    assert.ok(svg.includes('>CAF<'));
    // Verifies cartoon emojis are NOT rendered as sticker text
    assert.ok(!svg.includes('>🍾<'));
    assert.ok(!svg.includes('>⚡<'));
    assert.ok(!svg.includes('>☕<'));
  });

  it('enforces 4-slot collision-free layout and textLength clamping on long item names', async () => {
    const { renderFuelingSVG } = await import('../js/fueling-renderer.js');
    const mockState = {
      settings: { fuelingWidthMm: 35, fuelingHeightMm: 115, theme: 'white', title: 'A Very Long Grand Tour Queen Stage Title That Exceeds Width' },
      stats: { totalDist: 80000 },
      fueling: {
        mode: 'km',
        targetCarbsPerHour: 80,
        avgSpeedKmh: 28,
        items: [
          { id: 'f1', distM: 20000, name: 'Super Ultra Long Drink Mix Name That Could Overlap Without Clamping', carbsG: 50, type: 'bottle_mix' }
        ]
      }
    };

    const svg = renderFuelingSVG(mockState);
    // Verifies textLength constraint is applied to avoid visual collision
    assert.ok(svg.includes('textLength='));
    assert.ok(svg.includes('lengthAdjust="spacingAndGlyphs"'));
    assert.ok(svg.includes('50g'));
    // Verifies header title is safely handled
    assert.ok(svg.includes('class="fueling-header"'));
  });
});


