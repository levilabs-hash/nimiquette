import { getHostLanguage } from '@nimiq/mini-app-sdk'
import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

const language = getHostLanguage() ?? navigator.language.split('-')[0] ?? 'en'
document.documentElement.lang = language

createApp(App).mount('#app')
