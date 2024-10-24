import './assets/main.scss'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

// Import Bulma CSS
import 'bulma/css/bulma.css'

const app = createApp(App)

app.use(createPinia())

app.mount('#app')
