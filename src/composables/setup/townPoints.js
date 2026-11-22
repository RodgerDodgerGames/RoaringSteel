/**
 * Town Points (townPoints.js)
 *
 * The game's table of where each metro and micro area's town goes
 * (config/townPoints.json, written by scripts/build-town-points.mjs): at
 * the downtown of its main city, from the U.S. Geological Survey's place
 * names, or just inside its state's outline where downtown is just outside.
 * The script's header says why not at the Census Bureau's point for the
 * city, and which few towns are left there.
 *
 * An area in the table needs no TIGERweb lookup. One that is not — a new
 * area, or one in Puerto Rico — is looked up (see useTigerWeb.js).
 *
 * @module composables/setup/townPoints
 */

import points from '@/config/townPoints.json'

/**
 * Where an area's town goes, by the table.
 * @param {string} msaCode - The area's code
 * @returns {{lat: number, lon: number, name: string, stateFips: string}|null}
 *   Where, and the main city's name and state, as `findPrincipalCity` gives
 *   them; null for an area not in the table
 */
export function townPoint(msaCode) {
  if (!Object.hasOwn(points, msaCode)) return null
  const [lat, lon, name, stateFips] = points[msaCode]
  return { lat, lon, name, stateFips }
}

/**
 * A town site as the table has it. Sites are kept in the browser's
 * database, so one kept before the table was made or last rebuilt may have
 * an older point. The main city's name and state come from the same row, so
 * a rebuilt table never leaves one city's name at another's point.
 * @param {{msa: string, lat: number, lon: number}} site - The site
 * @returns {Object} A copy with the table's point, name and state, or the
 *   same site for an area not in the table
 */
export function atTownPoint(site) {
  const point = townPoint(site.msa)
  if (!point) return site
  const { lat, lon, name, stateFips } = point
  return { ...site, lat, lon, name, stateCode: stateFips }
}
