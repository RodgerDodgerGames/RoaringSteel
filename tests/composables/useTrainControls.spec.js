/**
 * Train Controls Tests
 *
 * The "Run to" list puts the places on the player's own track first, and
 * lists those whose way runs on other players' track after them only when
 * the player shows them — except the place the train is already heading
 * for, which stays so carrying on is one Confirm.
 */

import { describe, it, expect } from 'vitest'
import { listedRunChoices } from '@/composables/useTrainControls'

/** A place in the list whose way runs on the given owners' track */
const place = (id, owners = []) => ({ id, entry: { owners } })

// As the composable builds the list: towns nearest first, then line ends,
// own and others' places mixed
const choices = [
  place('town:Near'),
  place('town:Over', [2]),
  place('town:Mid'),
  place('town:Beyond', [2, 3]),
  place('point:End'),
  place('point:TheirEnd', [3])
]
const ids = (list) => list.map((choice) => choice.id)

describe('listedRunChoices', () => {
  it("should list only the player's own places while others' are hidden", () => {
    expect(ids(listedRunChoices(choices, { showOthers: false, keepId: null }))).toEqual([
      'town:Near',
      'town:Mid',
      'point:End'
    ])
  })

  it("should put others' places after the player's own, each group in its order, when shown", () => {
    expect(ids(listedRunChoices(choices, { showOthers: true, keepId: null }))).toEqual([
      'town:Near',
      'town:Mid',
      'point:End',
      'town:Over',
      'town:Beyond',
      'point:TheirEnd'
    ])
  })

  it("should keep the place the train is heading for even while others' are hidden", () => {
    expect(ids(listedRunChoices(choices, { showOthers: false, keepId: 'town:Beyond' }))).toEqual([
      'town:Near',
      'town:Mid',
      'point:End',
      'town:Beyond'
    ])
  })
})
