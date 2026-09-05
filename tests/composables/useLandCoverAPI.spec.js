/**
 * useLandCoverAPI Composable Tests
 *
 * Tests for NLCD Land Cover API integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const mockFetch = vi.hoisted(() => vi.fn())
vi.stubGlobal('fetch', mockFetch)

vi.mock('@/config/nlcd', () => ({
  nlcdCostMap: {
    11: 1,
    12: 1,
    21: 2,
    22: 5,
    23: 3,
    24: 4,
    31: 2,
    41: 1,
    42: 1,
    43: 1,
    51: 2,
    52: 3,
    71: 1,
    72: 2,
    73: 2,
    74: 2,
    81: 2,
    82: 2,
    90: 1,
    95: 1
  }
}))

import { useLandCoverAPI } from '@/composables/setup/useLandCoverAPI'
import { gridApiConfig } from '@/config/grid'

describe('useLandCoverAPI Composable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('fetchLandCover Success', () => {
    it('should fetch land cover cost for location', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          features: [
            {
              properties: {
                PALETTE_INDEX: 22 // Urban/developed area
              }
            }
          ]
        })
      })

      const { fetchLandCover } = useLandCoverAPI()
      const location = { lat: 44.9778, lng: -93.265 }

      const cost = await fetchLandCover(location)

      expect(cost).toBe(5)
    })

    it('should handle different land cover types', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          features: [
            {
              properties: {
                PALETTE_INDEX: 41 // Forest
              }
            }
          ]
        })
      })

      const { fetchLandCover } = useLandCoverAPI()
      const location = { lat: 44.0, lng: -93.0 }

      const cost = await fetchLandCover(location)

      expect(cost).toBe(1)
    })

    it('should return cost for first feature when multiple features exist', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          features: [
            {
              properties: {
                PALETTE_INDEX: 22
              }
            },
            {
              properties: {
                PALETTE_INDEX: 41
              }
            }
          ]
        })
      })

      const { fetchLandCover } = useLandCoverAPI()
      const location = { lat: 44.0, lng: -93.0 }

      const cost = await fetchLandCover(location)

      expect(cost).toBe(5)
    })
  })

  describe('Error Handling', () => {
    it('should return null on fetch error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      const { fetchLandCover } = useLandCoverAPI()
      const location = { lat: 44.0, lng: -93.0 }

      const cost = await fetchLandCover(location)

      expect(cost).toBeNull()
    })

    it('should return null on JSON parse error', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON')
        }
      })

      const { fetchLandCover } = useLandCoverAPI()
      const location = { lat: 44.0, lng: -93.0 }

      const cost = await fetchLandCover(location)

      expect(cost).toBeNull()
    })

    it('should not throw on error', async () => {
      mockFetch.mockRejectedValue(new Error('API unavailable'))

      const { fetchLandCover } = useLandCoverAPI()
      const location = { lat: 44.0, lng: -93.0 }

      expect(async () => await fetchLandCover(location)).not.toThrow()
    })

    it('should return null on a rate-limited response', async () => {
      // A 429 body has no `features`, so it used to fall through to the parse
      // and get written off as a cell with no land cover.
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: 'Too Many Requests' })
      })

      const { fetchLandCover } = useLandCoverAPI()

      const cost = await fetchLandCover({ lat: 44.0, lng: -93.0 })

      expect(cost).toBeNull()
    })

    it('should return null for a land cover class with no cost mapping', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          features: [{ properties: { PALETTE_INDEX: 999 } }]
        })
      })

      const { fetchLandCover } = useLandCoverAPI()

      const cost = await fetchLandCover({ lat: 44.0, lng: -93.0 })

      expect(cost).toBeNull()
    })
  })

  describe('fetchLandCoverInBatches', () => {
    it('should return one cost per location, in order', async () => {
      const palettes = [22, 41, 31]
      let call = 0

      mockFetch.mockImplementation(async () => ({
        ok: true,
        json: async () => ({
          features: [{ properties: { PALETTE_INDEX: palettes[call++] } }]
        })
      }))

      const { fetchLandCoverInBatches } = useLandCoverAPI()
      const locations = [
        { lat: 44.0, lng: -93.0 },
        { lat: 45.0, lng: -94.0 },
        { lat: 46.0, lng: -95.0 }
      ]

      const results = await fetchLandCoverInBatches(locations)

      expect(results).toEqual([5, 1, 2])
    })

    it('should keep going when a single location fails', async () => {
      let call = 0

      mockFetch.mockImplementation(async () => {
        call++
        if (call === 1) throw new Error('Network error')
        return {
          ok: true,
          json: async () => ({ features: [{ properties: { PALETTE_INDEX: 22 } }] })
        }
      })

      const { fetchLandCoverInBatches } = useLandCoverAPI()
      const locations = [
        { lat: 44.0, lng: -93.0 },
        { lat: 45.0, lng: -94.0 }
      ]

      const results = await fetchLandCoverInBatches(locations)

      expect(results).toEqual([null, 5])
    })

    it('should report progress for every location', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ features: [{ properties: { PALETTE_INDEX: 22 } }] })
      })

      const onProgress = vi.fn()
      const { fetchLandCoverInBatches } = useLandCoverAPI()
      const locations = Array(5).fill({ lat: 44.0, lng: -93.0 })

      await fetchLandCoverInBatches(locations, onProgress)

      expect(onProgress).toHaveBeenCalledTimes(5)
      expect(onProgress.mock.calls.map((c) => c[0])).toEqual([1, 2, 3, 4, 5])
      expect(onProgress).toHaveBeenLastCalledWith(5, 5)
    })

    it('should cap how many requests are in flight at once', async () => {
      let inFlight = 0
      let peak = 0

      mockFetch.mockImplementation(async () => {
        inFlight++
        peak = Math.max(peak, inFlight)
        await new Promise((resolve) => setTimeout(resolve, 5))
        inFlight--
        return {
          ok: true,
          json: async () => ({ features: [{ properties: { PALETTE_INDEX: 22 } }] })
        }
      })

      const { fetchLandCoverInBatches } = useLandCoverAPI()

      await fetchLandCoverInBatches(Array(20).fill({ lat: 44.0, lng: -93.0 }))

      expect(peak).toBeLessThanOrEqual(gridApiConfig.landCoverConcurrency)
    })

    it('should handle an empty location list', async () => {
      const { fetchLandCoverInBatches } = useLandCoverAPI()

      const results = await fetchLandCoverInBatches([])

      expect(results).toEqual([])
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('URL Construction', () => {
    it('should construct GetFeatureInfo URL with correct parameters', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          features: [{ properties: { PALETTE_INDEX: 22 } }]
        })
      })

      const { fetchLandCover } = useLandCoverAPI()
      const location = { lat: 44.9778, lng: -93.265 }

      await fetchLandCover(location)

      const url = mockFetch.mock.calls[0][0]
      expect(url).toContain('mrlc.gov/geoserver')
      expect(url).toContain('GetFeatureInfo')
      expect(url).toContain('NLCD_2021_Land_Cover_L48')
    })

    it('should include coordinates in bounding box', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          features: [{ properties: { PALETTE_INDEX: 22 } }]
        })
      })

      const { fetchLandCover } = useLandCoverAPI()
      const location = { lat: 44.0, lng: -93.0 }

      await fetchLandCover(location)

      const url = mockFetch.mock.calls[0][0]
      // Bounding box should be 0.01 degrees around the point
      expect(url).toContain('BBOX=')
      expect(url).toContain('-93.01')
      expect(url).toContain('-92.99')
      expect(url).toContain('43.99')
      expect(url).toContain('44.01')
    })

    it('should request center pixel coordinates', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          features: [{ properties: { PALETTE_INDEX: 22 } }]
        })
      })

      const { fetchLandCover } = useLandCoverAPI()
      const location = { lat: 44.0, lng: -93.0 }

      await fetchLandCover(location)

      const url = mockFetch.mock.calls[0][0]
      expect(url).toContain('I=128') // Center of 256x256
      expect(url).toContain('J=128')
    })

    it('should request JSON response format', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          features: [{ properties: { PALETTE_INDEX: 22 } }]
        })
      })

      const { fetchLandCover } = useLandCoverAPI()
      const location = { lat: 44.0, lng: -93.0 }

      await fetchLandCover(location)

      const url = mockFetch.mock.calls[0][0]
      expect(url).toContain('application%2Fjson')
    })
  })

  describe('Stalled Requests', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('should give up on a cell whose request never answers', async () => {
      vi.useFakeTimers()
      mockFetch.mockReturnValue(new Promise(() => {}))

      const { fetchLandCover } = useLandCoverAPI()
      const pending = fetchLandCover({ lat: 44.9778, lng: -93.265 })
      await vi.advanceTimersByTimeAsync(gridApiConfig.landCoverTimeoutMs)

      await expect(pending).resolves.toBeNull()
    })

    it('should finish the run when one cell stalls, instead of parking setup (#85)', async () => {
      // This is the reported bug: two of 399 cells never answered, so two pool
      // workers waited forever, the run never resolved, and the game sat on the
      // setup modal with a full bar and no error.
      vi.useFakeTimers()
      const answered = {
        ok: true,
        json: async () => ({ features: [{ properties: { PALETTE_INDEX: 22 } }] })
      }
      mockFetch
        .mockImplementationOnce(() => Promise.resolve(answered))
        .mockImplementationOnce(() => new Promise(() => {}))
        .mockImplementationOnce(() => Promise.resolve(answered))

      const { fetchLandCoverInBatches } = useLandCoverAPI()
      const pending = fetchLandCoverInBatches([
        { lat: 44.0, lng: -93.0 },
        { lat: 45.0, lng: -94.0 },
        { lat: 46.0, lng: -95.0 }
      ])
      await vi.advanceTimersByTimeAsync(gridApiConfig.landCoverTimeoutMs * 2)

      // The stalled cell comes back null, which the grid store counts against
      // its land cover failure rate like any other failed lookup.
      await expect(pending).resolves.toEqual([5, null, 5])
    })
  })

  describe('Different Locations', () => {
    it('should handle different coordinates', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          features: [{ properties: { PALETTE_INDEX: 22 } }]
        })
      })

      const { fetchLandCover } = useLandCoverAPI()

      await fetchLandCover({ lat: 44.0, lng: -93.0 })
      await fetchLandCover({ lat: 45.0, lng: -94.0 })

      expect(mockFetch).toHaveBeenCalledTimes(2)
      const calls = mockFetch.mock.calls
      expect(calls[0][0]).toContain('44')
      expect(calls[1][0]).toContain('45')
    })
  })
})
