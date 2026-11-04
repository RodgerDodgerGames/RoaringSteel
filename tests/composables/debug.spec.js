/**
 * Debug Mode Tests
 *
 * The `?debug` switch, and the logger that prints only while it is on.
 */

import { describe, it, expect, vi } from 'vitest'
import { isDebugOn, createDebugLogger } from '@/composables/debug'

/** A stand-in console that records what is printed to it */
const fakeConsole = () => ({
  log: vi.fn(),
  table: vi.fn(),
  error: vi.fn(),
  groupCollapsed: vi.fn(),
  groupEnd: vi.fn()
})

describe('debug', () => {
  describe('isDebugOn', () => {
    it('should be on with a debug flag, with or without a value', () => {
      expect(isDebugOn('?debug')).toBe(true)
      expect(isDebugOn('?debug=1')).toBe(true)
      expect(isDebugOn('?region=08&debug')).toBe(true)
    })

    it('should be off without the flag, or with it set to 0 or false', () => {
      expect(isDebugOn('')).toBe(false)
      expect(isDebugOn('?debugger')).toBe(false)
      expect(isDebugOn('?debug=0')).toBe(false)
      expect(isDebugOn('?debug=false')).toBe(false)
      expect(isDebugOn('?debug=FALSE')).toBe(false)
      expect(isDebugOn('?debug=off')).toBe(false)
      expect(isDebugOn('?debug=no')).toBe(false)
    })
  })

  describe('createDebugLogger', () => {
    it('should print nothing, and fill no group, while off', () => {
      const target = fakeConsole()
      const logger = createDebugLogger(false, target)
      const body = vi.fn()

      logger.log('hello')
      logger.table([{ a: 1 }])
      logger.group('Turn', body)

      expect(target.log).not.toHaveBeenCalled()
      expect(target.table).not.toHaveBeenCalled()
      expect(target.groupCollapsed).not.toHaveBeenCalled()
      expect(body).not.toHaveBeenCalled()
    })

    it('should print while on, a group closing after its contents', () => {
      const target = fakeConsole()
      const logger = createDebugLogger(true, target)

      logger.group('Turn', () => logger.log('inside'))

      expect(target.groupCollapsed).toHaveBeenCalledWith('Turn')
      expect(target.log).toHaveBeenCalledWith('inside')
      expect(target.groupEnd).toHaveBeenCalledOnce()
    })

    it('should report contents that throw as an error, not pass it on, and close the group', () => {
      const target = fakeConsole()
      const logger = createDebugLogger(true, target)
      const broken = new Error('broken')

      // Whatever called it carries on as though nothing were printed
      expect(() =>
        logger.group('Turn', () => {
          throw broken
        })
      ).not.toThrow()
      expect(target.error).toHaveBeenCalledWith(expect.stringContaining('Turn'), broken)
      expect(target.groupEnd).toHaveBeenCalledOnce()
    })
  })
})
