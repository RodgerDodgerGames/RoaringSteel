<!--
  DemandStrip.vue

  The demand cards, laid out in a strip along the bottom of the map like a
  hand of cards on the table in front of the player. Routes are planned by
  reading the cards against the map, so the cards sit right under it and stay
  visible — not behind a button.

  The strip collapses to its header line when the player wants more map; that
  choice is remembered in the browser. The map resizes to fill the space.

  For now these are the top three cards of the shared deck — players are not
  dealt their own hands yet — and the header says so.
-->

<script setup>
import { computed } from 'vue'
import { useStorage } from '@vueuse/core'
import { useDemandCardsStore } from '@/stores/demandCards'
import DemandCard from '@/components/demands/DemandCard.vue'

/** How many cards a player holds in Empire Builder */
const HAND_SIZE = 3

const demandCardsStore = useDemandCardsStore()

// Computed rather than sliced once, so the strip follows the deck — a loaded
// game brings a different deck with it
const cards = computed(() => demandCardsStore.demandCards.slice(0, HAND_SIZE))

// Remembered per browser; falls back to in-memory state without storage
const isCollapsed = useStorage('roaringsteel_demand_strip_collapsed', false)
</script>

<template>
  <section class="demand-strip" aria-label="Demand cards">
    <button
      class="demand-strip__toggle"
      :aria-expanded="!isCollapsed"
      @click="isCollapsed = !isCollapsed"
    >
      <span class="demand-strip__title">Demand cards</span>
      <span class="tag is-rounded">Shared deck · hands not dealt yet</span>
      <span class="demand-strip__action">
        {{ isCollapsed ? 'Show' : 'Hide' }}
        <span class="icon" aria-hidden="true">
          <i class="fas" :class="isCollapsed ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
        </span>
      </span>
    </button>

    <div v-show="!isCollapsed" class="demand-strip__cards">
      <DemandCard
        v-for="(card, index) in cards"
        :key="index"
        :demands="card"
        :label="`Card ${index + 1}`"
      />
    </div>
  </section>
</template>

<style scoped>
.demand-strip {
  flex: none;
  border-top: 1px solid var(--bulma-border);
  background: var(--bulma-scheme-main-bis);
}

/* A plain header row that happens to be a button */
.demand-strip__toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.4rem 1rem;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.demand-strip__toggle:hover {
  background: var(--bulma-scheme-main-ter);
}

.demand-strip__title {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--bulma-text-weak);
}

.demand-strip__action {
  display: flex;
  align-items: center;
  margin-left: auto;
  font-size: 0.85rem;
  color: var(--bulma-text-weak);
}

/* Three equal cards side by side, filling the width under the map */
.demand-strip__cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
  padding: 0 1rem 0.75rem;
}

@media (max-width: 1023px) {
  .demand-strip__cards {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
