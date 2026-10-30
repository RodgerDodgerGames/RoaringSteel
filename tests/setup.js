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

/**
 * Before each test, create a fresh Pinia instance and an empty database.
 * This ensures tests are isolated and don't share state.
 */
beforeEach(() => {
  setActivePinia(createPinia())
  globalThis.indexedDB = new IDBFactory()
})
