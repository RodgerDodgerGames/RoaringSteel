/**
 * Vitest Setup File
 *
 * This file runs before all tests to set up the testing environment.
 * It configures Pinia for store testing and any global test utilities.
 */

import { beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

/**
 * Before each test, create a fresh Pinia instance.
 * This ensures tests are isolated and don't share state.
 */
beforeEach(() => {
  setActivePinia(createPinia())
})
