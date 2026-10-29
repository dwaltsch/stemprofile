/**
 * Load Guard Module
 *
 * Route files and share links load asynchronously. When a second load starts
 * before the first finishes, only the newest may be applied; otherwise a slow
 * older load could overwrite the route the user just picked.
 *
 * @module load-guard
 */

let latest = 0;

/** Starts a load and returns its token. */
export function beginLoad() {
  latest += 1;
  return latest;
}

/** Whether `token` belongs to the most recently started load. */
export function isLatestLoad(token) {
  return token === latest;
}
