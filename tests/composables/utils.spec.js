/**
 * utils Tests
 *
 * Tests for the shared helpers, focused on mapWithConcurrency since the grid
 * setup relies on it to stay inside the upstream APIs' tolerance.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  fetchWithTimeout,
  mapWithConcurrency,
  wait
} from '@/composables/utils'

describe('mapWithConcurrency', () => {
  it('should return results in input order regardless of completion order', async () => {
    // Later items resolve first, so anything relying on completion order breaks.
    const worker = async (item) => {
      await wait(item.delay)
      return item.value
    }

    const items = [
      { value: 'a', delay: 30 },
      { value: 'b', delay: 20 },
      { value: 'c', delay: 10 },
      { value: 'd', delay: 0 }
    ]

    const results = await mapWithConcurrency(items, worker, { concurrency: 4 })

    expect(results).toEqual(['a', 'b', 'c', 'd'])
  })

  it('should pass the index to the worker', async () => {
    const worker = vi.fn(async (item, index) => index)

    const results = await mapWithConcurrency(['a', 'b', 'c'], worker, { concurrency: 1 })

    expect(results).toEqual([0, 1, 2])
  })

  it('should never exceed the concurrency limit', async () => {
    let inFlight = 0
    let peak = 0

    const worker = async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await wait(5)
      inFlight--
    }

    await mapWithConcurrency(Array(12).fill('x'), worker, { concurrency: 3 })

    expect(peak).toBe(3)
  })

  it('should process every item even when there are more items than workers', async () => {
    const worker = vi.fn(async (item) => item * 2)

    const results = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], worker, { concurrency: 2 })

    expect(worker).toHaveBeenCalledTimes(7)
    expect(results).toEqual([2, 4, 6, 8, 10, 12, 14])
  })

  it('should report progress once per item, ending at the total', async () => {
    const onProgress = vi.fn()

    await mapWithConcurrency([1, 2, 3, 4], async (n) => n, { concurrency: 2, onProgress })

    expect(onProgress).toHaveBeenCalledTimes(4)

    // Completion order varies, but the count must climb by one and finish at 4
    const completedCounts = onProgress.mock.calls.map((call) => call[0])
    expect(completedCounts).toEqual([1, 2, 3, 4])
    expect(onProgress.mock.calls.every((call) => call[1] === 4)).toBe(true)
  })

  it('should space request starts by at least minIntervalMs', async () => {
    const startTimes = []

    const worker = async () => {
      startTimes.push(Date.now())
    }

    await mapWithConcurrency(Array(4).fill('x'), worker, {
      concurrency: 4,
      minIntervalMs: 25
    })

    expect(startTimes).toHaveLength(4)

    // Pacing is shared across the pool, so even with 4 workers free the starts
    // are staggered rather than firing as one burst.
    const elapsed = startTimes[startTimes.length - 1] - startTimes[0]
    expect(elapsed).toBeGreaterThanOrEqual(60)
  })

  it('should handle an empty item list without calling the worker', async () => {
    const worker = vi.fn()

    const results = await mapWithConcurrency([], worker, { concurrency: 4 })

    expect(results).toEqual([])
    expect(worker).not.toHaveBeenCalled()
  })

  it('should not start more workers than there are items', async () => {
    let peak = 0
    let inFlight = 0

    const worker = async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await wait(5)
      inFlight--
    }

    await mapWithConcurrency(['only'], worker, { concurrency: 10 })

    expect(peak).toBe(1)
  })
})

describe('fetchWithTimeout', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('should carry the response through when the request answers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ cost: 5 }) })
    )

    const response = await fetchWithTimeout('https://example.test')

    expect(response.ok).toBe(true)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ cost: 5 })
  })

  it('should settle rather than hang when the request never does', async () => {
    // The #85 stall: a stalled socket neither resolves nor rejects, so setup
    // sat on a full progress bar forever. Nothing but a timer can end this.
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))

    await expect(fetchWithTimeout('https://example.test', { timeoutMs: 20 })).rejects.toThrow(
      /timed out/i
    )
  })

  it('should abort the stalled request so the connection is released', async () => {
    let signal = null
    vi.stubGlobal(
      'fetch',
      vi.fn((url, options) => {
        signal = options.signal
        return new Promise(() => {})
      })
    )

    await expect(
      fetchWithTimeout('https://example.test', { timeoutMs: 20 })
    ).rejects.toBeInstanceOf(Error)
    expect(signal.aborted).toBe(true)
  })

  it('should surface a real network failure as itself, not as a timeout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    await expect(fetchWithTimeout('https://example.test', { timeoutMs: 20 })).rejects.toThrow(
      'Network error'
    )
  })

  it('should keep the ceiling armed while the body is read', async () => {
    // `fetch` resolves as soon as the headers land, so a ceiling that stopped
    // there would leave the body read unbounded and a connection that stalls
    // part-way through the body would hang exactly as #85 did.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => new Promise(() => {}) })
    )

    const response = await fetchWithTimeout('https://example.test', { timeoutMs: 20 })

    await expect(response.json()).rejects.toThrow(/timed out/i)
  })

  it('should spend one budget across headers and body, not one each', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ ok: true, json: () => new Promise(() => {}) }), 80)
          })
      )
    )

    const pending = fetchWithTimeout('https://example.test', { timeoutMs: 100 })
    await vi.advanceTimersByTimeAsync(80)
    const response = await pending

    // 80ms of the 100ms budget went on the headers, so the body gets the
    // remaining 20 — not a fresh 100.
    const body = response.json()
    const assertion = expect(body).rejects.toThrow(/timed out/i)
    await vi.advanceTimersByTimeAsync(20)

    await assertion
  })

  it('should still honour a signal the caller supplied', async () => {
    // The helper installs a signal of its own; dropping the caller's would make
    // a future cancel button silently do nothing.
    const caller = new AbortController()
    let installed = null
    vi.stubGlobal(
      'fetch',
      vi.fn((url, options) => {
        installed = options.signal
        return new Promise(() => {})
      })
    )

    const pending = fetchWithTimeout('https://example.test', {
      timeoutMs: 20,
      signal: caller.signal
    })
    caller.abort()

    expect(installed.aborted).toBe(true)
    await expect(pending).rejects.toThrow()
  })

  it('should leave no timer running once the request answers', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))

    const response = await fetchWithTimeout('https://example.test', { timeoutMs: 20 })
    await response.json()

    expect(vi.getTimerCount()).toBe(0)
  })

  it('should forward fetch options without leaking timeoutMs into them', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', mockFetch)

    await fetchWithTimeout('https://example.test', { timeoutMs: 20, method: 'POST' })

    const options = mockFetch.mock.calls[0][1]
    expect(options.method).toBe('POST')
    expect(options.timeoutMs).toBeUndefined()
  })

  it('should apply a default ceiling when the caller names none', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))

    const pending = fetchWithTimeout('https://example.test')
    const assertion = expect(pending).rejects.toThrow(/timed out/i)
    await vi.advanceTimersByTimeAsync(DEFAULT_REQUEST_TIMEOUT_MS)

    await assertion
  })
})
