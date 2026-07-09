import { defineStore } from "pinia";
import { ref, watch } from "vue";

export type ThemeMode = "light" | "dark";

const STORAGE_KEY = "drp-theme";

function getInitial(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
}

function apply(mode: ThemeMode): void {
  const root = document.documentElement;
  root.setAttribute("data-theme", mode === "dark" ? "drp-dark" : "drp");
  if (mode === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

export const useUiStore = defineStore("ui", () => {
  const theme = ref<ThemeMode>(getInitial());
  const sidebarOpen = ref(false);
  const sidebarCollapsed = ref(false);

  apply(theme.value);

  function toggleTheme(): void {
    theme.value = theme.value === "dark" ? "light" : "dark";
  }

  function toggleSidebar(): void {
    sidebarOpen.value = !sidebarOpen.value;
  }

  function closeSidebar(): void {
    sidebarOpen.value = false;
  }

  function toggleSidebarCollapsed(): void {
    sidebarCollapsed.value = !sidebarCollapsed.value;
  }

  watch(theme, (next) => {
    apply(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  });

  return {
    theme,
    sidebarOpen,
    sidebarCollapsed,
    toggleTheme,
    toggleSidebar,
    closeSidebar,
    toggleSidebarCollapsed,
  };
});
