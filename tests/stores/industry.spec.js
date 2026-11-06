/**
 * Industry Store Tests
 *
 * Tests for the industry store including:
 * - Initial state
 * - Loading state transitions
 * - Error handling
 * - Cache usage
 * - Employment data calculation
 * - Asking for several industries in one request, and sorting the rows the
 *   answer brings back by industry
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Create hoisted mocks
const mockFetchQWI = vi.hoisted(() => vi.fn())
const mockQWIData = vi.hoisted(() => ({ value: [] }))
const mockQWIError = vi.hoisted(() => ({ value: null }))

// Mock fetch globally
const mockFetch = vi.hoisted(() => vi.fn())
vi.stubGlobal('fetch', mockFetch)

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
import { readCache, writeCache } from '@/composables/database'

/** A game's data window: QWI from 2021 to 2025 */
const WINDOW = { start: 2021, end: 2025, middle: 2023 }

/**
 * The industries file, as fetched, listing the given industries.
 * @param {Array<[number, string, string]>} rows - [code, label, category]
 * @returns {{text: Function}} The response
 */
const industriesFile = (rows) => ({
  text: async () => ['naics_code,label,category', ...rows.map((row) => row.join(','))].join('\n')
})

/** Two industries, one request's worth */
const GRAIN_AND_CATTLE = industriesFile([
  [111, 'Grain', 'Farm'],
  [112, 'Cattle', 'Farm']
])

/** One industry */
const GRAIN = industriesFile([[111, 'Grain', 'Farm']])

/**
 * A row of QWI's answer, as the API sends it: every field text.
 * @param {number} industry - The industry's NAICS code
 * @param {number|null} emp - Its employment that quarter
 * @param {string} msa - The area
 * @returns {Object} The row
 */
const qwiRow = (industry, emp, msa = '12345') => ({
  industry: String(industry),
  Emp: emp === null ? null : String(emp),
  msa_code: msa
})

/**
 * Keeps state 27's industry data as an earlier fetch of one industry for one
 * MSA would have, built for the given window.
 * @param {{start: number, end: number}} dataWindow - The window it was built for
 * @returns {Promise<Object>} What was kept
 */
async function cacheFrom(dataWindow) {
  const cached = {
    dataWindow,
    industries: [{ naics_code: 111, label: 'Grain', category: 'Farm' }],
    employmentData: [{ industry: 111, category: 'Farm', meanEmp: { 12345: 100 } }]
  }
  await writeCache('industryJobs_27', cached)
  return cached
}

/** What the database keeps for state 27's industry data */
const cachedIndustry = () => readCache('industryJobs_27')

describe('Industry Store', () => {
  let industryStore

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset mock data
    mockQWIData.value = []
    mockQWIError.value = null
    // Default mock implementations
    mockFetchQWI.mockResolvedValue(undefined)
    mockFetch.mockResolvedValue({
      text: async () => 'naics_code,label,category\n'
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

    it('should start with isLoadingCSV as false', () => {
      expect(industryStore.isLoadingCSV).toBe(false)
    })

    it('should start with isLoadingQWI as false', () => {
      expect(industryStore.isLoadingQWI).toBe(false)
    })
  })

  describe('useIndustryData with cached data', () => {
    it('should use cached data when available', async () => {
      const cached = await cacheFrom({ start: 2021, end: 2025 })

      await industryStore.useIndustryData('27', WINDOW)

      expect(industryStore.industries).toEqual(cached.industries)
      expect(industryStore.employmentData).toEqual(cached.employmentData)
      // Should not fetch when cached
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should fetch again when the cache was built for another window', async () => {
      await cacheFrom({ start: 2020, end: 2024 })
      mockFetch.mockResolvedValue(industriesFile([[112, 'Cattle', 'Farm']]))
      mockFetchQWI.mockImplementation(async () => {
        mockQWIData.value = [qwiRow(112, 40, '22222')]
      })

      await industryStore.useIndustryData('27', WINDOW)

      expect(mockFetchQWI).toHaveBeenCalled()
      expect(industryStore.employmentData.map((e) => e.industry)).toEqual([112])
      expect(Object.keys(industryStore.employmentData[0].meanEmp)).toEqual(['22222'])
    })

    it('should use the cache whatever window it was built for, when told to take any', async () => {
      // The data window could not be looked up: play from what is cached
      const cached = await cacheFrom({ start: 2020, end: 2024 })

      await industryStore.useIndustryData('27', WINDOW, { anyWindow: true })

      expect(industryStore.employmentData).toEqual(cached.employmentData)
      expect(mockFetchQWI).not.toHaveBeenCalled()
    })

    it('should fetch nothing, and have no data, when told to take any cache and there is none', async () => {
      await industryStore.useIndustryData('27', WINDOW, { anyWindow: true })

      expect(industryStore.employmentData).toEqual([])
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("should fetch the industries over the data window's years, together", async () => {
      mockFetch.mockResolvedValue(GRAIN_AND_CATTLE)

      await industryStore.useIndustryData('27', WINDOW)

      expect(mockUseQWI).toHaveBeenCalledTimes(1)
      expect(mockUseQWI).toHaveBeenCalledWith('27', [111, 112], WINDOW)
    })

    it('should not read the blank line at the end of the industries file as an industry', async () => {
      mockFetch.mockResolvedValue({
        text: async () => 'naics_code,label,category\n111,Grain,Farm\n'
      })

      await industryStore.useIndustryData('27', WINDOW)

      expect(industryStore.industries.map((row) => row.naics_code)).toEqual([111])
      expect(mockUseQWI).toHaveBeenCalledTimes(1)
      expect(mockUseQWI).toHaveBeenCalledWith('27', [111], WINDOW)
    })

    it('should ask for ten industries at a time', async () => {
      // Twenty-three industries: requests of ten, ten and three
      const codes = Array.from({ length: 23 }, (_, i) => 1000 + i)
      mockFetch.mockResolvedValue(industriesFile(codes.map((code) => [code, `I${code}`, 'Goods'])))

      await industryStore.useIndustryData('27', WINDOW)

      expect(mockUseQWI.mock.calls.map(([, asked]) => asked)).toEqual([
        codes.slice(0, 10),
        codes.slice(10, 20),
        codes.slice(20)
      ])
    })

    it('should give each industry only its own rows of an answer', async () => {
      mockFetch.mockResolvedValue(GRAIN_AND_CATTLE)
      mockFetchQWI.mockImplementation(async () => {
        mockQWIData.value = [qwiRow(111, 100, 'A'), qwiRow(112, 30, 'B'), qwiRow(111, 50, 'A')]
      })

      await industryStore.useIndustryData('27', WINDOW)

      expect(
        industryStore.employmentData.map(({ industry, category, meanEmp }) => ({
          industry,
          category,
          meanEmp
        }))
      ).toEqual([
        { industry: 111, category: 'Farm', meanEmp: { A: 75 } },
        { industry: 112, category: 'Farm', meanEmp: { B: 30 } }
      ])
    })

    it('should cache the data with the window it was built for', async () => {
      mockFetch.mockResolvedValue(GRAIN)
      mockFetchQWI.mockImplementation(async () => {
        mockQWIData.value = [qwiRow(111, 100)]
      })

      await industryStore.useIndustryData('27', WINDOW)

      expect(await cachedIndustry()).toEqual({
        dataWindow: { start: 2021, end: 2025 },
        industries: industryStore.industries,
        employmentData: industryStore.employmentData
      })
    })

    it("should not add a fetch onto an earlier fetch's data", async () => {
      mockFetch.mockResolvedValue(GRAIN)
      mockFetchQWI.mockImplementation(async () => {
        mockQWIData.value = [qwiRow(111, 100)]
      })

      await industryStore.useIndustryData('27', WINDOW)
      await industryStore.useIndustryData('27', { start: 2022, end: 2026, middle: 2024 })

      expect(industryStore.employmentData).toHaveLength(1)
    })
  })

  describe('useIndustryData loading states', () => {
    it('should set isLoadingCSV to true during CSV fetch', async () => {
      const loadingStates = []

      mockFetch.mockImplementation(async () => {
        loadingStates.push({ csv: industryStore.isLoadingCSV })
        return GRAIN
      })

      await industryStore.useIndustryData('27', WINDOW)

      expect(loadingStates[0].csv).toBe(true)
      expect(industryStore.isLoadingCSV).toBe(false)
    })

    it('should set isLoadingQWI to true during QWI fetch', async () => {
      const loadingStates = []

      mockFetch.mockResolvedValue(GRAIN)

      mockFetchQWI.mockImplementation(async () => {
        loadingStates.push({ qwi: industryStore.isLoadingQWI })
        mockQWIData.value = [qwiRow(111, 100)]
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

    it('should handle QWI fetch errors gracefully and go on to the next request', async () => {
      // Eleven industries: the first request's ten fail, the second's one comes back
      const codes = Array.from({ length: 11 }, (_, i) => 1000 + i)
      mockFetch.mockResolvedValue(industriesFile(codes.map((code) => [code, `I${code}`, 'Goods'])))

      let callCount = 0
      mockFetchQWI.mockImplementation(async () => {
        callCount++
        if (callCount === 1) {
          throw new Error('QWI API error')
        }
        mockQWIData.value = [qwiRow(1010, 100)]
      })

      // Should not throw
      await industryStore.useIndustryData('27', WINDOW)

      expect(industryStore.isLoadingQWI).toBe(false)
      expect(industryStore.employmentData.map((row) => row.industry)).toEqual([1010])
      expect(industryStore.failedIndustries).toEqual(codes.slice(0, 10))
    })

    it('should handle QWI composable errors', async () => {
      mockFetch.mockResolvedValue(GRAIN)

      mockFetchQWI.mockImplementation(async () => {
        mockQWIError.value = 'API rate limit exceeded'
      })

      await industryStore.useIndustryData('27', WINDOW)

      expect(industryStore.isLoadingQWI).toBe(false)
      expect(industryStore.employmentData).toEqual([])
    })
  })

  describe('useIndustryData when a request fails', () => {
    /** Eleven industries, two requests: ten, then one */
    const CODES = Array.from({ length: 11 }, (_, i) => 1000 + i)
    const FIRST_REQUEST = CODES.slice(0, 10)
    const LAST = CODES[10]

    // The first request fails, by its composable error; the second comes back
    beforeEach(() => {
      mockFetch.mockResolvedValue(industriesFile(CODES.map((code) => [code, `I${code}`, 'Goods'])))
      mockUseQWI.mockImplementation((state, asked) => {
        const error = { value: null }
        const data = { value: [] }
        const fetchQWI = async () => {
          if (asked.includes(1000)) error.value = 'HTTP error! status: 500'
          else data.value = asked.map((code) => qwiRow(code, 100))
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

    it('should record every industry of the request that failed', async () => {
      await industryStore.useIndustryData('27', WINDOW)

      expect(industryStore.failedIndustries).toEqual(FIRST_REQUEST)
      expect(industryStore.employmentData.map((row) => row.industry)).toEqual([LAST])
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

      expect(industryStore.failedIndustries).toEqual(CODES)
    })

    it('should not cache a fetch with an industry missing', async () => {
      await industryStore.useIndustryData('27', WINDOW)

      expect(await cachedIndustry()).toBeUndefined()
    })

    it('should forget the failures once a later fetch comes from the cache', async () => {
      await industryStore.useIndustryData('27', WINDOW)
      await cacheFrom({ start: 2021, end: 2025 })

      await industryStore.useIndustryData('27', WINDOW)

      expect(industryStore.failedIndustries).toEqual([])
    })

    it('should not count the industries of a request the API turned down, and still cache the fetch', async () => {
      mockUseQWI.mockImplementation((state, asked) => {
        const isRefused = asked.includes(1000)
        return {
          data: { value: isRefused ? [] : asked.map((code) => qwiRow(code, 100)) },
          error: { value: isRefused ? 'HTTP error! status: 400' : null },
          refused: { value: isRefused },
          fetchQWI: async () => {}
        }
      })

      await industryStore.useIndustryData('27', WINDOW)

      expect(industryStore.failedIndustries).toEqual([])
      expect((await cachedIndustry()).dataWindow).toEqual({ start: 2021, end: 2025 })
    })

    it('should ask again an industry at a time when the API turns a request down', async () => {
      // The API will not take 1003; asked with it, the whole request is refused
      mockUseQWI.mockImplementation((state, asked) => {
        const isRefused = asked.includes(1003)
        return {
          data: { value: isRefused ? [] : asked.map((code) => qwiRow(code, 100)) },
          error: { value: isRefused ? 'HTTP error! status: 400' : null },
          refused: { value: isRefused },
          fetchQWI: async () => {}
        }
      })

      await industryStore.useIndustryData('27', WINDOW)

      // Every industry but the one turned down, and nothing counted as failed
      expect(industryStore.employmentData.map((row) => row.industry)).toEqual(
        CODES.filter((code) => code !== 1003)
      )
      expect(industryStore.failedIndustries).toEqual([])
      expect(mockUseQWI).toHaveBeenCalledWith('27', [1003], WINDOW)
    })

    it('should not count an industry with no jobs as failed', async () => {
      mockUseQWI.mockImplementation((state, asked) => ({
        data: { value: asked.map((code) => qwiRow(code, 0)) },
        error: { value: null },
        fetchQWI: async () => {}
      }))

      await industryStore.useIndustryData('27', WINDOW)

      expect(industryStore.failedIndustries).toEqual([])
    })
  })

  describe('useIndustryData data processing', () => {
    it('should skip industries with all zero employment data', async () => {
      mockFetch.mockResolvedValue(GRAIN_AND_CATTLE)

      mockFetchQWI.mockImplementation(async () => {
        mockQWIData.value = [qwiRow(111, 0, '12345'), qwiRow(111, null, '12346'), qwiRow(112, 100)]
      })

      await industryStore.useIndustryData('27', WINDOW)

      // Only the second industry should be in employmentData
      expect(industryStore.employmentData.length).toBe(1)
      expect(industryStore.employmentData[0].industry).toBe(112)
    })

    it('should calculate average employment correctly', async () => {
      mockFetch.mockResolvedValue(GRAIN)

      mockFetchQWI.mockImplementation(async () => {
        mockQWIData.value = [
          qwiRow(111, 100, '12345'),
          qwiRow(111, 200, '12345'),
          qwiRow(111, 300, '12346')
        ]
      })

      await industryStore.useIndustryData('27', WINDOW)

      expect(industryStore.employmentData[0].meanEmp['12345']).toBe(150) // (100+200)/2
      expect(industryStore.employmentData[0].meanEmp['12346']).toBe(300) // 300/1
    })
  })

  describe('combineStates', () => {
    it("should add an area's employment from each state", () => {
      industryStore.combineStates([
        [
          { industry: 111, category: 'Farm', meanEmp: { A: 100, B: 50 } },
          { industry: 211, category: 'Mining', meanEmp: { A: 50 } }
        ],
        [{ industry: 111, category: 'Farm', meanEmp: { A: 20, C: 30 } }]
      ])

      const farming = industryStore.employmentData.find((e) => e.industry === 111)
      expect(farming.meanEmp).toEqual({ A: 120, B: 50, C: 30 })
      expect(farming.category).toBe('Farm')
      expect(industryStore.employmentData.find((e) => e.industry === 211).meanEmp).toEqual({
        A: 50
      })
    })
  })
})
