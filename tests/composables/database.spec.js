/**
 * Browser Database Tests
 *
 * The database (database.js) keeps autosaves, grids and the towns and
 * industry caches. These tests cover what is not already covered through the
 * stores that use it: which grids a lookup finds, clearing away what the game
 * kept in localStorage before, and asking the browser to keep the storage.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getGrid,
  getGridYears,
  putGrid,
  readCache,
  writeCache,
  clearOldStorage,
  keepStorage
} from '@/composables/database'
import { SETTINGS_STORAGE_KEY } from '@/stores/settings'
import { reactive } from 'vue'

/** A stand-in for a grid: the database stores whatever it is given */
const grid = (label) => ({ label, cost: new Float32Array([1, 2, 3]) })

describe('database', () => {
  describe('grids', () => {
    it('should keep one grid per state, cell size and year', async () => {
      await putGrid({ state: '27', cellSize: 10000, landCoverYear: 2023, grid: grid('a') })
      await putGrid({ state: '27', cellSize: 10000, landCoverYear: 2023, grid: grid('b') })
      await putGrid({ state: '27', cellSize: 5000, landCoverYear: 2023, grid: grid('c') })

      expect((await getGrid('27', 10000, 2023)).grid.label).toBe('b')
      expect((await getGrid('27', 5000, 2023)).grid.label).toBe('c')
      expect(await getGrid('27', 10000, 2022)).toBeUndefined()
    })

    it("should list every year of one state's grid at one cell size, and no other", async () => {
      await putGrid({ state: '27', cellSize: 10000, landCoverYear: 2023, grid: grid('a') })
      await putGrid({ state: '27', cellSize: 10000, landCoverYear: 2019, grid: grid('b') })
      await putGrid({ state: '27', cellSize: 5000, landCoverYear: 2021, grid: grid('c') })
      await putGrid({ state: '28', cellSize: 10000, landCoverYear: 2021, grid: grid('d') })

      expect(await getGridYears('27', 10000)).toEqual([2019, 2023])
    })

    it("should keep a grid's typed arrays as they are", async () => {
      await putGrid({ state: '27', cellSize: 10000, landCoverYear: 2023, grid: grid('a') })

      const { cost } = (await getGrid('27', 10000, 2023)).grid

      expect(cost).toBeInstanceOf(Float32Array)
      expect([...cost]).toEqual([1, 2, 3])
    })
  })

  describe('caches', () => {
    it('should keep reactive store state, which IndexedDB cannot copy as it is', async () => {
      const towns = reactive([{ name: 'Duluth', industries: [{ name: 'Iron' }] }])

      await writeCache('towns_27', { towns })

      expect(await readCache('towns_27')).toEqual({
        towns: [{ name: 'Duluth', industries: [{ name: 'Iron' }] }]
      })
    })

    it('should read nothing, rather than fail, when the database cannot be opened', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.spyOn(indexedDB, 'open').mockImplementation(() => {
        throw new Error('blocked')
      })

      expect(await readCache('towns_27')).toBeUndefined()
      await expect(writeCache('towns_27', {})).resolves.toBeUndefined()
    })
  })

  describe('clearOldStorage', () => {
    beforeEach(() => localStorage.clear())

    it('should remove the autosaves and caches kept in localStorage before', () => {
      ;[
        'roaringsteel_autosave_0',
        'roaringsteel_autosave_index',
        'cachedGrid_27',
        'towns_27',
        'industries_27',
        'employmentData_27',
        'MSAs_27',
        'industryWindow_27'
      ].forEach((key) => localStorage.setItem(key, 'old'))

      clearOldStorage()

      expect(localStorage.length).toBe(0)
    })

    it('should not stop the game starting when the browser blocks storage', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      // A blocking browser throws on any use of localStorage
      vi.stubGlobal('localStorage', {
        get length() {
          throw new DOMException('The operation is insecure.', 'SecurityError')
        }
      })

      expect(() => clearOldStorage()).not.toThrow()
      expect(warn).toHaveBeenCalledWith(
        'Could not clear old saves from localStorage:',
        expect.any(DOMException)
      )
      vi.unstubAllGlobals()
    })

    it("should leave the player's settings alone", () => {
      localStorage.setItem(SETTINGS_STORAGE_KEY, '{}')
      localStorage.setItem('towns_27', 'old')

      clearOldStorage()

      expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toBe('{}')
      expect(localStorage.length).toBe(1)
    })
  })

  describe('keepStorage', () => {
    const originalStorage = navigator.storage

    /** Gives the page a storage manager that reports `persisted` */
    function storageThatIs(persisted) {
      const storage = {
        persisted: vi.fn(async () => persisted),
        persist: vi.fn(async () => true)
      }
      Object.defineProperty(navigator, 'storage', { value: storage, configurable: true })
      return storage
    }

    afterEach(() => {
      Object.defineProperty(navigator, 'storage', { value: originalStorage, configurable: true })
    })

    it('should ask the browser to keep the storage', async () => {
      const storage = storageThatIs(false)

      expect(await keepStorage()).toBe(true)

      expect(storage.persist).toHaveBeenCalled()
    })

    it('should not ask again once the storage is kept', async () => {
      // Firefox asks the player each time it is asked
      const storage = storageThatIs(true)

      expect(await keepStorage()).toBe(true)

      expect(storage.persist).not.toHaveBeenCalled()
    })

    it('should do nothing in a browser that cannot keep storage', async () => {
      Object.defineProperty(navigator, 'storage', { value: undefined, configurable: true })

      expect(await keepStorage()).toBe(false)
    })
  })
})
