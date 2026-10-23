<!--
  DemandCard.vue

  One demand card. Each card offers three contracts: deliver a load of a
  commodity to a destination town for a payoff. A player fulfills at most one
  contract per card, so the three are listed together as alternatives.

  Each contract is one line — destination, commodity, payoff — so a whole card
  reads at a glance, and the strip of cards stays short enough to leave the
  map most of the screen. Town names are shown in full (only an unusually
  long one on a narrow card is cut short, so the payoff never is). The commodity
  takes whatever width is left, and is cut short (mid-word, with an ellipsis)
  only when it runs out of room, never to fewer than 15 characters; its full
  name shows on hover. As the window narrows, the card first shortens the
  payoff ($20.3k for $20,300), then moves the commodity onto a line of its own
  under the town, where it has the card's whole width.

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
import { formatCurrency, formatShortCurrency } from '@/composables/utils'

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
    <ul class="demand-card__list">
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
          <span class="demand-card__destination" :title="demand.destination">
            {{ demand.destination }}
          </span>
          <span class="demand-card__commodity" :title="demand.industry">{{ demand.industry }}</span>
          <span class="demand-card__payoff">
            <span class="demand-card__payoff-full">{{ formatCurrency(demand.payoff) }}</span>
            <span class="demand-card__payoff-short">{{ formatShortCurrency(demand.payoff) }}</span>
          </span>
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

.demand-card__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

/*
  Destination | commodity | payoff. The town and payoff take the width they
  need; the commodity gets the rest, but never less than 15 characters. If
  even that does not fit, the town name gives way rather than the payoff.
  The left edge is kept clear for a pinned line's color.
*/
.demand-card__row {
  display: grid;
  grid-template-columns: minmax(0, max-content) minmax(15ch, 1fr) max-content;
  align-items: baseline;
  gap: 0.5rem;
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

.demand-card__destination {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 700;
  color: var(--bulma-text-strong);
}

/* Cut mid-word as the room runs out, rather than at the last whole word */
.demand-card__commodity {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-style: italic;
  color: var(--bulma-text-weak);
}

.demand-card__payoff {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: var(--bulma-success-on-scheme);
}

.demand-card__payoff-short {
  display: none;
}

/* A narrow card gives the commodity more room by shortening the payoff */
@container (max-width: 340px) {
  .demand-card__payoff-full {
    display: none;
  }

  .demand-card__payoff-short {
    display: inline;
  }
}

/*
  Narrower still, a long town name, 15 characters of commodity and the
  payoff no longer fit side by side, so the commodity goes under the town
*/
@container (max-width: 300px) {
  .demand-card__row {
    grid-template-columns: minmax(0, 1fr) max-content;
    grid-template-areas:
      'destination payoff'
      'commodity commodity';
    row-gap: 0;
  }

  .demand-card__destination {
    grid-area: destination;
  }

  .demand-card__commodity {
    grid-area: commodity;
    font-size: 0.8rem;
  }

  .demand-card__payoff {
    grid-area: payoff;
  }
}
</style>
