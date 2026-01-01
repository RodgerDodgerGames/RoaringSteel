/**
 * useMapSupport Utility Tests
 *
 * Tests for coordinate conversion functions
 */

import { describe, it, expect } from 'vitest'

import {
  metersToLatitudeDegrees,
  metersToLongitudeDegrees,
  latitudeDegreesToMeters,
  longitudeDegreesToMeters
} from '@/composables/setup/useMapSupport'

const METERS_PER_DEGREE_LAT = 111320

describe('useMapSupport Utilities', () => {
  describe('metersToLatitudeDegrees', () => {
    it('should convert meters to latitude degrees', () => {
      const meters = 111320
      const result = metersToLatitudeDegrees(meters)

      expect(result).toBeCloseTo(1, 5)
    })

    it('should handle zero meters', () => {
      const result = metersToLatitudeDegrees(0)
      expect(result).toBe(0)
    })

    it('should handle large distances', () => {
      const meters = 5566000 // Approximately 50 degrees
      const result = metersToLatitudeDegrees(meters)

      expect(result).toBeCloseTo(50, 5)
    })

    it('should handle fractional meters', () => {
      const meters = 55660 // Approximately 0.5 degrees
      const result = metersToLatitudeDegrees(meters)

      expect(result).toBeCloseTo(0.5, 5)
    })

    it('should be consistent with inverse function', () => {
      const meters = 100000
      const degrees = metersToLatitudeDegrees(meters)
      const backToMeters = latitudeDegreesToMeters(degrees)

      expect(backToMeters).toBeCloseTo(meters, 1)
    })
  })

  describe('metersToLongitudeDegrees', () => {
    it('should convert meters to longitude degrees at equator', () => {
      const meters = 111320
      const latitude = 0
      const result = metersToLongitudeDegrees(meters, latitude)

      expect(result).toBeCloseTo(1, 5)
    })

    it('should account for latitude in longitude conversion', () => {
      const meters = 111320
      const latitudeEquator = 0
      const latitudeMN = 45

      const degreesAtEquator = metersToLongitudeDegrees(meters, latitudeEquator)
      const degreesAtMN = metersToLongitudeDegrees(meters, latitudeMN)

      // At 45 degrees latitude, longitude lines converge, so need MORE degrees for same distance
      expect(degreesAtMN).toBeGreaterThan(degreesAtEquator)
    })

    it('should handle high latitude (near poles)', () => {
      const meters = 111320
      const latitude = 85 // Near Arctic

      const result = metersToLongitudeDegrees(meters, latitude)

      // At high latitude, need many more degrees for same distance
      expect(result).toBeGreaterThan(5)
    })

    it('should handle negative latitude', () => {
      const meters = 111320
      const latitude = -45

      const result = metersToLongitudeDegrees(meters, latitude)

      expect(result).toBeCloseTo(1.41, 2)
    })

    it('should be consistent with inverse function', () => {
      const meters = 100000
      const latitude = 45
      const degrees = metersToLongitudeDegrees(meters, latitude)
      const backToMeters = longitudeDegreesToMeters(degrees, latitude)

      expect(backToMeters).toBeCloseTo(meters, 1)
    })
  })

  describe('latitudeDegreesToMeters', () => {
    it('should convert latitude degrees to meters', () => {
      const degrees = 1
      const result = latitudeDegreesToMeters(degrees)

      expect(result).toBeCloseTo(111320, 1)
    })

    it('should handle zero degrees', () => {
      const result = latitudeDegreesToMeters(0)
      expect(result).toBe(0)
    })

    it('should handle multiple degrees', () => {
      const degrees = 10
      const result = latitudeDegreesToMeters(degrees)

      expect(result).toBeCloseTo(1113200, 1)
    })

    it('should handle fractional degrees', () => {
      const degrees = 0.5
      const result = latitudeDegreesToMeters(degrees)

      expect(result).toBeCloseTo(55660, 1)
    })
  })

  describe('longitudeDegreesToMeters', () => {
    it('should convert longitude degrees to meters at equator', () => {
      const degrees = 1
      const latitude = 0
      const result = longitudeDegreesToMeters(degrees, latitude)

      expect(result).toBeCloseTo(111320, 1)
    })

    it('should account for latitude in conversion', () => {
      const degrees = 1
      const latitudeEquator = 0
      const latitudeMN = 45

      const metersAtEquator = longitudeDegreesToMeters(degrees, latitudeEquator)
      const metersAtMN = longitudeDegreesToMeters(degrees, latitudeMN)

      // At 45 degrees latitude, meters are less (longitude degrees are shorter)
      expect(metersAtMN).toBeLessThan(metersAtEquator)
    })

    it('should handle zero degrees', () => {
      const result = longitudeDegreesToMeters(0, 45)
      expect(result).toBe(0)
    })

    it('should be symmetric with metersToLongitudeDegrees', () => {
      const degrees = 2
      const latitude = 40
      const meters = longitudeDegreesToMeters(degrees, latitude)
      const backToDegrees = metersToLongitudeDegrees(meters, latitude)

      expect(backToDegrees).toBeCloseTo(degrees, 5)
    })
  })

  describe('Real-world use cases', () => {
    it('should calculate correct grid cell size for Minnesota', () => {
      // Minnesota grid with 10 km cells
      const cellSizeMeters = 10000
      const minLatitude = 43 // Approximate Minnesota latitude
      const meanLatitude = 46

      const latDegrees = metersToLatitudeDegrees(cellSizeMeters)
      const lonDegrees = metersToLongitudeDegrees(cellSizeMeters, meanLatitude)

      // Both should be small fractions of a degree
      expect(latDegrees).toBeCloseTo(0.090, 2)
      expect(lonDegrees).toBeCloseTo(0.127, 2)
    })

    it('should handle conversion roundtrip for typical grid', () => {
      const originalMeters = 25000 // 25 km cells
      const latitude = 45

      const latDegrees = metersToLatitudeDegrees(originalMeters)
      const lonDegrees = metersToLongitudeDegrees(originalMeters, latitude)

      const backToMetersLat = latitudeDegreesToMeters(latDegrees)
      const backToMetersLon = longitudeDegreesToMeters(lonDegrees, latitude)

      expect(backToMetersLat).toBeCloseTo(originalMeters, 0)
      expect(backToMetersLon).toBeCloseTo(originalMeters, 0)
    })

    it('should produce larger longitude degrees than latitude at same distance', () => {
      const meters = 50000
      const latitude = 45

      const latDegrees = metersToLatitudeDegrees(meters)
      const lonDegrees = metersToLongitudeDegrees(meters, latitude)

      // At 45 degrees latitude, longitude lines converge, so need MORE degrees for same distance
      expect(lonDegrees).toBeGreaterThan(latDegrees)
    })
  })

  describe('Edge cases', () => {
    it('should handle very small distances', () => {
      const meters = 1
      const latitude = 45

      const latDegrees = metersToLatitudeDegrees(meters)
      const lonDegrees = metersToLongitudeDegrees(meters, latitude)

      expect(latDegrees).toBeCloseTo(0.0000089, 6)
      expect(lonDegrees).toBeGreaterThan(0)
    })

    it('should handle negative degrees', () => {
      const degrees = -5
      const latitude = -45

      const meters = latitudeDegreesToMeters(degrees)
      const metersLon = longitudeDegreesToMeters(degrees, latitude)

      expect(meters).toBeLessThan(0)
      expect(metersLon).toBeLessThan(0)
    })
  })
})
