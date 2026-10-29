/**
 * Industry Store Tests
 *
 * Tests for the industry store including:
 * - Initial state
 * - Loading state transitions
 * - Error handling
 * - Cache usage
 * - Employment data calculation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Create hoisted mocks
const mockUseLocalStorage = vi.hoisted(() => vi.fn())
const mockFetchQWI = vi.hoisted(() => vi.fn())
const mockQWIData = vi.hoisted(() => ({ value: [] }))
const mockQWIError = vi.hoisted(() => ({ value: null }))

// Mock fetch globally
const mockFetch = vi.hoisted(() => vi.fn())
vi.stubGlobal('fetch', mockFetch)

vi.mock('@vueuse/core', () => ({
  useLocalStorage: mockUseLocalStorage
}))

const mockUseQWI = vi.hoisted(() =>
  vi.fn(() => ({
    data: mockQWIData,
    error: mockQWIError,
    fetchQWI: mockFetchQWI
  }))
)

vi.mock('@/composables/setup/useQWI', () => ({
  default: (...args) => mockUseQWI(...args)
}))

import { useIndustryStore } from '@/stores/industry'

/** A game's data window: QWI from 2021 to 2025 */
const WINDOW = { start: 2021, end: 2025, middle: 2023 }

/**
 * localStorage as it stands after an earlier fetch of one industry for one
 * MSA, built for the given window (none, for a cache from before windows were
 * recorded). Writes land in `written`, by key.
 */
function cacheFrom(window, written = {}) {
  const stored = {
    industries_: [{ naics_code: 111, label: 'Agriculture' }],
    employmentData_: [{ industry: 111, meanEmp: { 12345: 100 } }],
    MSAs_: ['12345'],
    industryWindow_: window ?? {}
  }
  return (key, defaultValue) => {
    const prefix = Object.keys(stored).find((name) => key.startsWith(name))
    const ref = { _value: prefix ? stored[prefix] : defaultValue }
    return Object.defineProperty(ref, 'value', {
      get: () => ref._value,
      set: (value) => {
        ref._value = value
        written[key] = value
      }
    })
  }
}

describe('Industry Store', () => {
  let industryStore

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset mock data
    mockQWIData.value = []
    mockQWIError.value = null
    // Default mock implementations
    mockUseLocalStorage.mockImplementation((key, defaultValue) => ({ value: defaultValue }))
    mockFetchQWI.mockResolvedValue(undefined)
    mockFetch.mockResolvedValue({
      text: async () => 'naics_code,label,ind_level\n'
    })
    industryStore = useIndustryStore()
  })

  describe('Initial State', () => {
    it('should start with empty employmentData', () => {
      expect(industryStore.employmentData).toEqual([])
    })

    it('should start with empty industries', () => {
      expect(industryStore.industries).toEqual([])
    })

    it('should start with empty MSAs', () => {
      expect(industryStore.MSAs).toEqual([])
    })

    it('should start with isLoadingCSV as false', () => {
      expect(industryStore.isLoadingCSV).toBe(false)
    })

    it('should start with isLoadingQWI as false', () => {
      expect(industryStore.isLoadingQWI).toBe(false)
    })
  })

  describe('useIndustryData with cached data', () => {
    it('should use cached data when available', async () => {
      const cachedIndustries = [{ naics_code: 111, label: 'Agriculture' }]
      const cachedEmploymentData = [{ industry: 111, meanEmp: { 12345: 100 } }]
      const cachedMSAs = ['12345']

      mockUseLocalStorage.mockImplementation((key) => {
        if (key.includes('industries_')) return { value: cachedIndustries }
        if (key.includes('employmentData_')) return { value: cachedEmploymentData }
        if (key.includes('MSAs_')) return { value: cachedMSAs }
        if (key.includes('industryWindow_')) return { value: { start: 2021, end: 2025 } }
        return { value: [] }
      })

      await industryStore.useIndustryData('27', WINDOW)

      expect(industryStore.industries).toEqual(cachedIndustries)
      expect(industryStore.employmentData).toEqual(cachedEmploymentData)
      expect(industryStore.MSAs).toEqual(cachedMSAs)
      // Should not fetch when cached
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should fetch again when the cache was built for another window', async () => {
      mockUseLocalStorage.mockImplementation(cacheFrom({ start: 2020, end: 2024 }))
      mockFetch.mockResolvedValue({
        text: async () => 'naics_code,label,ind_level\n112,Livestock,2'
      })
      mockFetchQWI.mockImplementation(async () => {
        mockQWIData.value = [{ Emp: 40, msa_code: '22222' }]
      })

      await industryStore.useIndustryData('27', WINDOW)

      expect(mockFetchQWI).toHaveBeenCalled()
      expect(industryStore.employmentData.map((e) => e.industry)).toEqual([112])
      expect(industryStore.MSAs).toEqual(['22222'])
    })

    it('should fetch again when the cache records no window', async () => {
      mockUseLocalStorage.mockImplementation(cacheFrom(null))

      await industryStore.useIndustryData('27', WINDOW)

      expect(mockFetch).toHaveBeenCalled()
    })

    it("should fetch each industry over the data window's years", async () => {
      mockFetch.mockResolvedValue({
        text: async () => 'naics_code,label,ind_level\n111,Agriculture,2'
      })

      await industryStore.useIndustryData('27', WINDOW)

      expect(mockUseQWI).toHaveBeenCalledWith('27', 111, WINDOW)
    })

    it('should record the window the cache was built for', async () => {
      const written = {}
      mockUseLocalStorage.mockImplementation(cacheFrom(null, written))
      mockFetch.mockResolvedValue({
        text: async () => 'naics_code,label,ind_level\n111,Agriculture,2'
      })
      mockFetchQWI.mockImplementation(async () => {
        mockQWIData.value = [{ Emp: 100, msa_code: '12345' }]
      })

      await industryStore.useIndustryData('27', WINDOW)

      expect(written.industryWindow_27).toEqual({ start: 2021, end: 2025 })
    })

    it("should not add a fetch onto an earlier fetch's data", async () => {
      mockFetch.mockResolvedValue({
        text: async () => 'naics_code,label,ind_level\n111,Agriculture,2'
      })
      mockFetchQWI.mockImplementation(async () => {
        mockQWIData.value = [{ Emp: 100, msa_code: '12345' }]
      })

      await industryStore.useIndustryData('27', WINDOW)
      await industryStore.useIndustryData('27', { start: 2022, end: 2026, middle: 2024 })

      expect(industryStore.employmentData).toHaveLength(1)
      expect(industryStore.MSAs).toEqual(['12345'])
    })
  })

  describe('useIndustryData loading states', () => {
    it('should set isLoadingCSV to true during CSV fetch', async () => {
      const loadingStates = []

      mockFetch.mockImplementation(async () => {
        loadingStates.push({ csv: industryStore.isLoadingCSV })
        return { text: async () => 'naics_code,label,ind_level\n111,Agriculture,2' }
      })

      await industryStore.useIndustryData('27', WINDOW)

      expect(loadingStates[0].csv).toBe(true)
      expect(industryStore.isLoadingCSV).toBe(false)
    })

    it('should set isLoadingQWI to true during QWI fetch', async () => {
      const loadingStates = []

      mockFetch.mockResolvedValue({
        text: async () => 'naics_code,label,ind_level\n111,Agriculture,2'
      })

      mockFetchQWI.mockImplementation(async () => {
        loadingStates.push({ qwi: industryStore.isLoadingQWI })
        mockQWIData.value = [{ Emp: 100, msa_code: '12345' }]
      })

      await industryStore.useIndustryData('27', WINDOW)

      expect(loadingStates[0].qwi).toBe(true)
      expect(industryStore.isLoadingQWI).toBe(false)
    })
  })

  describe('useIndustryData error handling', () => {
    it('should handle CSV fetch errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      // Should not throw
      await industryStore.useIndustryData('27', WINDOW)

      expect(industryStore.isLoadingCSV).toBe(false)
      expect(industryStore.industries).toEqual([])
    })

    it('should not proceed to QWI fetch when CSV fails', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      await industryStore.useIndustryData('27', WINDOW)

      expect(mockFetchQWI).not.toHaveBeenCalled()
    })

    it('should handle QWI fetch errors gracefully and continue', async () => {
      mockFetch.mockResolvedValue({
        text: async () => 'naics_code,label,ind_level\n111,Agriculture,2\n112,Livestock,2'
      })

      let callCount = 0
      mockFetchQWI.mockImplementation(async () => {
        callCount++
        if (callCount === 1) {
          throw new Error('QWI API error')
        }
        mockQWIData.value = [{ Emp: 100, msa_code: '12345' }]
      })

      // Should not throw
      await industryStore.useIndustryData('27', WINDOW)

      expect(industryStore.isLoadingQWI).toBe(false)
      // Should have processed second industry despite first one erroring
      expect(industryStore.employmentData.length).toBe(1)
    })

    it('should handle QWI composable errors', async () => {
      mockFetch.mockResolvedValue({
        text: async () => 'naics_code,label,ind_level\n111,Agriculture,2'
      })

      mockFetchQWI.mockImplementation(async () => {
        mockQWIError.value = 'API rate limit exceeded'
      })

      await industryStore.useIndustryData('27', WINDOW)

      expect(industryStore.isLoadingQWI).toBe(false)
      expect(industryStore.employmentData).toEqual([])
    })
  })

  describe('useIndustryData when an industry fails', () => {
    // Agriculture fails, by its composable error; Livestock comes back
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        text: async () => 'naics_code,label,ind_level\n111,Agriculture,2\n112,Livestock,2'
      })
      mockUseQWI.mockImplementation((state, industry) => {
        const error = { value: null }
        const data = { value: [] }
        const fetchQWI = async () => {
          if (industry === 111) error.value = 'HTTP error! status: 500'
          else data.value = [{ Emp: 100, msa_code: '12345' }]
        }
        return { data, error, fetchQWI }
      })
    })

    // Back to the shared mocks the other tests script
    afterEach(() => {
      mockUseQWI.mockImplementation(() => ({
        data: mockQWIData,
        error: mockQWIError,
        fetchQWI: mockFetchQWI
      }))
    })

    it('should record the industries that failed', async () => {
      await industryStore.useIndustryData('27', WINDOW)

      expect(industryStore.failedIndustries).toEqual([111])
      expect(industryStore.employmentData.map((row) => row.industry)).toEqual([112])
    })

    it('should record an industry whose fetch throws', async () => {
      mockUseQWI.mockImplementation(() => ({
        data: { value: [] },
        error: { value: null },
        fetchQWI: async () => {
          throw new Error('QWI API error')
        }
      }))

      await industryStore.useIndustryData('27', WINDOW)

      expect(industryStore.failedIndustries).toEqual([111, 112])
    })

    it('should not cache a fetch with an industry missing', async () => {
      const written = {}
      mockUseLocalStorage.mockImplementation(cacheFrom(null, written))

      await industryStore.useIndustryData('27', WINDOW)

      expect(written).toEqual({})
    })

    it('should forget the failures once a later fetch comes from the cache', async () => {
      await industryStore.useIndustryData('27', WINDOW)
      mockUseLocalStorage.mockImplementation(cacheFrom({ start: 2021, end: 2025 }))

      await industryStore.useIndustryData('27', WINDOW)

      expect(industryStore.failedIndustries).toEqual([])
    })

    it('should not count an industry the API turned down, and still cache the fetch', async () => {
      const written = {}
      mockUseLocalStorage.mockImplementation(cacheFrom(null, written))
      mockUseQWI.mockImplementation((state, industry) => ({
        data: { value: industry === 111 ? [] : [{ Emp: 100, msa_code: '12345' }] },
        error: { value: industry === 111 ? 'HTTP error! status: 400' : null },
        refused: { value: industry === 111 },
        fetchQWI: async () => {}
      }))

      await industryStore.useIndustryData('27', WINDOW)

      expect(industryStore.failedIndustries).toEqual([])
      expect(written.industryWindow_27).toEqual({ start: 2021, end: 2025 })
    })

    it('should not count an industry with no jobs as failed', async () => {
      mockUseQWI.mockImplementation(() => ({
        data: { value: [{ Emp: 0, msa_code: '12345' }] },
        error: { value: null },
        fetchQWI: async () => {}
      }))

      await industryStore.useIndustryData('27', WINDOW)

      expect(industryStore.failedIndustries).toEqual([])
    })
  })

  describe('useIndustryData data processing', () => {
    it('should skip industries with all zero employment data', async () => {
      mockFetch.mockResolvedValue({
        text: async () => 'naics_code,label,ind_level\n111,Agriculture,2\n112,Livestock,2'
      })

      let callCount = 0
      mockFetchQWI.mockImplementation(async () => {
        callCount++
        if (callCount === 1) {
          mockQWIData.value = [
            { Emp: 0, msa_code: '12345' },
            { Emp: null, msa_code: '12346' }
          ]
        } else {
          mockQWIData.value = [{ Emp: 100, msa_code: '12345' }]
        }
      })

      await industryStore.useIndustryData('27', WINDOW)

      // Only the second industry should be in employmentData
      expect(industryStore.employmentData.length).toBe(1)
      expect(industryStore.employmentData[0].industry).toBe(112)
    })

    it('should calculate average employment correctly', async () => {
      mockFetch.mockResolvedValue({
        text: async () => 'naics_code,label,ind_level\n111,Agriculture,2'
      })

      mockFetchQWI.mockImplementation(async () => {
        mockQWIData.value = [
          { Emp: 100, msa_code: '12345' },
          { Emp: 200, msa_code: '12345' },
          { Emp: 300, msa_code: '12346' }
        ]
      })

      await industryStore.useIndustryData('27', WINDOW)

      expect(industryStore.employmentData[0].meanEmp['12345']).toBe(150) // (100+200)/2
      expect(industryStore.employmentData[0].meanEmp['12346']).toBe(300) // 300/1
    })

    it('should populate MSAs list from employment data', async () => {
      mockFetch.mockResolvedValue({
        text: async () => 'naics_code,label,ind_level\n111,Agriculture,2'
      })

      mockFetchQWI.mockImplementation(async () => {
        mockQWIData.value = [
          { Emp: 100, msa_code: '12345' },
          { Emp: 200, msa_code: '12346' }
        ]
      })

      await industryStore.useIndustryData('27', WINDOW)

      expect(industryStore.MSAs).toContain('12345')
      expect(industryStore.MSAs).toContain('12346')
    })

    it('should calculate proportions capped at 0.2', async () => {
      mockFetch.mockResolvedValue({
        text: async () => 'naics_code,label,ind_level\n111,Agriculture,2\n112,Livestock,2'
      })

      let callCount = 0
      mockFetchQWI.mockImplementation(async () => {
        callCount++
        if (callCount === 1) {
          // Agriculture: very high employment
          mockQWIData.value = [{ Emp: 1000, msa_code: '12345' }]
        } else {
          // Livestock: low employment
          mockQWIData.value = [{ Emp: 10, msa_code: '12345' }]
        }
      })

      await industryStore.useIndustryData('27', WINDOW)

      // Agriculture proportion should be capped at 0.2 despite being ~99% of employment
      const agricultureData = industryStore.employmentData.find((e) => e.industry === 111)
      expect(agricultureData.proportion).toBe(0.2)
    })
  })
})
