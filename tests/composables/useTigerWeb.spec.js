/**
 * useTigerWeb Composable Tests
 *
 * Tests for TigerWeb API integration: where a town goes, at its area's main
 * city (found from the area's name), or else the middle of the area.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockFetch = vi.hoisted(() => vi.fn())
vi.stubGlobal('fetch', mockFetch)

// Retries without the pause between them, both the request's own and the
// lookup's retries of the failures the server reports in its answer
vi.mock('@/composables/utils', async (importOriginal) => {
  const utils = await importOriginal()
  return {
    ...utils,
    fetchWithRetries: (url, options) => utils.fetchWithRetries(url, { ...options, pauseMs: 0 }),
    wait: async () => {}
  }
})

import getMSALatLon, {
  parseCbsaName,
  cityCandidates,
  pickPlace,
  findPrincipalCity
} from '@/composables/setup/useTigerWeb'
import { isRefusal } from '@/composables/utils'

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

    // A lookup that fails is not a town that doesn't exist: the towns store
    // must be able to tell them apart

    it('should throw when the connection fails', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      await expect(getMSALatLon('33460')).rejects.toThrow('Network error')
    })

    it('should throw when the server fails three times running', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      })

      await expect(getMSALatLon('33460')).rejects.toThrow('500')
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    it('should try again when the server fails, and use the answer that works', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 }).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          features: [{ attributes: { INTPTLON: '-93.0', INTPTLAT: '44.0' } }]
        })
      })

      const result = await getMSALatLon('33460')

      expect(result).toEqual({ centroidLongitude: '-93.0', centroidLatitude: '44.0' })
    })

    // How ArcGIS answers a query it could not run: a success, with an error
    // carrying the status it would have sent
    const arcgisError = (code) => ({
      ok: true,
      status: 200,
      json: async () => ({ error: { code, message: 'Failed to execute query.' } })
    })
    const duluth = {
      ok: true,
      status: 200,
      json: async () => ({ features: [{ attributes: { INTPTLON: '-92.1', INTPTLAT: '46.8' } }] })
    }

    it('should throw a refusal, without asking again, when the server turns the query down', async () => {
      mockFetch.mockResolvedValue(arcgisError(400))

      const failure = await getMSALatLon('33460').catch((error) => error)

      expect(failure.message).toContain('Failed to execute query')
      expect(isRefusal(failure)).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('should try again when the server reports failing, and use the answer that works', async () => {
      mockFetch.mockResolvedValueOnce(arcgisError(500)).mockResolvedValueOnce(duluth)

      const result = await getMSALatLon('20260')

      expect(result).toEqual({ centroidLongitude: '-92.1', centroidLatitude: '46.8' })
    })

    it('should throw when the server reports failing three times running', async () => {
      mockFetch.mockResolvedValue(arcgisError(500))

      const failure = await getMSALatLon('20260').catch((error) => error)

      expect(failure.message).toContain('500')
      expect(isRefusal(failure)).toBe(false)
      expect(mockFetch).toHaveBeenCalledTimes(3)
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
      expect(url).toContain('/MapServer/3/query?')
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

      await getMSALatLon('33460') // Minneapolis
      await getMSALatLon('34820') // St. Cloud

      expect(mockFetch).toHaveBeenCalledTimes(2)
      const calls = mockFetch.mock.calls
      expect(calls[0][0]).toContain('33460')
      expect(calls[1][0]).toContain('34820')
    })
  })
})

describe('parseCbsaName', () => {
  it("should read the cities and states from an area's name", () => {
    expect(
      parseCbsaName('Boston-Cambridge-Newton, MA-NH Metro Area (part); Massachusetts')
    ).toEqual({ cities: ['Boston', 'Cambridge', 'Newton'], states: ['MA', 'NH'] })
  })

  it('should read an area with one city in one state', () => {
    expect(parseCbsaName('Pittsfield, MA Metro Area')).toEqual({
      cities: ['Pittsfield'],
      states: ['MA']
    })
  })
})

describe('cityCandidates', () => {
  it('should try a city with a hyphen in its own name', () => {
    expect(cityCandidates(['Winston', 'Salem'])).toEqual(['Winston', 'Winston-Salem'])
  })

  it('should try the part of a city joined to its county before the slash', () => {
    expect(cityCandidates(['Louisville/Jefferson County'])).toEqual([
      'Louisville',
      'Louisville/Jefferson County'
    ])
  })

  it('should try at most the first three pieces', () => {
    expect(cityCandidates(['A', 'B', 'C', 'D'])).toEqual(['A', 'A-B', 'A-B-C'])
  })
})

describe('pickPlace', () => {
  it('should prefer the place named exactly as the longest candidate', () => {
    const places = [{ BASENAME: 'Winston' }, { BASENAME: 'Winston-Salem' }]
    expect(pickPlace(places, ['Winston', 'Winston-Salem'])).toEqual({ BASENAME: 'Winston-Salem' })
  })

  it("should take a place whose name only starts with the city's when none is exact", () => {
    const nashville = { BASENAME: 'Nashville-Davidson metropolitan government (balance)' }
    expect(pickPlace([nashville], ['Nashville', 'Nashville-Davidson'])).toBe(nashville)
  })

  it('should find nothing among no places', () => {
    expect(pickPlace([], ['Boston'])).toBeNull()
  })
})

describe('findPrincipalCity', () => {
  /** An answer from the places service with these places */
  const answer = (places) => ({
    ok: true,
    json: async () => ({ features: places.map((attributes) => ({ attributes })) })
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should find the main city in its state, at the city's point", async () => {
    mockFetch
      .mockResolvedValueOnce(
        answer([
          { BASENAME: 'Boston', STATE: '25', INTPTLON: '-071.0135134', INTPTLAT: '+42.3327346' }
        ])
      )
      .mockResolvedValue(answer([]))

    const city = await findPrincipalCity('Boston-Cambridge-Newton, MA-NH Metro Area')

    expect(city).toEqual({ lon: -71.0135134, lat: 42.3327346, name: 'Boston', stateFips: '25' })
    const where = new URL(mockFetch.mock.calls[0][0]).searchParams.get('where')
    expect(where).toContain("STATE IN ('25','33')")
  })

  it('should take the city in the state named first, when more than one has it', async () => {
    mockFetch.mockResolvedValueOnce(
      answer([
        { BASENAME: 'Texarkana', STATE: '05', INTPTLON: '-94.0', INTPTLAT: '33.4' },
        { BASENAME: 'Texarkana', STATE: '48', INTPTLON: '-94.1', INTPTLAT: '33.4' }
      ])
    )
    mockFetch.mockResolvedValue(answer([]))

    const city = await findPrincipalCity('Texarkana, TX-AR Metro Area')

    expect(city.stateFips).toBe('48')
  })

  it('should take an exactly named census designated place over a place only starting with its name', async () => {
    // Incorporated places first: only one whose name starts the same way
    mockFetch
      .mockResolvedValueOnce(
        answer([{ BASENAME: 'Urban Honolulu Heights', STATE: '15', INTPTLON: '-1', INTPTLAT: '1' }])
      )
      .mockResolvedValueOnce(
        answer([{ BASENAME: 'Urban Honolulu', STATE: '15', INTPTLON: '-157.8', INTPTLAT: '21.3' }])
      )

    const city = await findPrincipalCity('Urban Honolulu, HI Metro Area')

    expect(city).toMatchObject({ name: 'Urban Honolulu', lon: -157.8 })
  })

  it('should ask each kind of place once, for every named state together', async () => {
    mockFetch.mockResolvedValue(answer([]))

    await findPrincipalCity('Philadelphia-Camden-Wilmington, PA-NJ-DE-MD Metro Area')

    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('should find nothing when no state has the city', async () => {
    mockFetch.mockResolvedValue(answer([]))

    expect(await findPrincipalCity('Nowhere, MA Micro Area')).toBeNull()
  })

  it('should quote a name with an apostrophe the way the query needs', async () => {
    mockFetch.mockResolvedValue(answer([]))

    await findPrincipalCity("Coeur d'Alene, ID Metro Area")

    expect(decodeURIComponent(mockFetch.mock.calls[0][0].replaceAll('+', ' '))).toContain(
      "'Coeur d''Alene'"
    )
  })
})
