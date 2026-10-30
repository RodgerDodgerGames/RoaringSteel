// main.js
// main entry point

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { clearOldStorage } from './composables/database'

// customized version of bulma, plus the game's fonts and custom styles
import './assets/roaring-steel.scss'

// Saves and caches moved from localStorage to IndexedDB; drop the old ones
clearOldStorage()

const app = createApp(App)

app.use(createPinia())

app.mount('#app')
