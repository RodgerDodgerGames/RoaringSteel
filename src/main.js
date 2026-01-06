// main.js
// main entry point

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

// customized version of bulma
import './assets/roaring-steel.scss'
// custom styles
import './assets/main.scss'

const app = createApp(App)

app.use(createPinia())

app.mount('#app')
