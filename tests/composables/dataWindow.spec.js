/**
 * Data Window Tests
 *
 * The years a game's data comes from: the state's latest full year of QWI,
 * and the five-year window ending there.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const mockFetch = vi.hoisted(() => vi.fn())
vi.stubGlobal('fetch', mockFetch)

vi.stubEnv('VITE_QWI_KEY', 'test-api-key')

// The pause between attempts, skipped
vi.mock('@/composables/utils', async (importOriginal) => ({
  ...(await importOriginal()),
  wait: vi.fn(async () => {})
}))

import { dataWindow, latestFullYear, fetchDataWindow } from '@/composables/setup/dataWindow'

/** QWI rows, one per quarter given ("2024-Q1", ...) */
function quarters(...times) {
  return times.map((time) => ({ time }))
}

/** All four quarters of each year given */
function fullYears(...years) {
  return years.flatMap((year) => [1, 2, 3, 4].map((q) => `${year}-Q${q}`))
}

/** A statewide QWI answer, as the API sends it, for the quarters given */
function qwiAnswer(times) {
  return {
    ok: true,
    status: 200,
    json: async () => [['Emp', 'time', 'state'], ...times.map((time) => ['1000', time, '25'])]
  }
}

/** The API failing for reasons of its own */
const serverError = { ok: false, status: 500, json: async () => ({}) }

describe('dataWindow', () => {
  it('should span the five years up to and including the end year', () => {
    expect(dataWindow(2025)).toEqual({ start: 2021, end: 2025, middle: 2023 })
  })
})

describe('latestFullYear', () => {
  it('should be the newest year with all four quarters', () => {
    expect(latestFullYear(quarters(...fullYears(2023, 2024, 2025)))).toBe(2025)
  })

  it('should pass over a year that has only some of its quarters out', () => {
    const rows = quarters(...fullYears(2024, 2025), '2026-Q1', '2026-Q2')
    expect(latestFullYear(rows)).toBe(2025)
  })

  it('should not count a quarter twice toward a full year', () => {
    const rows = quarters(...fullYears(2024), '2025-Q1', '2025-Q1', '2025-Q2', '2025-Q3')
    expect(latestFullYear(rows)).toBe(2024)
  })

  it('should be null when no year is complete', () => {
    expect(latestFullYear(quarters('2025-Q1', '2025-Q2'))).toBeNull()
    expect(latestFullYear([])).toBeNull()
  })
})

describe('fetchDataWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-28T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("should end the window at the state's latest full year", async () => {
    mockFetch.mockResolvedValue(qwiAnswer([...fullYears(2023, 2024, 2025), '2026-Q1']))

    await expect(fetchDataWindow('25')).resolves.toEqual({ start: 2021, end: 2025, middle: 2023 })
  })

  it("should ask for the state's total employment over the last few years", async () => {
    mockFetch.mockResolvedValue(qwiAnswer(fullYears(2025)))

    await fetchDataWindow('25')

    const url = mockFetch.mock.calls[0][0]
    expect(url).toContain('https://api.census.gov/data/timeseries/qwi/sa?')
    expect(url).toContain('for=state:25')
    expect(url).toContain('time=from%202020%20to%202026')
    expect(url).toContain('key=test-api-key')
  })

  it('should try again when the API fails, and use the answer that works', async () => {
    mockFetch.mockResolvedValueOnce(serverError).mockResolvedValueOnce(qwiAnswer(fullYears(2025)))

    await expect(fetchDataWindow('25')).resolves.toEqual({ start: 2021, end: 2025, middle: 2023 })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('should try again when the connection fails', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(qwiAnswer(fullYears(2025)))

    await expect(fetchDataWindow('25')).resolves.toEqual({ start: 2021, end: 2025, middle: 2023 })
  })

  it('should fail when the API fails three times running', async () => {
    mockFetch.mockResolvedValue(serverError)

    await expect(fetchDataWindow('25')).rejects.toThrow('500')
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it('should fail when the connection fails three times running', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))

    await expect(fetchDataWindow('25')).rejects.toThrow('Network error')
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it('should not ask again when the API turns the request down', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 400, json: async () => ({}) })

    await expect(fetchDataWindow('25')).rejects.toThrow('400')
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('should fail when no year of the state is complete', async () => {
    mockFetch.mockResolvedValue(qwiAnswer(['2026-Q1']))

    await expect(fetchDataWindow('25')).rejects.toThrow('No full year')
  })

  it('should fail when the state has no QWI at all', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 204 })

    await expect(fetchDataWindow('25')).rejects.toThrow('No full year')
  })
})
