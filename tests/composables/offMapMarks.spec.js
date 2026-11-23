import { describe, it, expect } from 'vitest'
import {
  offMapTargets,
  edgeAnchor,
  spreadAlong,
  layoutEdgeLabels
} from '@/composables/map/offMapMarks'

/** A 100×100 map; each test town is placed straight in screen pixels */
const SIZE = { width: 100, height: 100 }
const pointOf = (town) => town.at

function town(msa, name, at, industries = []) {
  return { msa, name, at, industries: industries.map((n) => ({ name: n, industry: '0' })) }
}

describe('offMapTargets', () => {
  const denver = town('1', 'Denver', { x: -50, y: 50 })
  const pueblo = town('2', 'Pueblo', { x: 50, y: 300 }, ['Coal'])
  const craig = town('3', 'Craig', { x: 50, y: -100 }, ['Coal'])
  const boulder = town('4', 'Boulder', { x: 40, y: 40 })
  const line = (destination, industry, color = 'amber') => ({ destination, industry, color })

  it('labels a destination off the screen', () => {
    const targets = offMapTargets([line('Denver', 'Beef')], [denver], pointOf, SIZE)
    expect(targets).toEqual([
      expect.objectContaining({
        kind: 'destination',
        town: denver,
        industry: 'Beef',
        colors: ['amber']
      })
    ])
  })

  it('leaves out a destination on the screen', () => {
    expect(offMapTargets([line('Boulder', 'Beef')], [boulder], pointOf, SIZE)).toEqual([])
  })

  it('labels only the producer nearest the middle of the screen', () => {
    const targets = offMapTargets(
      [line('Boulder', 'Coal')],
      [boulder, pueblo, craig],
      pointOf,
      SIZE
    )
    expect(targets.map(({ kind, town }) => [kind, town.name])).toEqual([['producer', 'Craig']])
  })

  it('labels no producer while any producer is on the screen', () => {
    const golden = town('5', 'Golden', { x: 90, y: 90 }, ['Coal'])
    const targets = offMapTargets([line('Denver', 'Coal')], [denver, pueblo, golden], pointOf, SIZE)
    expect(targets.map(({ kind }) => kind)).toEqual(['destination'])
  })

  it('gives a town wanted the same way by two lines one label in both colors', () => {
    const targets = offMapTargets(
      [line('Denver', 'Coal', 'amber'), line('Boulder', 'Coal', 'cyan')],
      [denver, boulder, pueblo],
      pointOf,
      SIZE
    )
    const producer = targets.find(({ kind }) => kind === 'producer')
    expect(producer.colors).toEqual(['amber', 'cyan'])
    expect(targets.filter(({ kind }) => kind === 'producer')).toHaveLength(1)
  })

  it('keeps one destination wanted for two commodities as two labels', () => {
    const targets = offMapTargets(
      [line('Denver', 'Coal', 'amber'), line('Denver', 'Beef', 'cyan')],
      [denver, boulder],
      pointOf,
      SIZE
    )
    expect(targets.map(({ industry }) => industry)).toEqual(['Coal', 'Beef'])
  })

  it('skips a destination no town has the name of', () => {
    expect(offMapTargets([line('Atlantis', 'Beef')], [denver], pointOf, SIZE)).toEqual([])
  })
})

describe('edgeAnchor', () => {
  const rect = { left: 0, top: 0, right: 100, bottom: 100 }
  const middle = { x: 50, y: 50 }

  it('leaves by the left side toward a town due west', () => {
    expect(edgeAnchor(middle, { x: -200, y: 50 }, rect)).toEqual({
      side: 'left',
      x: 0,
      y: 50,
      angle: 180
    })
  })

  it('leaves by the bottom toward a town due south, pointing down', () => {
    const anchor = edgeAnchor(middle, { x: 50, y: 400 }, rect)
    expect(anchor).toMatchObject({ side: 'bottom', x: 50, y: 100, angle: 90 })
  })

  it('meets the side where the line crosses it, not straight across', () => {
    // Heading right and a little up: halfway to the town it crosses the
    // right side, a quarter of the way up to the town's height
    const anchor = edgeAnchor(middle, { x: 150, y: 25 }, rect)
    expect(anchor.side).toBe('right')
    expect(anchor.x).toBe(100)
    expect(anchor.y).toBeCloseTo(37.5)
  })

  it('leaves by the top when the line reaches it before the side', () => {
    const anchor = edgeAnchor(middle, { x: 70, y: -200 }, rect)
    expect(anchor.side).toBe('top')
    expect(anchor.y).toBe(0)
    expect(anchor.x).toBeCloseTo(54)
  })
})

describe('spreadAlong', () => {
  it('leaves boxes that do not touch where they are', () => {
    expect(
      spreadAlong(
        [
          { at: 20, size: 10 },
          { at: 60, size: 10 }
        ],
        0,
        100,
        2
      )
    ).toEqual([20, 60])
  })

  it('pushes overlapping boxes apart, keeping their order', () => {
    const [a, b] = spreadAlong(
      [
        { at: 51, size: 10 },
        { at: 50, size: 10 }
      ],
      0,
      100,
      2
    )
    expect(b).toBeLessThan(a)
    expect(a - b).toBe(12)
  })

  it('pulls boxes back inside the far end of the range', () => {
    const centers = spreadAlong(
      [
        { at: 95, size: 10 },
        { at: 96, size: 10 }
      ],
      0,
      100,
      0
    )
    expect(centers).toEqual([85, 95])
  })

  it('keeps a lone box inside the range', () => {
    expect(spreadAlong([{ at: 2, size: 10 }], 10, 100, 0)).toEqual([15])
  })
})

describe('layoutEdgeLabels', () => {
  const frame = {
    rect: { left: 0, top: 0, right: 200, bottom: 100 },
    ranges: { top: [0, 200], bottom: [0, 200], left: [20, 80], right: [20, 80] },
    gap: 4
  }

  it('sets labels flush against their side', () => {
    const centers = layoutEdgeLabels(
      [
        { key: 'w', side: 'left', x: 0, y: 50, width: 40, height: 10 },
        { key: 'e', side: 'right', x: 200, y: 50, width: 40, height: 10 },
        { key: 'n', side: 'top', x: 100, y: 0, width: 40, height: 10 },
        { key: 's', side: 'bottom', x: 100, y: 100, width: 40, height: 10 }
      ],
      frame
    )
    expect(centers.get('w')).toEqual({ x: 20, y: 50 })
    expect(centers.get('e')).toEqual({ x: 180, y: 50 })
    expect(centers.get('n')).toEqual({ x: 100, y: 5 })
    expect(centers.get('s')).toEqual({ x: 100, y: 95 })
  })

  it('stacks labels on the same side so they do not overlap', () => {
    const centers = layoutEdgeLabels(
      [
        { key: 'a', side: 'left', x: 0, y: 50, width: 40, height: 10 },
        { key: 'b', side: 'left', x: 0, y: 52, width: 40, height: 10 }
      ],
      frame
    )
    expect(centers.get('b').y - centers.get('a').y).toBe(14)
  })

  it('keeps a side label out of the corner its range leaves for the rows', () => {
    const centers = layoutEdgeLabels(
      [{ key: 'a', side: 'right', x: 200, y: 1, width: 40, height: 10 }],
      frame
    )
    expect(centers.get('a').y).toBe(25)
  })
})
