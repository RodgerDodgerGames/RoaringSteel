/**
 * The Browser Database (database.js)
 *
 * Everything the game keeps in the browser between visits, apart from the
 * player's settings, lives in one IndexedDB database:
 * - `autosaves`: the last few games saved automatically as they were played
 * - `grids`: each state's grid of terrain, once built, one per land cover
 *   year and cell size
 * - `caches`: each state's towns and industry data, as fetched from the
 *   Census Bureau
 *
 * Why IndexedDB rather than localStorage: localStorage holds about 5 million
 * characters for the whole site and only text, so a grid had to be turned
 * into text to fit and a large one did not fit at all. IndexedDB holds
 * hundreds of megabytes and stores a grid's typed arrays as they are. The
 * settings stay in localStorage: they are small, and are read the moment the
 * page starts, before anything could wait on a database.
 *
 * Each call opens the database, does its work and closes it again. The game
 * reads and writes it only a few times a game — at setup, at a load, once a
 * round for the autosave — so holding a connection open would save nothing,
 * and opening fresh means each call sees the database as it is now.
 *
 * Whatever goes in must be plain data: IndexedDB copies what it is given,
 * and cannot copy Vue's reactive wrappers (see `plain`).
 *
 * @module composables/database
 */

import { openDB } from 'idb'

const DB_NAME = 'roaring-steel'

/**
 * The database's version. Raise it, with a step in `upgrade` below, to add
 * or change a store — and also whenever the way a grid is built changes (its
 * costs, its cells), clearing `grids` in that step: kept grids are found by
 * state, cell size and year alone, so a grid built the old way would
 * otherwise go on being used.
 */
const DB_VERSION = 1

/** How many autosaves are kept; the oldest goes when another is added */
export const MAX_AUTOSAVES = 3

/**
 * The localStorage keys the game used before it moved to IndexedDB, by
 * prefix: autosaves, grids, towns and industry data. Nothing reads them now.
 */
const OLD_STORAGE_PREFIXES = [
  'roaringsteel_autosave_',
  'cachedGrid_',
  'towns_',
  'industries_',
  'employmentData_',
  'MSAs_',
  'industryWindow_'
]

/**
 * Opens the database, creating its stores the first time.
 * @returns {Promise<IDBPDatabase>} The open database
 */
function openDatabase() {
  return openDB(DB_NAME, DB_VERSION, {
    // Runs each step the browser's copy has not had yet, from the version it
    // has (0 the first time) up to DB_VERSION
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        // Autosaves are numbered as they are added, so the highest number is
        // the newest
        db.createObjectStore('autosaves', { keyPath: 'id', autoIncrement: true })
        // A grid is known by the state, its cell size and the year of land
        // cover it was drawn from. Keyed in that order, every year of one
        // state's grid at one cell size sits together and can be listed at
        // once.
        db.createObjectStore('grids', { keyPath: ['state', 'cellSize', 'landCoverYear'] })
        // Towns and industry data, each under a name such as "towns_27"
        db.createObjectStore('caches')
      }
    }
  })
}

/**
 * Opens the database, runs `work` with it, and closes it again.
 * @param {Function} work - Given the open database; may be async
 * @returns {Promise<*>} What `work` returns
 */
async function withDatabase(work) {
  const db = await openDatabase()
  try {
    return await work(db)
  } finally {
    db.close()
  }
}

/**
 * A copy of a value as plain data, which IndexedDB can store. Store state is
 * wrapped in Vue's reactive proxies, which IndexedDB refuses to copy. A trip
 * through JSON drops them; it is meant for game state and towns, which are
 * plain JSON underneath. (A grid holds typed arrays, which JSON would mangle,
 * and is never reactive — see stores/grid.js — so it goes in as it is.)
 * @param {*} value - JSON-safe data, possibly reactive
 * @returns {*} The same data, plain
 */
export function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

// AUTOSAVES

/**
 * Adds an autosave, and drops the oldest so that only the newest
 * `MAX_AUTOSAVES` remain.
 * @param {Object} save - The saved game, as plain data
 * @returns {Promise<number>} The new autosave's id
 */
export function addAutoSave(save) {
  return withDatabase(async (db) => {
    const tx = db.transaction('autosaves', 'readwrite')
    const id = await tx.store.add(save)
    const ids = await tx.store.getAllKeys()
    // Keys come back in order, oldest first
    const surplus = ids.slice(0, Math.max(0, ids.length - MAX_AUTOSAVES))
    await Promise.all(surplus.map((oldId) => tx.store.delete(oldId)))
    await tx.done
    return id
  })
}

/**
 * Every autosave, newest first. Each comes back with its `id`.
 * @returns {Promise<Array<Object>>} The saved games
 */
export function getAutoSaves() {
  return withDatabase(async (db) => (await db.getAll('autosaves')).reverse())
}

/**
 * One autosave.
 * @param {number} id - The autosave's id
 * @returns {Promise<Object|undefined>} The saved game, or undefined if there
 *   is none by that id
 */
export function getAutoSave(id) {
  return withDatabase((db) => db.get('autosaves', id))
}

// GRIDS

/**
 * Keeps a grid. A grid already kept for the same state, cell size and year
 * is replaced; other years are left alone.
 * @param {Object} record - What to keep
 * @param {string} record.state - The state's FIPS code
 * @param {number} record.cellSize - Cell size in meters
 * @param {number} record.landCoverYear - The year of land cover it was drawn from
 * @param {Object} record.grid - The grid (see cellGrid.js)
 * @returns {Promise<void>}
 */
export function putGrid(record) {
  return withDatabase((db) => db.put('grids', record))
}

/**
 * The grid kept for a state, cell size and year.
 * @param {string} state - The state's FIPS code
 * @param {number} cellSize - Cell size in meters
 * @param {number} landCoverYear - The year of land cover
 * @returns {Promise<Object|undefined>} The record `putGrid` kept, or undefined
 */
export function getGrid(state, cellSize, landCoverYear) {
  return withDatabase((db) => db.get('grids', [state, cellSize, landCoverYear]))
}

/**
 * The years of every grid kept for a state at a cell size, earliest first.
 * Only the keys are read: each grid is megabytes, and only one is wanted.
 * @param {string} state - The state's FIPS code
 * @param {number} cellSize - Cell size in meters
 * @returns {Promise<Array<number>>} The years
 */
export async function getGridYears(state, cellSize) {
  const range = IDBKeyRange.bound([state, cellSize, -Infinity], [state, cellSize, Infinity])
  const keys = await withDatabase((db) => db.getAllKeys('grids', range))
  return keys.map(([, , landCoverYear]) => landCoverYear)
}

// TOWNS AND INDUSTRY

/**
 * What is kept under a name in the caches. A database that cannot be read
 * counts as keeping nothing: the data is fetched afresh instead.
 * @param {string} name - Such as "towns_27"
 * @returns {Promise<*>} What was kept, or undefined
 */
export async function readCache(name) {
  try {
    return await withDatabase((db) => db.get('caches', name))
  } catch (e) {
    console.warn(`Could not read ${name} from the database:`, e)
    return undefined
  }
}

/**
 * Keeps data under a name in the caches, replacing what was there. Data that
 * cannot be kept is only fetched again next time, so a failure is logged and
 * not passed on.
 * @param {string} name - Such as "towns_27"
 * @param {*} value - JSON-safe data; reactive store state is fine (see `plain`)
 * @returns {Promise<void>}
 */
export async function writeCache(name, value) {
  try {
    await withDatabase((db) => db.put('caches', plain(value), name))
  } catch (e) {
    console.warn(`Could not keep ${name} in the database:`, e)
  }
}

// HOUSEKEEPING

/**
 * Deletes what the game kept in localStorage before it moved to IndexedDB:
 * the old autosaves, grids, towns and industry data. Those saves cannot be
 * loaded any more, and the caches would only fill the space the settings
 * share. Run at every start; once they are gone, it finds nothing to do.
 */
export function clearOldStorage() {
  // A browser blocking the site's storage throws on any use of localStorage;
  // there is then nothing to clear, and the game must still start
  try {
    // Collected first: removing keys while walking them shifts the numbering
    const oldKeys = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (OLD_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) oldKeys.push(key)
    }
    oldKeys.forEach((key) => localStorage.removeItem(key))
  } catch (e) {
    console.warn('Could not clear old saves from localStorage:', e)
  }
}

/**
 * Asks the browser to keep the game's storage rather than clear it when the
 * disk runs low. Without this, a browser may throw away the autosaves and
 * grids of a site it judges unimportant.
 *
 * Chrome decides by itself; Firefox asks the player. So it is asked when a
 * game is started — once the player has shown they mean to play — and only
 * while the storage is not already kept, so a player is not asked again.
 *
 * @returns {Promise<boolean>} True if the storage is kept
 */
export async function keepStorage() {
  if (!navigator.storage?.persist) return false
  try {
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch (e) {
    console.warn('Could not ask to keep storage:', e)
    return false
  }
}
