<!--
  AreaSelectView.vue
  Board selection screen where players choose the land for their game: a
  single state, or a region of several (see useBoardChoices.js). The panel
  above the map switches between the ways of choosing and shows the board
  chosen; the map shows the boards on offer.

  The second step of setting up a new game, after the players and before the
  Confirm Setup page. Coming back to it to change the board, it opens on the
  grouping that offers the board already chosen, so that board is on the map
  and marked.

  @emits edit-players - The player wants to go back to the players
  @emits board-chosen - The player has chosen their board and goes on to
                        Confirm Setup
-->

<script setup>
import { computed, onMounted } from 'vue'
import AreaSelectMap from '@/components/setup/AreaSelectMap.vue'
import AreaSelectPanel from '@/components/setup/AreaSelectPanel.vue'
import { useGameStore } from '@/stores/game'
import { useBoardChoices } from '@/composables/setup/useBoardChoices'
import { boardGrouping, boardKey } from '@/composables/setup/boards'

const gameStore = useGameStore()
const emit = defineEmits(['edit-players', 'board-chosen'])

const { groupings, grouping, boards, stateFeatures, error, load } = useBoardChoices(
  boardGrouping(gameStore.region)
)
onMounted(load)

/** The key of the board chosen, so the map can mark it */
const selectedKey = computed(() => (gameStore.region ? boardKey(gameStore.region) : null))

/**
 * Makes a board the one the game is played on.
 * @param {Object} board - The board's feature (see boards.js)
 */
function handleSelect(board) {
  gameStore.setRegion(board)
}
</script>

<template>
  <div class="section">
    <AreaSelectPanel
      v-model:grouping="grouping"
      :region="gameStore.region"
      :groupings="groupings"
      class="mb-4"
      @back="emit('edit-players')"
      @continue="emit('board-chosen')"
    />
    <p v-if="error" class="notification is-danger is-light">{{ error }}</p>
    <AreaSelectMap
      :boards="boards"
      :state-features="stateFeatures"
      :selected-key="selectedKey"
      @select="handleSelect"
    />
  </div>
</template>
