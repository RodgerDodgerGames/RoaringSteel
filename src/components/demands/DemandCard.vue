<!--
  DemandCard.vue

  Displays demand cards showing delivery contracts.
  Each card shows destination, payoff amount, and required industry.
  Multiple cards can be displayed in a horizontal row.

  @prop cards - Array of card arrays, each containing demand objects
                with destination, payoff, and industry fields
-->

<template>
  <div class="cards-container">
    <div class="demand-card" v-for="(card, cardIndex) in cards" :key="cardIndex">
      <div class="demand-row" v-for="(demand, demandIndex) in card" :key="demandIndex">
        <div class="destination">{{ demand.destination }}</div>
        <div class="payoff">${{ demand.payoff.toLocaleString() }}</div>
        <div class="industry">{{ demand.industry }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  cards: {
    type: Array,
    required: true
  }
})
</script>

<style scoped>
.cards-container {
  display: flex;
  flex-direction: row;
  justify-content: center;
  gap: 30px;
}

.demand-card {
  width: 270px;
  border: 2px solid black;
  border-radius: 10px;
  background: #f8f8f8; /* Light gray background */
  padding: 10px;
  box-shadow: 2px 2px 5px rgba(0, 0, 0, 0.3);
  text-align: center;
}

.demand-row {
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 8px;
  background: white;
}

.destination {
  font-size: 16px;
  font-weight: bold;
  color: #333;
}

.payoff {
  font-size: 14px;
  margin-top: 5px;
  color: #007b00; /* Green color for payoff */
}

.industry {
  font-size: 12px;
  margin-top: 5px;
  color: #555;
  font-style: italic;
}
</style>
