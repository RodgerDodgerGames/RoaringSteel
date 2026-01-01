/**
 * useLandCoverAPI Composable Tests
 *
 * Tests for NLCD Land Cover API integration
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

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
                'PALETTE_INDEX': 22 // Urban/developed area
              }
            }
          ]
        })
      })

      const { fetchLandCover } = useLandCoverAPI()
      const location = { lat: 44.9778, lng: -93.2650 }

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
                'PALETTE_INDEX': 41 // Forest
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
                'PALETTE_INDEX': 22
              }
            },
            {
              properties: {
                'PALETTE_INDEX': 41
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
  })

  describe('URL Construction', () => {
    it('should construct GetFeatureInfo URL with correct parameters', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          features: [{ properties: { 'PALETTE_INDEX': 22 } }]
        })
      })

      const { fetchLandCover } = useLandCoverAPI()
      const location = { lat: 44.9778, lng: -93.2650 }

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
          features: [{ properties: { 'PALETTE_INDEX': 22 } }]
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
          features: [{ properties: { 'PALETTE_INDEX': 22 } }]
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
          features: [{ properties: { 'PALETTE_INDEX': 22 } }]
        })
      })

      const { fetchLandCover } = useLandCoverAPI()
      const location = { lat: 44.0, lng: -93.0 }

      await fetchLandCover(location)

      const url = mockFetch.mock.calls[0][0]
      expect(url).toContain('application%2Fjson')
    })
  })

  describe('Different Locations', () => {
    it('should handle different coordinates', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          features: [{ properties: { 'PALETTE_INDEX': 22 } }]
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
