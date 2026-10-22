<!--
  DemandStrip.vue

  The demand cards, laid out in a strip along the bottom of the map like a
  hand of cards on the table in front of the player. Routes are planned by
  reading the cards against the map, so the cards sit right under it and stay
  visible — not behind a button.

  It shows the hand of the player whose turn it is. In Empire Builder hands
  are dealt face up, so anyone may look at anyone's cards: the player chips in
  the header switch the strip to another player's hand, to see what they are
  chasing. When the turn passes, the strip goes back to the new active
  player's hand, so nobody starts their turn looking at someone else's cards.

  The strip folds down to its header line when the player wants more map;
  that choice is remembered in the browser. The map resizes to fill the space.

  How many cards are left in the deck shows in the header only when the
  player has turned that on in Settings; it is off by default.
-->

<script setup>
import { storeToRefs } from 'pinia'
import { useDemandCardsStore } from '@/stores/demandCards'
import { usePlayerStore } from '@/stores/players'
import { useSettingsStore } from '@/stores/settings'
import { useShownHand } from '@/composables/useShownHand'
import CollapsibleSection from '@/components/CollapsibleSection.vue'
import DemandCard from '@/components/demands/DemandCard.vue'

const { drawPile } = storeToRefs(useDemandCardsStore())
const { players, activePlayer } = storeToRefs(usePlayerStore())
const { settings } = storeToRefs(useSettingsStore())

// Whose hand is on screen, and switching between hands
const { shownPlayer, cards, showHandOf } = useShownHand()
</script>

<template>
  <CollapsibleSection
    class="demand-strip"
    aria-label="Demand cards"
    title="Demand cards"
    storage-key="demand_strip"
    :badge="settings.showDeckCount ? `Deck: ${drawPile.length} left` : ''"
  >
    <template #actions>
      <div class="buttons are-small has-addons" role="group" aria-label="Show the hand of">
        <button
          v-for="player in players"
          :key="player.id"
          class="button"
          :class="{ 'is-selected is-primary': player.id === shownPlayer?.id }"
          :aria-pressed="player.id === shownPlayer?.id"
          :title="player.id === activePlayer?.id ? `${player.name} (their turn)` : player.name"
          @click="showHandOf(player.id)"
        >
          <span class="demand-strip__swatch" :style="{ background: player.color }"></span>
          <span>{{ player.name }}</span>
        </button>
      </div>
    </template>

    <div v-if="cards.length" class="demand-strip__cards">
      <DemandCard
        v-for="(card, index) in cards"
        :key="card.id"
        :demands="card.demands"
        :label="`${shownPlayer.name}'s card ${index + 1}`"
      />
    </div>
    <p v-else class="demand-strip__empty">
      {{ shownPlayer ? `${shownPlayer.name} holds no demand cards.` : 'No hand to show.' }}
    </p>
  </CollapsibleSection>
</template>

<style scoped>
.demand-strip {
  flex: none;
  border-top: 1px solid var(--bulma-border);
  background: var(--bulma-scheme-main-bis);
}

/* Bulma's button group carries a bottom margin meant for stacked rows */
.demand-strip .buttons,
.demand-strip .buttons .button {
  margin-bottom: 0;
}

/* The player's colour, as on their chip in the top bar */
.demand-strip__swatch {
  display: inline-block;
  width: 0.65rem;
  height: 0.65rem;
  margin-right: 0.4rem;
  border-radius: 50%;
  box-shadow: 0 0 0 1px var(--bulma-border);
}

/* Three equal cards side by side, filling the width under the map */
.demand-strip__cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

.demand-strip__empty {
  font-size: 0.9rem;
  color: var(--bulma-text-weak);
}

@media (max-width: 1023px) {
  .demand-strip__cards {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
