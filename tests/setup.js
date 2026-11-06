/**
 * Vitest Setup File
 *
 * This file runs before all tests to set up the testing environment.
 * It configures Pinia for store testing and any global test utilities.
 */

import { beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
// An in-memory IndexedDB, standing in for the browser's (see database.js)
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { useWaterStore } from '@/stores/water'
import { waterData } from './utils/testWater'

/**
 * Before each test, create a fresh Pinia instance and an empty database.
 * This ensures tests are isolated and don't share state.
 *
 * The game's water data is a file the browser fetches from the game's own
 * server (see stores/water.js), which tests have none of: each test starts
 * with a board with no water, and tests about water give their own (see
 * utils/testWater.js).
 */
beforeEach(() => {
  setActivePinia(createPinia())
  globalThis.indexedDB = new IDBFactory()
  useWaterStore().setData(waterData())
})
