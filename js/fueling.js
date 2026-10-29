/**
 * Pro Fueling & Nutrition Strategy Module
 *
 * Implements algorithms for:
 * 1. Pro cycling carbohydrate & hydration strategy planning (~60-80g CHO/h default)
 * 2. GPX waypoint extraction (aid stations, feed zones, water stops)
 * 3. Terrain gradient hazard detection (flagging steep climbs >8-10% and descents <-5%)
 * 4. Safe feed window detection & pre-climb fueling placement
 * 5. Long sustained climb mid-ascent fueling detection
 * 6. Hourly carbohydrate distribution & pacing conversion (KM vs Elapsed Time)
 *
 * @module fueling
 */

export * from './fueling/presets.js';
export * from './fueling/terrain.js';
export * from './fueling/timing.js';
export * from './fueling/plan.js';
export * from './fueling/pacing.js';
export * from './fueling/sanitize.js';
