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

import { describe, it, expect, beforeEach, vi } from 'vitest'

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

vi.mock('@/composables/setup/useQWI', () => ({
  default: () => ({
    data: mockQWIData,
    error: mockQWIError,
    fetchQWI: mockFetchQWI
  })
}))

import { useIndustryStore } from '@/stores/industry'

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
      const cachedEmploymentData = [{ industry: 111, meanEmp: { '12345': 100 } }]
      const cachedMSAs = ['12345']

      mockUseLocalStorage.mockImplementation((key) => {
        if (key.includes('industries_')) return { value: cachedIndustries }
        if (key.includes('employmentData_')) return { value: cachedEmploymentData }
        if (key.includes('MSAs_')) return { value: cachedMSAs }
        return { value: [] }
      })

      await industryStore.useIndustryData('27')

      expect(industryStore.industries).toEqual(cachedIndustries)
      expect(industryStore.employmentData).toEqual(cachedEmploymentData)
      expect(industryStore.MSAs).toEqual(cachedMSAs)
      // Should not fetch when cached
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('useIndustryData loading states', () => {
    it('should set isLoadingCSV to true during CSV fetch', async () => {
      const loadingStates = []

      mockFetch.mockImplementation(async () => {
        loadingStates.push({ csv: industryStore.isLoadingCSV })
        return { text: async () => 'naics_code,label,ind_level\n111,Agriculture,2' }
      })

      await industryStore.useIndustryData('27')

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

      await industryStore.useIndustryData('27')

      expect(loadingStates[0].qwi).toBe(true)
      expect(industryStore.isLoadingQWI).toBe(false)
    })
  })

  describe('useIndustryData error handling', () => {
    it('should handle CSV fetch errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      // Should not throw
      await industryStore.useIndustryData('27')

      expect(industryStore.isLoadingCSV).toBe(false)
      expect(industryStore.industries).toEqual([])
    })

    it('should not proceed to QWI fetch when CSV fails', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      await industryStore.useIndustryData('27')

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
      await industryStore.useIndustryData('27')

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

      await industryStore.useIndustryData('27')

      expect(industryStore.isLoadingQWI).toBe(false)
      expect(industryStore.employmentData).toEqual([])
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
          mockQWIData.value = [{ Emp: 0, msa_code: '12345' }, { Emp: null, msa_code: '12346' }]
        } else {
          mockQWIData.value = [{ Emp: 100, msa_code: '12345' }]
        }
      })

      await industryStore.useIndustryData('27')

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

      await industryStore.useIndustryData('27')

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

      await industryStore.useIndustryData('27')

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

      await industryStore.useIndustryData('27')

      // Agriculture proportion should be capped at 0.2 despite being ~99% of employment
      const agricultureData = industryStore.employmentData.find(e => e.industry === 111)
      expect(agricultureData.proportion).toBe(0.2)
    })
  })
})
