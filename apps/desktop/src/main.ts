import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import '@xterm/xterm/css/xterm.css';
import './index.css';

createApp(App).use(createPinia()).mount('#app');
