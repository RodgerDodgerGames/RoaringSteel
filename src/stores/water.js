/**
 * Water Store (water.js)
 *
 * The game's water data — Natural Earth's rivers, lakes, sea and named bays,
 * shipped with the game in public/data/water.json (see
 * scripts/build-water-data.mjs and composables/map/waterData.js).
 *
 * The file is the same for every game, so it is fetched once, the first time
 * a grid is built or loaded, and kept for as long as the page is open. It is
 * kept out of Vue's reactivity, as the grid is: it holds tens of thousands
 * of points, and nothing in it ever changes.
 *
 * What reads it:
 * - the grid store, to mark which cells are lake or sea as it builds a grid;
 * - the track builder, for where track crosses rivers (see water.js);
 * - the map, to draw the water and its names (see waterLayer.js).
 *
 * @module stores/water
 */

import { defineStore } from 'pinia'
import { shallowRef, markRaw } from 'vue'
import { prepareWaterData } from '@/composables/map/waterData'
import { fetchWithRetries } from '@/composables/utils'

/** Where the game's water file is served from */
const WATER_FILE = '/data/water.json'

export const useWaterStore = defineStore('water', () => {
  /** The water data (see `prepareWaterData`), or null until it is loaded */
  const data = shallowRef(null)

  /** The load in progress, so callers arriving together share one fetch */
  let loading = null

  /**
   * Loads the water data, unless it is loaded already.
   * @returns {Promise<boolean>} True once the data is there; false if it
   *   could not be fetched (a later call tries again)
   */
  function load() {
    if (data.value) return Promise.resolve(true)
    loading ??= (async () => {
      try {
        const response = await fetchWithRetries(WATER_FILE)
        if (!response.ok) throw new Error(`Water data: HTTP ${response.status}`)
        setData(await response.json())
        return true
      } catch (e) {
        console.error('Could not load the water data:', e)
        return false
      } finally {
        loading = null
      }
    })()
    return loading
  }

  /**
   * Puts water data in place, as read from the file: what `load` does once
   * it has fetched it, and how tests give the game water of their own.
   * @param {Object} raw - The water file's contents
   */
  function setData(raw) {
    data.value = markRaw(prepareWaterData(raw))
  }

  return { data, load, setData }
})
