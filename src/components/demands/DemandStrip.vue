<!--
  DemandStrip.vue

  The demand cards, laid out in a strip along the bottom of the map like a
  hand of cards on the table in front of the player. Routes are planned by
  reading the cards against the map, so the cards sit right under it and stay
  visible — not behind a button.

  The strip folds down to its header line when the player wants more map;
  that choice is remembered in the browser. The map resizes to fill the space.

  For now these are the top three cards of the shared deck — players are not
  dealt their own hands yet — and the header says so.
-->

<script setup>
import { computed } from 'vue'
import { useDemandCardsStore } from '@/stores/demandCards'
import CollapsibleSection from '@/components/CollapsibleSection.vue'
import DemandCard from '@/components/demands/DemandCard.vue'

/** How many cards a player holds in Empire Builder */
const HAND_SIZE = 3

const demandCardsStore = useDemandCardsStore()

// Computed rather than sliced once, so the strip follows the deck — a loaded
// game brings a different deck with it
const cards = computed(() => demandCardsStore.demandCards.slice(0, HAND_SIZE))
</script>

<template>
  <CollapsibleSection
    class="demand-strip"
    aria-label="Demand cards"
    title="Demand cards"
    storage-key="demand_strip"
    badge="Shared deck · hands not dealt yet"
  >
    <div class="demand-strip__cards">
      <DemandCard
        v-for="(card, index) in cards"
        :key="index"
        :demands="card"
        :label="`Card ${index + 1}`"
      />
    </div>
  </CollapsibleSection>
</template>

<style scoped>
.demand-strip {
  flex: none;
  border-top: 1px solid var(--bulma-border);
  background: var(--bulma-scheme-main-bis);
}

/* Three equal cards side by side, filling the width under the map */
.demand-strip__cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

@media (max-width: 1023px) {
  .demand-strip__cards {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
