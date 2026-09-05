/**
 * Track Store (track.js)
 *
 * Holds the rail network as plain, serializable data rather than as Leaflet
 * layers, so track has an owner, survives a save/load, and can be read by the
 * rest of the game (connection checks, movement, delivery scoring).
 *
 * A segment is one continuous line the player drew in a single build action —
 * the same unit the cost panel calls a "section".
 *
 * Segment Object Structure:
 * {
 *   id: number,           // Unique segment ID (1-indexed)
 *   ownerId: number,      // ID of the player who built it
 *   coordinates: Array,   // [{lat, lng}, ...] in draw order, at least two
 *   cost: number,         // What the segment cost to build
 *   turn: number          // Game turn it was built on
 * }
 *
 * @module stores/track
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/**
 * Reduce a Leaflet LatLng (or anything LatLng-shaped) to a plain point.
 * Leaflet's own objects carry methods and a prototype that do not survive
 * JSON, so nothing layer-shaped is allowed into the store.
 * @param {Object} point - A {lat, lng} shaped object
 * @returns {{lat: number, lng: number}} Plain serializable point
 */
function toPlainPoint(point) {
  return { lat: point.lat, lng: point.lng }
}

/**
 * @param {*} point - Candidate coordinate
 * @returns {boolean} True if the point has usable numeric lat and lng
 */
function isValidPoint(point) {
  return (
    !!point && typeof point === 'object' && Number.isFinite(point.lat) && Number.isFinite(point.lng)
  )
}

export const useTrackStore = defineStore('track', () => {
  // STATE

  /** Every track segment built in the game, in build order */
  const segments = ref([])

  /** Monotonic id source, so ids stay stable across removals */
  let nextSegmentId = 1

  /** Error state for failed operations */
  const error = ref(null)

  // GETTERS

  /** @returns {boolean} True if any track has been built */
  const hasTrack = computed(() => segments.value.length > 0)

  /** @returns {number} What every segment in the game cost, combined */
  const totalTrackCost = computed(() =>
    segments.value.reduce((total, segment) => total + segment.cost, 0)
  )

  // ACTIONS

  /**
   * Record a completed track segment.
   * @param {{ownerId: number, coordinates: Array, cost?: number, turn?: number}} segment
   * @returns {Object|null} The stored segment, or null if it was rejected.
   */
  function addSegment(segment) {
    error.value = null

    if (!segment || typeof segment !== 'object') {
      error.value = 'Invalid track segment'
      return null
    }

    // Track with no owner cannot be charged for, coloured, or run on, so an
    // unattributed segment is a bug rather than something to store and fix later
    if (!Number.isInteger(segment.ownerId)) {
      error.value = 'Track segment must have an owner'
      return null
    }

    if (!Array.isArray(segment.coordinates) || segment.coordinates.length < 2) {
      error.value = 'Track segment needs at least two points'
      return null
    }

    if (!segment.coordinates.every(isValidPoint)) {
      error.value = 'Track segment has an invalid coordinate'
      return null
    }

    const cost = segment.cost ?? 0
    if (!Number.isFinite(cost) || cost < 0) {
      error.value = 'Track segment cost must be a non-negative number'
      return null
    }

    const turn = segment.turn ?? 0
    if (!Number.isInteger(turn) || turn < 0) {
      error.value = 'Track segment turn must be a non-negative integer'
      return null
    }

    const stored = {
      id: nextSegmentId++,
      ownerId: segment.ownerId,
      coordinates: segment.coordinates.map(toPlainPoint),
      cost,
      turn
    }
    segments.value.push(stored)
    return stored
  }

  /**
   * Look up a segment by id.
   * @param {number} id - The segment id.
   * @returns {Object|undefined} The segment, if it exists.
   */
  function getSegment(id) {
    return segments.value.find((segment) => segment.id === id)
  }

  /**
   * Remove a segment — used when a player tears up track they just built.
   * @param {number} id - The segment id.
   * @returns {boolean} True if the segment was found and removed.
   */
  function removeSegment(id) {
    error.value = null

    if (!getSegment(id)) {
      error.value = `Track segment with ID ${id} not found`
      return false
    }

    segments.value = segments.value.filter((segment) => segment.id !== id)
    return true
  }

  /**
   * Rewrite a segment's coordinates after the player reshapes it on the map.
   * Only the geometry is editable: ownership, price and turn are decided when
   * the track is built, not when a vertex is dragged.
   * @param {number} id - The segment id.
   * @param {Array} coordinates - The new [{lat, lng}, ...] in draw order.
   * @returns {boolean} True if the segment was found and updated.
   */
  function updateSegmentCoordinates(id, coordinates) {
    error.value = null

    const segment = getSegment(id)
    if (!segment) {
      error.value = `Track segment with ID ${id} not found`
      return false
    }

    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      error.value = 'Track segment needs at least two points'
      return false
    }

    if (!coordinates.every(isValidPoint)) {
      error.value = 'Track segment has an invalid coordinate'
      return false
    }

    segment.coordinates = coordinates.map(toPlainPoint)
    return true
  }

  /**
   * Every segment belonging to one player.
   * @param {number} ownerId - The player's id.
   * @returns {Array} That player's segments, in build order.
   */
  function segmentsForOwner(ownerId) {
    return segments.value.filter((segment) => segment.ownerId === ownerId)
  }

  /**
   * Replace the whole network (used for loading saved games).
   * Ids come from the save, so the counter is moved past the highest of them
   * to keep new segments from colliding with restored ones.
   * @param {Array} segmentsArray - Array of segment objects
   */
  function setTrack(segmentsArray) {
    if (!Array.isArray(segmentsArray)) return

    segments.value = segmentsArray.map((segment) => ({
      ...segment,
      coordinates: (segment.coordinates || []).map(toPlainPoint)
    }))

    const highestId = segments.value.reduce(
      (highest, segment) =>
        Number.isInteger(segment.id) ? Math.max(highest, segment.id) : highest,
      0
    )
    nextSegmentId = highestId + 1
    error.value = null
  }

  /**
   * Clear all track and errors from the store.
   */
  function reset() {
    segments.value = []
    nextSegmentId = 1
    error.value = null
  }

  return {
    // state
    segments,
    error,
    // getters
    hasTrack,
    totalTrackCost,
    // actions
    addSegment,
    getSegment,
    removeSegment,
    updateSegmentCoordinates,
    segmentsForOwner,
    setTrack,
    reset
  }
})
