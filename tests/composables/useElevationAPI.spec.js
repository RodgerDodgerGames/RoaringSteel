/**
 * useElevationAPI Composable Tests
 *
 * Tests for Open-Elevation API integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const mockFetch = vi.hoisted(() => vi.fn())
vi.stubGlobal('fetch', mockFetch)

// Only the pacing is stubbed out; `fetchWithTimeout` stays real so the
// request ceiling is genuinely exercised here rather than mocked away.
vi.mock('@/composables/utils', async (importActual) => ({
  ...(await importActual()),
  waitRandomly: vi.fn(() => Promise.resolve())
}))

import { useElevationAPI } from '@/composables/setup/useElevationAPI'
import { gridApiConfig } from '@/config/grid'

describe('useElevationAPI Composable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('fetchElevationsInBatches', () => {
    it('should fetch elevation data for single location', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [{ elevation: 400 }]
        })
      })

      const { fetchElevationsInBatches } = useElevationAPI()
      const locations = [{ lat: 44.9778, lng: -93.265 }]

      const results = await fetchElevationsInBatches(locations)

      expect(results).toEqual([{ elevation: 400 }])
    })

    it('should fetch elevation data for multiple locations in single batch', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [{ elevation: 100 }, { elevation: 200 }, { elevation: 300 }]
        })
      })

      const { fetchElevationsInBatches } = useElevationAPI()
      const locations = [
        { lat: 44.0, lng: -93.0 },
        { lat: 44.5, lng: -93.5 },
        { lat: 45.0, lng: -94.0 }
      ]

      const results = await fetchElevationsInBatches(locations)

      expect(results).toHaveLength(3)
      expect(results[0].elevation).toBe(100)
      expect(results[2].elevation).toBe(300)
    })

    it('should split large requests into batches', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          results: Array(3).fill({ elevation: 100 })
        })
      })

      const { fetchElevationsInBatches } = useElevationAPI()
      const locations = Array(9).fill({ lat: 44.0, lng: -93.0 })

      await fetchElevationsInBatches(locations, 3)

      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    it('should preserve order of results across batches', async () => {
      mockFetch.mockImplementation(async (url) => {
        const elevations = [
          [{ elevation: 100 }, { elevation: 200 }],
          [{ elevation: 300 }, { elevation: 400 }]
        ]
        const batchIndex = mockFetch.mock.calls.length - 1
        return {
          ok: true,
          json: async () => ({
            results: elevations[batchIndex]
          })
        }
      })

      const { fetchElevationsInBatches } = useElevationAPI()
      const locations = Array(4).fill({ lat: 44.0, lng: -93.0 })

      const results = await fetchElevationsInBatches(locations, 2)

      expect(results).toEqual([
        { elevation: 100 },
        { elevation: 200 },
        { elevation: 300 },
        { elevation: 400 }
      ])
    })
  })

  describe('Stalled Requests', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('should abandon a batch whose request never answers', async () => {
      // Without a ceiling this promise never settles and setup hangs (#85).
      vi.useFakeTimers()
      mockFetch.mockReturnValue(new Promise(() => {}))

      const { fetchElevationsInBatches } = useElevationAPI()
      const pending = fetchElevationsInBatches([{ lat: 44, lng: -93 }], 50)
      await vi.advanceTimersByTimeAsync(gridApiConfig.elevationTimeoutMs)

      // A null reads as "unknown", never as a sea-level reading of 0
      await expect(pending).resolves.toEqual([null])
    })
  })

  describe('Error Handling', () => {
    it('should return null for each location on fetch error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      const { fetchElevationsInBatches } = useElevationAPI()
      const locations = [{ lat: 44.0, lng: -93.0 }]

      const results = await fetchElevationsInBatches(locations)

      // null means "we never found out", which the grid store drops. A zero
      // would be indistinguishable from a genuine sea-level reading.
      expect(results).toEqual([null])
    })

    it('should return one null per location on error', async () => {
      mockFetch.mockRejectedValue(new Error('API unavailable'))

      const { fetchElevationsInBatches } = useElevationAPI()
      const locations = [
        { lat: 44.0, lng: -93.0 },
        { lat: 45.0, lng: -94.0 },
        { lat: 46.0, lng: -95.0 }
      ]

      const results = await fetchElevationsInBatches(locations)

      expect(results).toEqual([null, null, null])
    })

    it('should not throw on error', async () => {
      mockFetch.mockRejectedValue(new Error('Connection failed'))

      const { fetchElevationsInBatches } = useElevationAPI()
      const locations = [{ lat: 44.0, lng: -93.0 }]

      expect(async () => await fetchElevationsInBatches(locations)).not.toThrow()
    })

    it('should not treat a rate-limited response as elevation data', async () => {
      // A 429 still returns a parseable body, just without `results`. Reading
      // it as success used to blow up on the spread in the batch loop.
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: 'Too Many Requests' })
      })

      const { fetchElevationsInBatches } = useElevationAPI()
      const locations = [
        { lat: 44.0, lng: -93.0 },
        { lat: 45.0, lng: -94.0 }
      ]

      const results = await fetchElevationsInBatches(locations)

      expect(results).toEqual([null, null])
    })

    it('should discard a batch whose result count does not match the request', async () => {
      // Two locations asked about, one answered. Which one it belongs to is
      // unknowable, and a reading on the wrong cell silently mis-prices track,
      // so the whole batch is dropped rather than guessed at.
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ results: [{ elevation: 100 }] })
      })

      const { fetchElevationsInBatches } = useElevationAPI()
      const locations = [
        { lat: 44.0, lng: -93.0 },
        { lat: 45.0, lng: -94.0 }
      ]

      const results = await fetchElevationsInBatches(locations)

      expect(results).toEqual([null, null])
    })

    it('should not let a short batch shift later batches onto the wrong cells', async () => {
      // First batch answers 1 of 2 and is discarded; the second is intact and
      // must still line up with locations 3 and 4.
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ results: [{ elevation: 100 }] })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ results: [{ elevation: 300 }, { elevation: 400 }] })
        })

      const { fetchElevationsInBatches } = useElevationAPI()
      const locations = Array(4).fill({ lat: 44.0, lng: -93.0 })

      const results = await fetchElevationsInBatches(locations, 2)

      expect(results).toEqual([null, null, { elevation: 300 }, { elevation: 400 }])
    })

    it('should keep later batches aligned when an earlier batch fails', async () => {
      // First batch errors, second succeeds. Without padding, the second
      // batch's readings would slide onto the first batch's cells.
      mockFetch.mockRejectedValueOnce(new Error('Network error')).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ elevation: 300 }, { elevation: 400 }] })
      })

      const { fetchElevationsInBatches } = useElevationAPI()
      const locations = Array(4).fill({ lat: 44.0, lng: -93.0 })

      const results = await fetchElevationsInBatches(locations, 2)

      expect(results).toEqual([null, null, { elevation: 300 }, { elevation: 400 }])
    })

    it('should return null entries when the response has no results array', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({})
      })

      const { fetchElevationsInBatches } = useElevationAPI()
      const locations = [{ lat: 44.0, lng: -93.0 }]

      const results = await fetchElevationsInBatches(locations)

      expect(results).toEqual([null])
    })
  })

  describe('Progress Reporting', () => {
    it('should report cumulative progress after each batch', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ results: [{ elevation: 100 }, { elevation: 200 }] })
      })

      const onProgress = vi.fn()
      const { fetchElevationsInBatches } = useElevationAPI()
      const locations = Array(6).fill({ lat: 44.0, lng: -93.0 })

      await fetchElevationsInBatches(locations, 2, onProgress)

      expect(onProgress.mock.calls).toEqual([
        [2, 6],
        [4, 6],
        [6, 6]
      ])
    })
  })

  describe('URL Construction', () => {
    it('should construct correct URL with location coordinates', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ results: [{ elevation: 100 }] })
      })

      const { fetchElevationsInBatches } = useElevationAPI()
      const locations = [{ lat: 44.9778, lng: -93.265 }]

      await fetchElevationsInBatches(locations)

      const url = mockFetch.mock.calls[0][0]
      expect(url).toContain('api.open-elevation.com')
      expect(url).toContain('44.9778')
      expect(url).toContain('-93.265')
    })

    it('should encode multiple locations in pipe-separated format', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [{ elevation: 100 }, { elevation: 200 }]
        })
      })

      const { fetchElevationsInBatches } = useElevationAPI()
      const locations = [
        { lat: 44.0, lng: -93.0 },
        { lat: 45.0, lng: -94.0 }
      ]

      await fetchElevationsInBatches(locations)

      const url = mockFetch.mock.calls[0][0]
      expect(url).toContain('44%2C')
      expect(url).toContain('-93')
      expect(url).toContain('%7C')
    })
  })

  describe('Batching Behavior', () => {
    it('should use default batch size of 100', async () => {
      mockFetch.mockImplementation(async (url) => {
        // Answer with one result per requested location so the batch is kept
        const count = decodeURIComponent(url).split('|').length
        return {
          ok: true,
          json: async () => ({ results: Array(count).fill({ elevation: 100 }) })
        }
      })

      const { fetchElevationsInBatches } = useElevationAPI()
      const locations = Array(150).fill({ lat: 44.0, lng: -93.0 })

      await fetchElevationsInBatches(locations)

      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('should use custom batch size', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ results: Array(5).fill({ elevation: 100 }) })
      })

      const { fetchElevationsInBatches } = useElevationAPI()
      const locations = Array(10).fill({ lat: 44.0, lng: -93.0 })

      await fetchElevationsInBatches(locations, 5)

      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })
})
