/**
 * useQWI Composable Tests
 *
 * Tests for QWI (Quarterly Workforce Indicators) API integration
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock fetch globally
const mockFetch = vi.hoisted(() => vi.fn())
vi.stubGlobal('fetch', mockFetch)

// Mock environment variable
vi.stubEnv('VITE_QWI_KEY', 'test-api-key')

import useQWI from '@/composables/setup/useQWI'

describe('useQWI Composable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Initial State', () => {
    it('should return empty data and no error initially', () => {
      const { data, error } = useQWI('27', 111)

      expect(data.value).toEqual([])
      expect(error.value).toBeNull()
    })

    it('should have a fetchQWI function', () => {
      const { fetchQWI } = useQWI('27', 111)
      expect(typeof fetchQWI).toBe('function')
    })
  })

  describe('fetchQWI Success', () => {
    it('should transform array-of-arrays response to array-of-objects', async () => {
      const mockResponse = [
        ['Emp', 'metropolitan statistical area/micropolitan statistical area', 'state', 'time'],
        ['100', '12345', '27', '2023-Q1'],
        ['200', '12345', '27', '2023-Q2']
      ]

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse
      })

      const { data, fetchQWI } = useQWI('27', 111)
      await fetchQWI()

      expect(data.value).toHaveLength(2)
      expect(data.value[0]).toEqual({
        Emp: '100',
        msa_code: '12345',
        state: '27',
        time: '2023-Q1'
      })
      expect(data.value[1]).toEqual({
        Emp: '200',
        msa_code: '12345',
        state: '27',
        time: '2023-Q2'
      })
    })

    it('should rename long MSA column name to msa_code', async () => {
      const mockResponse = [
        ['Emp', 'metropolitan statistical area/micropolitan statistical area', 'state'],
        ['100', '12345', '27']
      ]

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse
      })

      const { data, fetchQWI } = useQWI('27', 111)
      await fetchQWI()

      expect(data.value[0]).toHaveProperty('msa_code', '12345')
    })

    it('should skip header row in data', async () => {
      const mockResponse = [
        ['Emp', 'msa_code', 'state'],
        ['100', '12345', '27'],
        ['200', '12346', '27']
      ]

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse
      })

      const { data, fetchQWI } = useQWI('27', 111)
      await fetchQWI()

      // Should not include header row
      expect(data.value.some((item) => item.Emp === 'Emp')).toBe(false)
      expect(data.value).toHaveLength(2)
    })

    it('should handle 204 No Content response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204
      })

      const { data, error, fetchQWI } = useQWI('27', 111)
      await fetchQWI()

      expect(data.value).toEqual([])
      expect(error.value).toBeNull()
    })
  })

  describe('fetchQWI Error Handling', () => {
    it('should set error on HTTP error', async () => {
      const errorResponse = 'Invalid API key'
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => errorResponse
      })

      const { error, fetchQWI } = useQWI('27', 111)
      await fetchQWI()

      expect(error.value).toContain('401')
      expect(error.value).toContain(errorResponse)
    })

    it('should handle fetch network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      const { error, fetchQWI } = useQWI('27', 111)
      await fetchQWI()

      expect(error.value).toContain('Network error')
    })

    it('should not throw on error', async () => {
      mockFetch.mockRejectedValue(new Error('Connection failed'))

      const { fetchQWI } = useQWI('27', 111)

      // Should not throw
      expect(async () => await fetchQWI()).not.toThrow()
    })
  })

  describe('URL Construction', () => {
    it('should construct correct URL with state and industry parameters', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204
      })

      const { fetchQWI } = useQWI('27', 111)
      await fetchQWI()

      const callArgs = mockFetch.mock.calls[0][0]
      expect(callArgs).toContain('state:27')
      expect(callArgs).toContain('industry=111')
      expect(callArgs).toContain('https://api.census.gov/data/timeseries/qwi/sa')
    })

    it('should include API key in URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204
      })

      const { fetchQWI } = useQWI('27', 111)
      await fetchQWI()

      const callArgs = mockFetch.mock.calls[0][0]
      expect(callArgs).toContain('key=test-api-key')
    })
  })

  describe('Multiple Industries', () => {
    it('should handle different industry codes', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204
      })

      const { fetchQWI: fetchQWI1 } = useQWI('27', 111)
      const { fetchQWI: fetchQWI2 } = useQWI('27', 112)

      await fetchQWI1()
      await fetchQWI2()

      const calls = mockFetch.mock.calls
      expect(calls[0][0]).toContain('industry=111')
      expect(calls[1][0]).toContain('industry=112')
    })

    it('should handle different states', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204
      })

      const { fetchQWI: fetchQWI1 } = useQWI('27', 111)
      const { fetchQWI: fetchQWI2 } = useQWI('06', 111)

      await fetchQWI1()
      await fetchQWI2()

      const calls = mockFetch.mock.calls
      expect(calls[0][0]).toContain('state:27')
      expect(calls[1][0]).toContain('state:06')
    })
  })
})
