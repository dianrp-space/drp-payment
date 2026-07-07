import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import { useBrandingStore } from "./stores/branding";
import "./assets/main.css";

const app = createApp(App);
app.use(createPinia());
app.use(router);

// Load branding sebelum mount supaya <title>, favicon, dan logo
// langsung pakai nilai terbaru (terutama di halaman login).
const branding = useBrandingStore();
branding.load().finally(() => {
  app.mount("#app");
});
