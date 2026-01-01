/**
 * useTigerWeb Composable Tests
 *
 * Tests for TigerWeb API integration (MSA coordinates)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockFetch = vi.hoisted(() => vi.fn())
vi.stubGlobal('fetch', mockFetch)

import getMSALatLon from '@/composables/setup/useTigerWeb'

describe('useTigerWeb (getMSALatLon)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Success Cases', () => {
    it('should return coordinates for valid MSA code', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          features: [
            {
              attributes: {
                INTPTLON: '-93.2650',
                INTPTLAT: '44.9778'
              }
            }
          ]
        })
      })

      const result = await getMSALatLon('33460')

      expect(result).toEqual({
        centroidLongitude: '-93.2650',
        centroidLatitude: '44.9778'
      })
    })

    it('should try layer 3 first', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          features: [
            {
              attributes: {
                INTPTLON: '-93.0',
                INTPTLAT: '44.0'
              }
            }
          ]
        })
      })

      await getMSALatLon('33460')

      const firstCall = mockFetch.mock.calls[0][0]
      expect(firstCall).toContain('/3/')
    })

    it('should fall back to layer 4 if layer 3 has no results', async () => {
      mockFetch.mockImplementation(async (url) => {
        if (url.includes('/3/')) {
          return {
            ok: true,
            json: async () => ({ features: [] })
          }
        }
        return {
          ok: true,
          json: async () => ({
            features: [
              {
                attributes: {
                  INTPTLON: '-94.0',
                  INTPTLAT: '45.0'
                }
              }
            ]
          })
        }
      })

      const result = await getMSALatLon('33460')

      expect(result).toEqual({
        centroidLongitude: '-94.0',
        centroidLatitude: '45.0'
      })
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('should extract first feature from multiple results', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          features: [
            {
              attributes: {
                INTPTLON: '-93.2650',
                INTPTLAT: '44.9778'
              }
            },
            {
              attributes: {
                INTPTLON: '-95.0',
                INTPTLAT: '46.0'
              }
            }
          ]
        })
      })

      const result = await getMSALatLon('33460')

      expect(result.centroidLongitude).toBe('-93.2650')
      expect(result.centroidLatitude).toBe('44.9778')
    })
  })

  describe('Error Handling', () => {
    it('should return false when MSA not found in any layer', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ features: [] })
      })

      const result = await getMSALatLon('99999')

      expect(result).toBe(false)
    })

    it('should return false on fetch error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      const result = await getMSALatLon('33460')

      expect(result).toBe(false)
    })

    it('should return false on HTTP error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      })

      const result = await getMSALatLon('33460')

      expect(result).toBe(false)
    })

    it('should return false on invalid response structure', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          // Missing features property
        })
      })

      const result = await getMSALatLon('33460')

      expect(result).toBe(false)
    })

    it('should not throw on error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      expect(async () => await getMSALatLon('33460')).not.toThrow()
    })
  })

  describe('URL Construction', () => {
    it('should construct correct query URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ features: [] })
      })

      await getMSALatLon('33460')

      const url = mockFetch.mock.calls[0][0]
      expect(url).toContain('tigerweb.geo.census.gov')
      expect(url).toContain('CBSA')
      expect(url).toContain('CBSA%3D%2733460%27')
      expect(url).toContain('INTPTLON%2CINTPTLAT')
      expect(url).toContain('f=json')
    })

    it('should use correct WMS parameters', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ features: [] })
      })

      await getMSALatLon('12345')

      const url = mockFetch.mock.calls[0][0]
      expect(url).toContain('outFields=INTPTLON%2CINTPTLAT')
      expect(url).toContain('returnGeometry=false')
    })
  })

  describe('Different MSA Codes', () => {
    it('should handle different MSA codes', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          features: [
            {
              attributes: {
                INTPTLON: '-93.0',
                INTPTLAT: '44.0'
              }
            }
          ]
        })
      })

      const result1 = await getMSALatLon('33460') // Minneapolis
      const result2 = await getMSALatLon('34820') // St. Cloud

      expect(mockFetch).toHaveBeenCalledTimes(2)
      const calls = mockFetch.mock.calls
      expect(calls[0][0]).toContain('33460')
      expect(calls[1][0]).toContain('34820')
    })
  })
})
