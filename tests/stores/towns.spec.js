/**
 * Towns Store Tests
 *
 * Tests for the towns store including:
 * - Initial state
 * - Loading state transitions
 * - Error handling
 * - Cache usage, and the data window it was built for
 * - Town classification
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Create hoisted mocks
const mockFetchPopulationData = vi.hoisted(() => vi.fn())
const mockPopulationData = vi.hoisted(() => ({ value: [] }))
const mockGetMSALatLon = vi.hoisted(() => vi.fn())
const mockUseCensus = vi.hoisted(() => vi.fn())
const mockFetchDataWindow = vi.hoisted(() => vi.fn())

vi.mock('@/composables/setup/useCensus', () => ({
  default: (...args) => {
    mockUseCensus(...args)
    return {
      populationData: mockPopulationData,
      fetchPopulationData: mockFetchPopulationData
    }
  }
}))

vi.mock('@/composables/setup/dataWindow', () => ({
  fetchDataWindow: mockFetchDataWindow
}))

vi.mock('@/composables/setup/useTigerWeb', () => ({
  default: mockGetMSALatLon
}))

import { useTownsStore } from '@/stores/towns'
import { useIndustryStore } from '@/stores/industry'
import { RequestError } from '@/composables/utils'
import { readCache, writeCache } from '@/composables/database'

/** The state's data window: QWI from 2021 to 2025 */
const WINDOW = { start: 2021, end: 2025, middle: 2023 }

/** The window a year earlier, before the latest year of QWI came out */
const EARLIER_WINDOW = { start: 2020, end: 2024, middle: 2022 }

/** A town as the cache holds it */
const CACHED_TOWN = { msa: '12345', name: 'Minneapolis', population: 400000, size: 'large' }

/** The towns an earlier game kept for state 27, for an earlier window */
const EARLIER_CACHE = { dataWindow: EARLIER_WINDOW, towns: [CACHED_TOWN] }

/** What the database keeps for state 27's towns */
const cachedTowns = () => readCache('towns_27')

describe('Towns Store', () => {
  let townsStore
  let industryStore

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset mock data
    mockPopulationData.value = []
    // Default mock implementations
    mockFetchPopulationData.mockResolvedValue(undefined)
    mockGetMSALatLon.mockResolvedValue({
      centroidLongitude: '-93.2650',
      centroidLatitude: '44.9778'
    })
    mockFetchDataWindow.mockResolvedValue(WINDOW)

    industryStore = useIndustryStore()
    // The industry fetch is the industry store's to test. Stubbed here, the
    // industry data a test seeds is what town setup works from.
    industryStore.useIndustryData = vi.fn(async () => {})
    townsStore = useTownsStore()
  })

  describe('Initial State', () => {
    it('should start with empty towns array', () => {
      expect(townsStore.towns).toEqual([])
    })

    it('should start with isLoadingIndustry as false', () => {
      expect(townsStore.isLoadingIndustry).toBe(false)
    })

    it('should start with isLoadingPopulation as false', () => {
      expect(townsStore.isLoadingPopulation).toBe(false)
    })

    it('should start with isLoadingCoordinates as false', () => {
      expect(townsStore.isLoadingCoordinates).toBe(false)
    })
  })

  /** Sets the stubbed lookups up to build one town, Duluth */
  function oneTownToBuild() {
    industryStore.MSAs.push('20260')
    mockPopulationData.value = [
      { msa_code: '20260', name: 'Duluth, MN-WI', population: '280000', state_code: '27' }
    ]
  }

  describe('setupTowns with cached data', () => {
    it('should use cached towns built for the same data window', async () => {
      await writeCache('towns_27', { dataWindow: WINDOW, towns: [CACHED_TOWN] })

      await townsStore.setupTowns('27')

      expect(townsStore.towns).toEqual([CACHED_TOWN])
      expect(townsStore.dataWindow).toEqual(WINDOW)
      expect(mockFetchPopulationData).not.toHaveBeenCalled()
      expect(mockGetMSALatLon).not.toHaveBeenCalled()
    })

    it('should build the towns again once the data window has moved on', async () => {
      await writeCache('towns_27', EARLIER_CACHE)
      oneTownToBuild()

      await townsStore.setupTowns('27')

      expect(industryStore.useIndustryData).toHaveBeenCalledWith('27', WINDOW)
      expect(townsStore.towns.map((town) => town.msa)).toEqual(['20260'])
      expect(townsStore.dataWindow).toEqual(WINDOW)
    })

    it('should cache new towns with the window they were built for', async () => {
      oneTownToBuild()

      await townsStore.setupTowns('27')

      expect(await cachedTowns()).toEqual({ dataWindow: WINDOW, towns: townsStore.towns })
    })

    it('should keep playing the cached towns when the new ones come out empty', async () => {
      // The window has moved on, but every lookup for the new towns failed
      await writeCache('towns_27', EARLIER_CACHE)

      await townsStore.setupTowns('27')

      expect(townsStore.towns).toEqual([CACHED_TOWN])
      expect(townsStore.dataWindow).toEqual(EARLIER_WINDOW)
      expect(townsStore.error).toBeNull()
      expect(await cachedTowns()).toEqual(EARLIER_CACHE)
    })

    it('should keep playing the cached towns when the population fetch fails', async () => {
      await writeCache('towns_27', EARLIER_CACHE)
      oneTownToBuild()
      mockFetchPopulationData.mockRejectedValue(new Error('Census API error'))

      await townsStore.setupTowns('27')

      expect(townsStore.towns).toEqual([CACHED_TOWN])
      expect(townsStore.error).toBeNull()
    })

    it('should report an error when no towns can be built and none are cached', async () => {
      await townsStore.setupTowns('27')

      expect(townsStore.towns).toEqual([])
      expect(townsStore.error).toMatch(/towns/)
      expect(await cachedTowns()).toBeUndefined()
    })

    it("should fetch population for the data window's years", async () => {
      await townsStore.setupTowns('27')

      expect(mockUseCensus).toHaveBeenCalledWith('27', WINDOW)
    })
  })

  describe('setupTowns when the data window cannot be looked up', () => {
    beforeEach(() => {
      mockFetchDataWindow.mockRejectedValue(new Error('QWI year lookup failed: 500'))
    })

    it('should play with the cached towns, whatever window they were built for', async () => {
      await writeCache('towns_27', EARLIER_CACHE)

      await townsStore.setupTowns('27')

      expect(townsStore.towns).toEqual([CACHED_TOWN])
      expect(townsStore.dataWindow).toEqual(EARLIER_WINDOW)
      expect(townsStore.error).toBeNull()
      expect(mockFetchPopulationData).not.toHaveBeenCalled()
    })

    it('should report an error when nothing is cached', async () => {
      await townsStore.setupTowns('27')

      expect(townsStore.error).toMatch(/Census Bureau/)
      expect(townsStore.towns).toEqual([])
      expect(industryStore.useIndustryData).not.toHaveBeenCalled()
      expect(mockFetchPopulationData).not.toHaveBeenCalled()
    })

    it('should clear the error when setup is tried again and works', async () => {
      await townsStore.setupTowns('27')
      mockFetchDataWindow.mockResolvedValue(WINDOW)
      oneTownToBuild()

      await townsStore.setupTowns('27')

      expect(townsStore.error).toBeNull()
      expect(townsStore.dataWindow).toEqual(WINDOW)
    })
  })

  describe('setupTowns loading states', () => {
    it('should set isLoadingIndustry to true during industry fetch', async () => {
      const loadingStates = []

      // Mock industry store's useIndustryData
      const originalFn = industryStore.useIndustryData
      industryStore.useIndustryData = vi.fn(async () => {
        loadingStates.push({ industry: townsStore.isLoadingIndustry })
      })

      await townsStore.setupTowns('27')

      expect(loadingStates[0].industry).toBe(true)
      expect(townsStore.isLoadingIndustry).toBe(false)

      industryStore.useIndustryData = originalFn
    })

    it('should set isLoadingPopulation to true during population fetch', async () => {
      const loadingStates = []

      mockFetchPopulationData.mockImplementation(async () => {
        loadingStates.push({ population: townsStore.isLoadingPopulation })
      })

      await townsStore.setupTowns('27')

      expect(loadingStates[0].population).toBe(true)
      expect(townsStore.isLoadingPopulation).toBe(false)
    })

    it('should set isLoadingCoordinates to true during coordinate fetch', async () => {
      // Setup MSAs in industry store
      industryStore.MSAs.push('12345')

      mockPopulationData.value = [
        { msa_code: '12345', name: 'Minneapolis, MN', population: '400000', state_code: '27' }
      ]

      const loadingStates = []
      mockGetMSALatLon.mockImplementation(async () => {
        loadingStates.push({ coordinates: townsStore.isLoadingCoordinates })
        return { centroidLongitude: '-93.0', centroidLatitude: '44.9' }
      })

      await townsStore.setupTowns('27')

      expect(loadingStates[0].coordinates).toBe(true)
      expect(townsStore.isLoadingCoordinates).toBe(false)
    })
  })

  describe('setupTowns error handling', () => {
    it('should handle industry fetch errors gracefully', async () => {
      const originalFn = industryStore.useIndustryData
      industryStore.useIndustryData = vi.fn(async () => {
        throw new Error('Industry API error')
      })

      // Should not throw
      await townsStore.setupTowns('27')

      expect(townsStore.isLoadingIndustry).toBe(false)
      expect(townsStore.towns).toEqual([])

      industryStore.useIndustryData = originalFn
    })

    it('should handle population fetch errors gracefully', async () => {
      mockFetchPopulationData.mockRejectedValue(new Error('Census API error'))

      // Should not throw
      await townsStore.setupTowns('27')

      expect(townsStore.isLoadingPopulation).toBe(false)
      expect(townsStore.towns).toEqual([])
    })

    it('should handle coordinate fetch errors and continue to next MSA', async () => {
      // Setup MSAs
      industryStore.MSAs.push('12345', '12346')

      mockPopulationData.value = [
        { msa_code: '12345', name: 'Minneapolis, MN', population: '400000', state_code: '27' },
        { msa_code: '12346', name: 'St. Paul, MN', population: '300000', state_code: '27' }
      ]

      let callCount = 0
      mockGetMSALatLon.mockImplementation(async () => {
        callCount++
        if (callCount === 1) {
          throw new Error('TigerWeb API error')
        }
        return { centroidLongitude: '-93.0', centroidLatitude: '44.9' }
      })

      await townsStore.setupTowns('27')

      expect(townsStore.isLoadingCoordinates).toBe(false)
      // Should have one town (the second one that didn't error)
      expect(townsStore.towns.length).toBe(1)
      expect(townsStore.towns[0].msa).toBe('12346')
    })
  })

  describe('setupTowns when some lookups fail', () => {
    // Two towns to build: Duluth and Rochester
    beforeEach(() => {
      industryStore.MSAs.push('20260', '40340')
      mockPopulationData.value = [
        { msa_code: '20260', name: 'Duluth, MN-WI', population: '280000', state_code: '27' },
        { msa_code: '40340', name: 'Rochester, MN', population: '220000', state_code: '27' }
      ]
    })

    /** Coordinates for Rochester; Duluth's lookup does what `duluth` does */
    function lookUpDuluth(duluth) {
      mockGetMSALatLon.mockImplementation(async (msaCode) =>
        msaCode === '20260' ? duluth() : { centroidLongitude: '-92.5', centroidLatitude: '44.0' }
      )
    }

    it('should play without a town whose lookup failed, and not cache the towns', async () => {
      await writeCache('towns_27', EARLIER_CACHE)
      lookUpDuluth(() => {
        throw new Error('TIGERweb lookup failed: 500')
      })

      await townsStore.setupTowns('27')

      expect(townsStore.towns.map((town) => town.msa)).toEqual(['40340'])
      expect(townsStore.dataWindow).toEqual(WINDOW)
      expect(townsStore.error).toBeNull()
      // The cache keeps the last complete build
      expect(await cachedTowns()).toEqual(EARLIER_CACHE)
    })

    it('should leave out a town TIGERweb does not have, and still cache the towns', async () => {
      // A lookup that finds nothing once made a town with no coordinates
      lookUpDuluth(() => false)

      await townsStore.setupTowns('27')

      expect(townsStore.towns.map((town) => town.msa)).toEqual(['40340'])
      expect(townsStore.towns.every((town) => Number.isFinite(town.lon))).toBe(true)
      expect((await cachedTowns()).towns).toHaveLength(1)
    })

    it('should leave out a town whose lookup was turned down, and still cache the towns', async () => {
      // It would be turned down again next game
      lookUpDuluth(() => {
        throw new RequestError('TIGERweb query failed: 400 Failed to execute query.', 400)
      })

      await townsStore.setupTowns('27')

      expect(townsStore.towns.map((town) => town.msa)).toEqual(['40340'])
      expect((await cachedTowns()).towns).toHaveLength(1)
    })

    it('should play without an industry whose fetch failed, and not cache the towns', async () => {
      industryStore.useIndustryData = vi.fn(async () => {
        industryStore.failedIndustries = [111]
      })

      await townsStore.setupTowns('27')

      expect(townsStore.towns).toHaveLength(2)
      expect(await cachedTowns()).toBeUndefined()
    })
  })

  describe('setupTowns error messages', () => {
    it('should tell the player to check their connection when Census cannot be reached', async () => {
      mockFetchDataWindow.mockRejectedValue(new Error('Network error'))

      await townsStore.setupTowns('27')

      expect(townsStore.error).toMatch(/jobs data/)
      expect(townsStore.error).toMatch(/Check your connection/)
    })

    it('should not blame the connection when Census turns the request down', async () => {
      mockFetchDataWindow.mockRejectedValue(new RequestError('QWI year lookup failed: 400', 400))

      await townsStore.setupTowns('27')

      expect(townsStore.error).toMatch(/turned down/)
      expect(townsStore.error).toMatch(/error 400/)
      expect(townsStore.error).not.toMatch(/connection/)
    })

    it('should say so when the population request is turned down', async () => {
      oneTownToBuild()
      mockFetchPopulationData.mockRejectedValue(
        new RequestError('ACS population request failed: 400', 400)
      )

      await townsStore.setupTowns('27')

      expect(townsStore.error).toMatch(/population/)
      expect(townsStore.error).toMatch(/turned down/)
    })

    it('should tell the player to check their connection when the population fetch fails', async () => {
      oneTownToBuild()
      mockFetchPopulationData.mockRejectedValue(new Error('Network error'))

      await townsStore.setupTowns('27')

      expect(townsStore.error).toMatch(/population/)
      expect(townsStore.error).toMatch(/Check your connection/)
    })
  })

  describe('setupTowns data processing', () => {
    beforeEach(() => {
      // Setup industry store with test data
      industryStore.MSAs.push('12345', '12346', '12347')
      industryStore.employmentData.push({
        industry: 111,
        meanEmp: { 12345: 1000, 12346: 500, 12347: 100 },
        proportion: 0.15
      })
      industryStore.industries.push({ naics_code: 111, label: 'Agriculture' })

      mockPopulationData.value = [
        {
          msa_code: '12345',
          name: 'Minneapolis-St. Paul, MN',
          population: '3000000',
          state_code: '27'
        },
        { msa_code: '12346', name: 'Rochester, MN', population: '200000', state_code: '27' },
        { msa_code: '12347', name: 'Duluth, MN', population: '50000', state_code: '27' }
      ]

      mockGetMSALatLon.mockResolvedValue({
        centroidLongitude: '-93.0',
        centroidLatitude: '44.9'
      })
    })

    it('should skip MSAs without population data', async () => {
      industryStore.MSAs.push('99999') // MSA without population data

      await townsStore.setupTowns('27')

      const msaCodes = townsStore.towns.map((t) => t.msa)
      expect(msaCodes).not.toContain('99999')
    })

    it('should parse full name correctly from MSA name', async () => {
      await townsStore.setupTowns('27')

      const minneapolis = townsStore.towns.find((t) => t.msa === '12345')
      expect(minneapolis.fullName).toBe('Minneapolis-St. Paul')
    })

    it('should parse short name correctly from MSA name', async () => {
      await townsStore.setupTowns('27')

      const minneapolis = townsStore.towns.find((t) => t.msa === '12345')
      expect(minneapolis.name).toBe('Minneapolis')
    })

    it('should classify towns by population size using natural breaks', async () => {
      await townsStore.setupTowns('27')

      // All towns should have a size property
      townsStore.towns.forEach((town) => {
        expect(['small', 'medium', 'large']).toContain(town.size)
      })
    })

    it('should assign largest town as large', async () => {
      await townsStore.setupTowns('27')

      // Minneapolis with 3M population should be classified as large
      const minneapolis = townsStore.towns.find((t) => t.msa === '12345')
      expect(minneapolis.size).toBe('large')
    })

    it('should assign Tourism to large towns', async () => {
      await townsStore.setupTowns('27')

      const largeTowns = townsStore.towns.filter((t) => t.size === 'large')
      expect(largeTowns.length).toBeGreaterThan(0)

      largeTowns.forEach((town) => {
        const hasTourism = town.industries.some((i) => i.name === 'Tourism')
        expect(hasTourism).toBe(true)
      })
    })

    it('should initialize towns with empty industries array', async () => {
      // Remove industry data to test base initialization
      industryStore.employmentData.length = 0
      industryStore.industries.length = 0

      await townsStore.setupTowns('27')

      // All towns should have an industries array (may have Tourism for large towns)
      townsStore.towns.forEach((town) => {
        expect(Array.isArray(town.industries)).toBe(true)
      })
    })

    it('should parse coordinates correctly', async () => {
      mockGetMSALatLon.mockResolvedValue({
        centroidLongitude: '-93.2650',
        centroidLatitude: '44.9778'
      })

      await townsStore.setupTowns('27')

      const town = townsStore.towns[0]
      expect(town.lon).toBe(-93.265)
      expect(town.lat).toBe(44.9778)
    })
  })
})
