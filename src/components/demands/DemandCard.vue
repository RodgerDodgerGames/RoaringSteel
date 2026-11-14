<!--
  DemandCard.vue

  One demand card. Each card offers three contracts: deliver a load of a
  commodity to a destination town for a payoff. A player fulfills at most one
  contract per card, so the three are listed together as alternatives.

  Each contract is one line, read the way it is played — the load, then
  where it goes, then what it pays:

    Lumber [icon] → Cheyenne      $28k

  so a whole card reads at a glance, and the strip of cards stays short
  enough to leave the map most of the screen. The load's icon is the one the
  map shows round the towns that make it. The payoff is always in the short
  form: payoffs are rounded to whole thousands (see payoffs.js), so it loses
  nothing.

  The town name and payoff are shown in full. When the line runs out of
  room, the commodity name gives way, cut short mid-word with an ellipsis
  (its icon stays, and its full name shows on hover). On a narrow card the
  line wraps instead, the load on a line of its own and the town under it:

    Lumber [icon]
      → Cheyenne                 $28k

  In the hand of the player whose turn it is, each line is a button: pointing
  at it marks its towns on the map, and clicking it pins it there in its own
  color (clicking again unpins it). A pinned line is edged in its color. A
  hand being peeked at is for reading only.

  @prop demands    - The card's contracts: [{ destination, industry, payoff }, ...]
  @prop label      - Name for the card, e.g. "Card 1"
  @prop isPlayable - True for the active player's hand, whose lines can be
                     pointed at and pinned
  @prop pinColors  - The color each line is pinned in, or null where it is not
  @prop nextColor  - The color pinning a line would give it, shown on hover

  @emits hover  - The pointer or keyboard focus is on a line (its index)
  @emits leave  - The pointer or focus has left a line
  @emits toggle - A line was clicked, to pin or unpin it (its index)
-->

<script setup>
import { formatShortCurrency } from '@/composables/utils'
import { commodityIconUrl } from '@/composables/map/commodityIcons'
import { useTownsStore } from '@/stores/towns'

const townsStore = useTownsStore()

defineProps({
  demands: {
    type: Array,
    required: true
  },
  label: {
    type: String,
    required: true
  },
  isPlayable: {
    type: Boolean,
    default: false
  },
  pinColors: {
    type: Array,
    default: () => []
  },
  nextColor: {
    type: String,
    default: null
  }
})

const emit = defineEmits(['hover', 'leave', 'toggle'])

/**
 * What a playable line listens for: the pointer or keyboard focus arriving
 * and leaving, and clicks.
 *
 * Only focus from the keyboard counts as arriving. A browser can leave focus
 * on a line after it is clicked, and give it focus again when the player
 * comes back to the window; taken as arriving, that would mark the line on
 * the map while the pointer was nowhere near it.
 * @param {number} index - The line's place on the card
 * @returns {Object} Event handlers, by event name
 */
function lineEvents(index) {
  return {
    mouseenter: () => emit('hover', index),
    mouseleave: () => emit('leave'),
    focus: (event) => event.target.matches(':focus-visible') && emit('hover', index),
    blur: () => emit('leave'),
    click: () => emit('toggle', index)
  }
}
</script>

<template>
  <article class="demand-card" :aria-label="label">
    <ul>
      <li v-for="(demand, index) in demands" :key="index">
        <!-- A button where the line can be pinned; plain text in a peeked-at hand -->
        <component
          :is="isPlayable ? 'button' : 'div'"
          class="demand-card__row"
          :class="{ 'is-playable': isPlayable, 'is-pinned': pinColors[index] }"
          :style="{ '--line-color': pinColors[index] ?? nextColor }"
          :aria-pressed="isPlayable ? Boolean(pinColors[index]) : undefined"
          v-on="isPlayable ? lineEvents(index) : {}"
        >
          <span class="demand-card__load" :title="demand.industry">
            <span class="demand-card__commodity">{{ demand.industry }}</span>
            <img
              class="demand-card__icon"
              :src="commodityIconUrl(townsStore.industryCodes.get(demand.industry))"
              alt=""
              draggable="false"
            />
          </span>
          <span class="demand-card__route">
            <!-- Read out as "to" rather than as an arrow -->
            <span class="demand-card__arrow" aria-hidden="true">→</span>
            <span class="is-sr-only">to</span>
            <span class="demand-card__destination" :title="demand.destination">
              {{ demand.destination }}
            </span>
          </span>
          <span class="demand-card__payoff">{{ formatShortCurrency(demand.payoff) }}</span>
        </component>
      </li>
    </ul>
  </article>
</template>

<style scoped>
/* The card's own width decides how its lines are laid out (see below) */
.demand-card {
  container-type: inline-size;
  overflow: hidden;
  border: 1px solid var(--bulma-border);
  border-radius: var(--bulma-radius);
  background: var(--bulma-scheme-main);
  box-shadow: var(--bulma-shadow);
}

/*
  Load | → town | payoff, with the payoff pushed to the right edge. Only
  the load shrinks: the town and payoff keep the width they need, and the
  commodity name is cut short to fit what is left. The left edge is kept
  clear for a pinned line's color.
*/
.demand-card__row {
  display: flex;
  align-items: baseline;
  column-gap: 0.4rem;
  width: 100%;
  padding: 0.4rem 0.75rem 0.4rem 0.6rem;
  border: none;
  border-left: 4px solid transparent;
  background: none;
  color: inherit;
  font: inherit;
  font-size: 0.85rem;
  text-align: left;
}

/* A rule between contracts, as on the printed cards */
li + li .demand-card__row {
  border-top: 1px dashed var(--bulma-border-weak);
}

.demand-card__row.is-playable {
  cursor: pointer;
}

/* Pointing at a line tints it in the color it is (or would be) pinned in */
.demand-card__row.is-playable:hover,
.demand-card__row.is-playable:focus-visible {
  background: color-mix(in srgb, var(--line-color) 16%, transparent);
  outline: none;
}

.demand-card__row.is-pinned {
  border-left-color: var(--line-color);
  background: color-mix(in srgb, var(--line-color) 10%, transparent);
}

.demand-card__load {
  display: flex;
  align-items: baseline;
  gap: 0.25em;
  min-width: 0;
}

/*
  Cut mid-word as the room runs out, rather than at the last whole word,
  but never to fewer than 5 characters: the card wraps (see the bottom of
  this file) before it would get that short
*/
.demand-card__commodity {
  min-width: 5ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-style: italic;
  color: var(--bulma-text-weak);
}

/*
  Sized to the text and centered on it. Never shrinks, so it is still there
  when the name is cut short. Not draggable, so a click that wobbles still
  pins the line rather than starting an image drag (as the map's icons —
  see map.css).
*/
.demand-card__icon {
  flex: none;
  align-self: center;
  width: 1.1em;
  height: 1.1em;
  -webkit-user-drag: none;
}

.demand-card__route {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  flex: none;
  min-width: 0;
}

.demand-card__arrow {
  color: var(--bulma-text-weak);
}

.demand-card__destination {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 700;
  color: var(--bulma-text-strong);
}

.demand-card__payoff {
  flex: none;
  margin-left: auto;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: var(--bulma-success-on-scheme);
}

/*
  A narrow card has too little room for the commodity beside the town, so
  the line wraps: the load takes the whole first line, and the route and
  payoff share the second, the route set in under the load. The route
  starts from no width and takes what the payoff leaves, so the two always
  share the line; only an unusually long town name is cut short there, so
  the payoff never is.
*/
@container (max-width: 320px) {
  .demand-card__row {
    flex-wrap: wrap;
  }

  .demand-card__load {
    flex-basis: 100%;
  }

  .demand-card__route {
    flex: 1 1 0;
    padding-left: 0.75rem;
  }
}
</style>
