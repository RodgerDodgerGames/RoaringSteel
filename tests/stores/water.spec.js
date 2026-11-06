/**
 * Water Store Tests
 *
 * The water data is one file, fetched the first time it is needed and kept
 * for as long as the page is open. A failed fetch is reported, and tried
 * again the next time the data is asked for.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useWaterStore } from '@/stores/water'
import { waterData, river } from '../utils/testWater'

const mockFetch = vi.fn()

describe('Water Store', () => {
  let waterStore

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockReset()
    waterStore = useWaterStore()
    // The test setup gives every test empty water; these start with none
    waterStore.data = null
  })
  afterEach(() => vi.unstubAllGlobals())

  /** A server answering with the water file */
  const answerWith = (data) =>
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => data })

  it('should fetch the water file once, however many ask for it together', async () => {
    const data = waterData({
      rivers: [
        river([
          { lat: 0, lng: 0 },
          { lat: 1, lng: 0 }
        ])
      ]
    })
    answerWith(data)

    const results = await Promise.all([waterStore.load(), waterStore.load()])
    await waterStore.load()

    expect(results).toEqual([true, true])
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(waterStore.data.rivers.features).toHaveLength(1)
  })

  it('should give every feature its bounding box, to find the water near a board by', async () => {
    answerWith(
      waterData({
        rivers: [
          river([
            { lat: 1, lng: 2 },
            { lat: 3, lng: 4 }
          ])
        ]
      })
    )

    await waterStore.load()

    expect(waterStore.data.rivers.features[0].bbox).toEqual([2, 1, 4, 3])
  })

  it('should say when the water file could not be had, and try again next time', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })

    expect(await waterStore.load()).toBe(false)
    expect(waterStore.data).toBeNull()

    answerWith(waterData())
    expect(await waterStore.load()).toBe(true)
  })
})
