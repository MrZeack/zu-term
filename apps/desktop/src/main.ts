import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import '@xterm/xterm/css/xterm.css';
import './index.css';

// HTML5 drops are handled by the page (splits reorder by dragging), so a
// file dropped anywhere else must not navigate the window to it.
const preventNavigation = (event: DragEvent) => event.preventDefault();
window.addEventListener('dragover', preventNavigation);
window.addEventListener('drop', preventNavigation);

createApp(App).use(createPinia()).mount('#app');
