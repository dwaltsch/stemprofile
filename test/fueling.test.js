import './helpers/dom-shim.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FUELING_CONFIG,
  DEFAULT_FUEL_PRODUCT_DEFAULTS,
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

  it('defines valid product defaults and excludes any rice cake mentions', () => {
    assert.strictEqual(DEFAULT_FUEL_PRODUCT_DEFAULTS.gelCarbs, 25);
    assert.strictEqual(DEFAULT_FUEL_PRODUCT_DEFAULTS.bottleCarbs, 40);
    assert.strictEqual(DEFAULT_FUEL_PRODUCT_DEFAULTS.bottleFluidMl, 500);
    assert.strictEqual(DEFAULT_FUEL_PRODUCT_DEFAULTS.barCarbs, 35);
    assert.strictEqual(DEFAULT_FUEL_PRODUCT_DEFAULTS.hcGelCarbs, 40);
    assert.strictEqual(DEFAULT_FUEL_PRODUCT_DEFAULTS.caffGelCarbs, 30);

    const presetNames = Object.values(FUEL_PRESETS).map(p => `${p.name} ${p.notes || ''}`).join(' ');
    assert.ok(!presetNames.toLowerCase().includes('rice cake'), 'Rice cake should not be in presets');
  });

  it('provides complete pro cycling nutrition item presets with concise glanceable names', () => {
    assert.ok(FUEL_PRESETS.gel);
    assert.strictEqual(FUEL_PRESETS.gel.name, 'Gel');
    assert.strictEqual(FUEL_PRESETS.gel.carbsG, 25);

    assert.strictEqual(FUEL_PRESETS.gel_high_carb.name, 'HC Gel');
    assert.strictEqual(FUEL_PRESETS.caff_gel.name, 'Caff Gel');

    assert.ok(FUEL_PRESETS.bottle_mix);
    assert.strictEqual(FUEL_PRESETS.bottle_mix.name, 'Carb Mix');
    assert.strictEqual(FUEL_PRESETS.bottle_mix.carbsG, 40);

    assert.strictEqual(FUEL_PRESETS.bottle_super.name, 'Super Mix');
    assert.strictEqual(FUEL_PRESETS.bar.name, 'Bar');
    assert.strictEqual(FUEL_PRESETS.food.name, 'Chews');

    assert.ok(FUEL_PRESETS.feed_zone);
    assert.strictEqual(FUEL_PRESETS.feed_zone.name, 'Feed Zone');
    assert.strictEqual(FUEL_PRESETS.feed_zone.type, 'feed_zone');

    assert.ok(FUEL_PRESETS.water);
    assert.strictEqual(FUEL_PRESETS.water.name, 'Water');
    assert.strictEqual(FUEL_PRESETS.water.carbsG, 0);

    assert.strictEqual(FUEL_PRESETS.salt.name, 'Salt Tab');
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
    assert.strictEqual(preClimbItem.name, 'Caff Gel (Cat 1)');
  });

  it('generates default fueling plan using custom product defaults and excludes rice cake', () => {
    const customDefaults = {
      gelCarbs: 30,
      bottleCarbs: 55,
      bottleFluidMl: 600,
      barCarbs: 42,
      hcGelCarbs: 45,
      caffGelCarbs: 35
    };

    const plan = generateDefaultFuelPlan({
      points: mockPoints,
      stats: mockStats,
      climbs: [],
      waypoints: [],
      config: {
        productDefaults: customDefaults
      }
    });

    assert.ok(plan.length > 0);
    const gel = plan.find(it => it.type === 'gel');
    if (gel) {
      assert.strictEqual(gel.carbsG, 30);
    }
    const bottle = plan.find(it => it.type === 'bottle_mix');
    if (bottle) {
      assert.strictEqual(bottle.carbsG, 55);
      assert.strictEqual(bottle.fluidMl, 600);
    }
    const bar = plan.find(it => it.type === 'bar');
    if (bar) {
      assert.strictEqual(bar.carbsG, 42);
    }

    const allPlanText = plan.map(it => `${it.name} ${it.notes || ''}`).join(' ');
    assert.ok(!allPlanText.toLowerCase().includes('rice cake'), 'Plan should have no rice cake mentions');
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

  it('does not stretch short item names with textLength or lengthAdjust', async () => {
    const { renderFuelingSVG } = await import('../js/fueling-renderer.js');
    const mockState = {
      settings: { fuelingWidthMm: 35, fuelingHeightMm: 115, theme: 'white', title: 'Route Fueling' },
      stats: { totalDist: 80000 },
      fueling: {
        mode: 'km',
        targetCarbsPerHour: 80,
        avgSpeedKmh: 28,
        items: [
          { id: 'f1', distM: 20000, name: 'Bar', carbsG: 40, type: 'bar' },
          { id: 'f2', distM: 40000, name: 'Gel', carbsG: 25, type: 'gel' },
          { id: 'f3', distM: 60000, name: 'Carb Mix', carbsG: 50, type: 'bottle_mix' }
        ]
      }
    };

    const svg = renderFuelingSVG(mockState);
    // Verifies short names are not distorted or horizontally stretched with textLength
    assert.ok(!svg.includes('textLength='));
    assert.ok(!svg.includes('lengthAdjust='));
    assert.ok(svg.includes('>Bar</text>'));
    assert.ok(svg.includes('>Gel</text>'));
    assert.ok(svg.includes('>Carb Mix</text>'));
  });
});

describe('Fueling Store: Product Defaults Management', () => {
  it('updates product defaults without modifying existing items when applyToExisting is false', async () => {
    const { createStore } = await import('../js/store.js');
    const store = createStore();
    const item = store.addFuelItem({ type: 'gel', name: 'Standard Gel', carbsG: 25 });

    store.updateProductDefaults({ gelCarbs: 30, bottleCarbs: 50 }, false);
    const state = store.getFuelingState();
    assert.strictEqual(state.productDefaults.gelCarbs, 30);
    assert.strictEqual(state.productDefaults.bottleCarbs, 50);

    // Existing item should remain at 25g
    const existing = state.items.find(it => it.id === item.id);
    assert.strictEqual(existing.carbsG, 25);
  });

  it('updates product defaults and updates existing items when applyToExisting is true', async () => {
    const { createStore } = await import('../js/store.js');
    const store = createStore();
    const gel = store.addFuelItem({ type: 'gel', carbsG: 25 });
    const bottle = store.addFuelItem({ type: 'bottle_mix', carbsG: 40, fluidMl: 500 });
    const bar = store.addFuelItem({ type: 'bar', carbsG: 35 });

    store.updateProductDefaults({
      gelCarbs: 32,
      bottleCarbs: 60,
      bottleFluidMl: 650,
      barCarbs: 45
    }, true);

    const state = store.getFuelingState();
    const updatedGel = state.items.find(it => it.id === gel.id);
    const updatedBottle = state.items.find(it => it.id === bottle.id);
    const updatedBar = state.items.find(it => it.id === bar.id);

    assert.strictEqual(updatedGel.carbsG, 32);
    assert.strictEqual(updatedBottle.carbsG, 60);
    assert.strictEqual(updatedBottle.fluidMl, 650);
    assert.strictEqual(updatedBar.carbsG, 45);
  });

  it('uses configured product defaults when adding new items without explicit carbs', async () => {
    const { createStore } = await import('../js/store.js');
    const store = createStore();
    store.updateProductDefaults({ gelCarbs: 30, barCarbs: 40 });

    const newGel = store.addFuelItem({ type: 'gel' });
    assert.strictEqual(newGel.carbsG, 30);

    const newBar = store.addFuelItem({ type: 'bar' });
    assert.strictEqual(newBar.carbsG, 40);
  });
});

describe('Fueling Panel UI: Card Rendering & Editable Fields', () => {
  it('renders fuel item cards with editable inputs, non-draggable inputs, and drag handle', async () => {
    const { createStore } = await import('../js/store.js');
    const { renderFuelingPanel } = await import('../js/ui/fueling-panel.js');

    const store = createStore();
    store.setActiveView('fueling');
    store.addFuelItem({
      distM: 10000,
      name: 'Gel',
      type: 'gel',
      icon: '⚡',
      carbsG: 25
    });

    const mockListEl = {
      innerHTML: '',
      querySelectorAll() { return []; },
      querySelector() { return null; },
      contains() { return false; }
    };

    const origDoc = globalThis.document;
    globalThis.document = {
      activeElement: null,
      getElementById: (id) => {
        if (id === 'fuel-list') return mockListEl;
        return { textContent: '', value: '', style: {}, innerHTML: '' };
      },
      querySelectorAll: () => []
    };

    try {
      renderFuelingPanel(store);
      assert.ok(mockListEl.innerHTML.includes('class="fuel-card-meta-row"'));
      assert.ok(mockListEl.innerHTML.includes('class="fuel-type-select'));
      assert.ok(mockListEl.innerHTML.includes('class="fuel-card-name-row"'));
      assert.ok(mockListEl.innerHTML.includes('class="fuel-name-input"'));
      assert.ok(mockListEl.innerHTML.includes('data-action="edit-name"'));
      assert.ok(mockListEl.innerHTML.includes('value="Gel"'));
      assert.ok(mockListEl.innerHTML.includes('draggable="false"'));
      assert.ok(mockListEl.innerHTML.includes('class="fuel-card-handle" draggable="true"'));
      // Ensure the outer card does not have draggable="true"
      assert.ok(!mockListEl.innerHTML.includes('<div class="fuel-item-card" data-id= draggable="true"'));
    } finally {
      globalThis.document = origDoc;
    }
  });

  it('updates fuel item name when modified and reflects in SVG output', async () => {
    const { createStore } = await import('../js/store.js');
    const { renderFuelingSVG } = await import('../js/fueling-renderer.js');

    const store = createStore();
    const item = store.addFuelItem({
      distM: 12000,
      name: 'Gel',
      type: 'gel',
      icon: '⚡',
      carbsG: 25
    });

    // Verify initial SVG includes 'Gel'
    let svg = renderFuelingSVG(store.getState());
    assert.ok(svg.includes('>Gel<'));

    // Update item name
    store.updateFuelItem(item.id, { name: 'Maurten Gel 100' });
    const updated = store.getFuelingState().items.find(it => it.id === item.id);
    assert.strictEqual(updated.name, 'Maurten Gel 100');

    // Verify updated SVG reflects new name
    svg = renderFuelingSVG(store.getState());
    assert.ok(svg.includes('>Maurten Gel 100<'));
  });
});

describe('Fueling Module: Ultra-Distance & Loop Course Robustness', () => {
  it('generates a realistic, GI-safe plan on 300km loop course (Bodensee Platin)', async () => {
    const fs = await import('node:fs');
    if (!fs.existsSync('testdata/PLATIN_2026_020926.gpx')) {
      return;
    }
    const { parseGPX } = await import('../js/parser.js');
    const { processTrackSignal, matchWaypointsToTrack } = await import('../js/signal.js');

    const xml = fs.readFileSync('testdata/PLATIN_2026_020926.gpx', 'utf8');
    const parsed = parseGPX(xml);
    const { points, stats, climbs } = processTrackSignal(parsed.coords);
    const waypoints = matchWaypointsToTrack(parsed.rawWaypoints, parsed.coords, points);

    // Verify Altenrhein matched to finish on loop
    const altenrhein = waypoints.find(w => w.label.includes('Altenrhein'));
    assert.ok(altenrhein, 'Altenrhein waypoint should exist');
    assert.ok(altenrhein.distM > 300000, `Expected finish distance > 300km, got ${altenrhein.distM}`);

    const plan = generateDefaultFuelPlan({
      points,
      stats,
      climbs,
      waypoints,
      config: { targetCarbsPerHour: 75, avgSpeedKmh: 25 }
    });

    assert.ok(plan.length >= 15 && plan.length <= 32, `Plan length should be balanced (15-32 items), got ${plan.length}`);

    // Verify no 0km feed zone
    const startFeed = plan.find(it => it.distM === 0 && it.carbsG > 0);
    assert.strictEqual(startFeed, undefined, 'Should not schedule 40g feed zone at km 0.00');

    // Verify Cat 4 climbs get pre-climb fueling
    const cat4PreClimb = plan.find(it => it.name.includes('(Cat 4)'));
    assert.ok(cat4PreClimb, 'Should generate pre-climb fueling for Cat 4 climbs');

    // Verify hourly intake and average rate
    const intake = calculateHourlyIntake(plan, stats.totalDist, 25);
    assert.ok(intake.avgCarbsPerHour >= 60 && intake.avgCarbsPerHour <= 80, `Average carbs/h should be in 60-80g range, got ${intake.avgCarbsPerHour}`);
    assert.ok(intake.totalFluidMl <= 5500, `Total fluid should be realistic (<= 5500ml), got ${intake.totalFluidMl}ml`);

    // Verify max hourly carbs does not exceed 100g (no 130g gut-rot spikes)
    intake.hours.forEach(h => {
      assert.ok(h.carbsG <= 100, `Hour ${h.hour} carbs (${h.carbsG}g) should not exceed 100g`);
    });
  });

  it('guarantees zero decal height overflow in renderFuelingSVG with high item count', async () => {
    const { renderFuelingSVG } = await import('../js/fueling-renderer.js');
    const mockItems = [];
    for (let i = 0; i < 35; i++) {
      mockItems.push({
        id: `it-${i}`,
        distM: (i + 1) * 8000,
        timeSec: (i + 1) * 1200,
        name: i % 2 === 0 ? 'Energy Gel' : 'Solid Bar',
        type: i % 2 === 0 ? 'gel' : 'bar',
        carbsG: 25,
        fluidMl: 0,
        isHazard: false
      });
    }

    const mockState = {
      settings: { fuelingWidthMm: 35, fuelingHeightMm: 115, theme: 'white' },
      stats: { totalDist: 300000 },
      fueling: { mode: 'km', targetCarbsPerHour: 75, avgSpeedKmh: 25, items: mockItems }
    };

    const svg = renderFuelingSVG(mockState);
    const rowYPositions = [...svg.matchAll(/transform="translate\([^,]+,\s*([^)]+)\)"/g)].map(m => parseFloat(m[1]));
    const maxRowY = Math.max(...rowYPositions);

    // Decal height is 115mm, footer is at 108.4mm; last row must be <= 106mm
    assert.ok(maxRowY <= 106, `Max row Y (${maxRowY}mm) must not exceed 106mm on 115mm decal`);
  });

  it('renders multi-column 2-column layout when decal width >= 55mm', async () => {
    const { renderFuelingSVG } = await import('../js/fueling-renderer.js');
    const mockItems = [];
    for (let i = 0; i < 16; i++) {
      mockItems.push({
        id: `col-it-${i}`,
        distM: (i + 1) * 10000,
        timeSec: (i + 1) * 1500,
        name: 'Item ' + (i + 1),
        type: 'gel',
        carbsG: 25,
        fluidMl: 0,
        isHazard: false
      });
    }

    const mockState = {
      settings: { fuelingWidthMm: 70, fuelingHeightMm: 115, theme: 'white' },
      stats: { totalDist: 160000 },
      fueling: { mode: 'km', targetCarbsPerHour: 75, avgSpeedKmh: 25, items: mockItems }
    };

    const svg = renderFuelingSVG(mockState, { widthMm: 70 });
    const colXPositions = new Set([...svg.matchAll(/transform="translate\(([^,]+),/g)].map(m => parseFloat(m[1])));
    assert.ok(colXPositions.size >= 2, 'Should position items in at least 2 distinct column X offsets');
  });

  it('calculates elapsed seconds including aid station stoppage time', () => {
    // 25km at 25km/h = 3600s + 600s stop = 4200s
    const sec = distToElapsedSeconds(25000, 25, 600);
    assert.strictEqual(sec, 4200);
  });
});




