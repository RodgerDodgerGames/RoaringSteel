/**
 * useElevationAPI Composable Tests
 *
 * Tests for Open-Elevation API integration
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockFetch = vi.hoisted(() => vi.fn())
vi.stubGlobal('fetch', mockFetch)

vi.mock('@/composables/utils', () => ({
  waitRandomly: vi.fn(() => Promise.resolve())
}))

import { useElevationAPI } from '@/composables/setup/useElevationAPI'

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

    it('should return one entry per location when the API returns a short result set', async () => {
      // Two locations asked about, one answered. Padding keeps every later
      // location lined up with its own grid cell.
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

      expect(results).toEqual([{ elevation: 100 }, null])
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
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ results: [] })
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
