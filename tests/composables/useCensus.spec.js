/**
 * useCensus Composable Tests
 *
 * Tests for Census API integration (ACS population data)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockFetch = vi.hoisted(() => vi.fn())
vi.stubGlobal('fetch', mockFetch)

vi.stubEnv('VITE_QWI_KEY', 'test-api-key')

import useCensus from '@/composables/setup/useCensus'

describe('useCensus Composable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Initial State', () => {
    it('should return empty population data initially', () => {
      const { populationData } = useCensus('27')

      expect(populationData.value).toEqual([])
    })

    it('should have a fetchPopulationData function', () => {
      const { fetchPopulationData } = useCensus('27')
      expect(typeof fetchPopulationData).toBe('function')
    })
  })

  describe('fetchPopulationData Success', () => {
    it('should transform array-of-arrays to array-of-objects', async () => {
      const mockResponse = [
        ['NAME', 'B01001_001E', 'state', 'metropolitan statistical area/micropolitan statistical area'],
        ['Minneapolis-St. Paul, MN-WI', '3500000', '27', '33460'],
        ['St. Cloud, MN', '250000', '27', '34820']
      ]

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      })

      const { populationData, fetchPopulationData } = useCensus('27')
      await fetchPopulationData()

      expect(populationData.value).toHaveLength(2)
      expect(populationData.value[0]).toEqual({
        name: 'Minneapolis-St. Paul, MN-WI',
        population: '3500000',
        state_code: '27',
        msa_code: '33460'
      })
    })

    it('should skip header row', async () => {
      const mockResponse = [
        ['NAME', 'B01001_001E', 'state', 'msa'],
        ['City1', '100000', '27', '12345'],
        ['City2', '200000', '27', '12346']
      ]

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      })

      const { populationData, fetchPopulationData } = useCensus('27')
      await fetchPopulationData()

      // Header row should not be in data
      expect(populationData.value.some(item => item.name === 'NAME')).toBe(false)
      expect(populationData.value).toHaveLength(2)
    })

    it('should handle multiple MSAs', async () => {
      const mockResponse = [
        ['NAME', 'B01001_001E', 'state', 'msa'],
        ['City1', '100000', '27', '12345'],
        ['City2', '200000', '27', '12346'],
        ['City3', '300000', '27', '12347']
      ]

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      })

      const { populationData, fetchPopulationData } = useCensus('27')
      await fetchPopulationData()

      expect(populationData.value).toHaveLength(3)
      expect(populationData.value.map(d => d.msa_code)).toEqual(['12345', '12346', '12347'])
    })
  })

  describe('fetchPopulationData Error Handling', () => {
    it('should handle fetch errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      const { populationData, fetchPopulationData } = useCensus('27')

      // Should not throw
      expect(async () => await fetchPopulationData()).not.toThrow()
      expect(populationData.value).toEqual([])
    })

    it('should handle JSON parse errors', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON')
        }
      })

      const { populationData, fetchPopulationData } = useCensus('27')

      expect(async () => await fetchPopulationData()).not.toThrow()
      expect(populationData.value).toEqual([])
    })
  })

  describe('URL Construction', () => {
    it('should construct correct URL with state parameter', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [['NAME', 'B01001_001E', 'state', 'msa']]
      })

      const { fetchPopulationData } = useCensus('27')
      await fetchPopulationData()

      const callArgs = mockFetch.mock.calls[0][0]
      expect(callArgs).toContain('state:27')
      expect(callArgs).toContain('https://api.census.gov/data/2022/acs/acs5')
    })

    it('should include API key in URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [['NAME', 'B01001_001E', 'state', 'msa']]
      })

      const { fetchPopulationData } = useCensus('27')
      await fetchPopulationData()

      const callArgs = mockFetch.mock.calls[0][0]
      expect(callArgs).toContain('key=test-api-key')
    })

    it('should request correct fields', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [['NAME', 'B01001_001E', 'state', 'msa']]
      })

      const { fetchPopulationData } = useCensus('27')
      await fetchPopulationData()

      const callArgs = mockFetch.mock.calls[0][0]
      expect(callArgs).toContain('B01001_001E')
      expect(callArgs).toContain('NAME')
    })

    it('should query MSA/Micropolitan areas', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [['NAME', 'B01001_001E', 'state', 'msa']]
      })

      const { fetchPopulationData } = useCensus('27')
      await fetchPopulationData()

      const callArgs = mockFetch.mock.calls[0][0]
      expect(callArgs).toContain('metropolitan')
    })
  })

  describe('Different States', () => {
    it('should handle different state FIPS codes', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [['NAME', 'B01001_001E', 'state', 'msa']]
      })

      const { fetchPopulationData: fetch1 } = useCensus('27') // Minnesota
      const { fetchPopulationData: fetch2 } = useCensus('06') // California

      await fetch1()
      await fetch2()

      const calls = mockFetch.mock.calls
      expect(calls[0][0]).toContain('state:27')
      expect(calls[1][0]).toContain('state:06')
    })
  })

  describe('Data Transformation', () => {
    it('should correctly map array indices to object properties', async () => {
      const mockResponse = [
        ['NAME', 'B01001_001E', 'state', 'msa'],
        ['Test City', '50000', '27', '99999']
      ]

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      })

      const { populationData, fetchPopulationData } = useCensus('27')
      await fetchPopulationData()

      const item = populationData.value[0]
      expect(item.name).toBe('Test City')
      expect(item.population).toBe('50000')
      expect(item.state_code).toBe('27')
      expect(item.msa_code).toBe('99999')
    })
  })
})
