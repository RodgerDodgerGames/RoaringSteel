<!--
  DemandCard.vue

  One demand card. Each card offers three contracts: deliver a load of a
  commodity to a destination town for a payoff. A player fulfils at most one
  contract per card, so the three are listed together as alternatives.

  Each contract is one line — destination, commodity, payoff — so a whole card
  reads at a glance, and the strip of cards stays short enough to leave the
  map most of the screen. Long names are cut short with an ellipsis and shown
  in full on hover.

  @prop demands - The card's contracts: [{ destination, industry, payoff }, ...]
  @prop label   - Name for the card, e.g. "Card 1"
-->

<script setup>
import { formatCurrency } from '@/composables/utils'

defineProps({
  demands: {
    type: Array,
    required: true
  },
  label: {
    type: String,
    required: true
  }
})
</script>

<template>
  <article class="demand-card" :aria-label="label">
    <ul class="demand-card__list">
      <li v-for="(demand, index) in demands" :key="index" class="demand-card__row">
        <span class="demand-card__destination" :title="demand.destination">
          {{ demand.destination }}
        </span>
        <span class="demand-card__commodity" :title="demand.industry">{{ demand.industry }}</span>
        <span class="demand-card__payoff">{{ formatCurrency(demand.payoff) }}</span>
      </li>
    </ul>
  </article>
</template>

<style scoped>
.demand-card {
  border: 1px solid var(--bulma-border);
  border-radius: var(--bulma-radius-large);
  background: var(--bulma-scheme-main);
  box-shadow: var(--bulma-shadow);
}

.demand-card__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

/* Destination | commodity | payoff, with the payoff column sized to fit */
.demand-card__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.3rem 0.75rem;
  font-size: 0.9rem;
}

/* A rule between contracts, as on the printed cards */
.demand-card__row + .demand-card__row {
  border-top: 1px dashed var(--bulma-border-weak);
}

.demand-card__destination,
.demand-card__commodity {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.demand-card__destination {
  font-weight: 700;
  color: var(--bulma-text-strong);
}

.demand-card__commodity {
  font-style: italic;
  color: var(--bulma-text-weak);
}

.demand-card__payoff {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: var(--bulma-success-on-scheme);
}
</style>
