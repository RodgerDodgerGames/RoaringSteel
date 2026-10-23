// main.js
// main entry point

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

// customized version of bulma, plus the game's fonts and custom styles
import './assets/roaring-steel.scss'

const app = createApp(App)

app.use(createPinia())

app.mount('#app')
