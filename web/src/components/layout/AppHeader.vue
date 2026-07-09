<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRoute, RouterLink } from "vue-router";
import { Sun, Moon, Menu, LogOut, QrCode } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useUiStore } from "@/stores/ui";
import { useBrandingStore } from "@/stores/branding";
import { api } from "@/lib/api";

const ui = useUiStore();
const route = useRoute();
const branding = useBrandingStore();

const pageTitle = computed(() => (route.meta.title as string) ?? "Console");

const shortName = computed(() => {
  const name = branding.appName.trim();
  if (!name) return "DRP";
  const firstWord = name.split(/\s+/)[0] ?? name;
  return firstWord.length <= 4 ? firstWord : firstWord.slice(0, 3).toUpperCase();
});

const emit = defineEmits<{ (e: "logout"): void }>();

// --- Server health ---
const health = ref<{ status: string; timestamp: string } | null>(null);
let healthInterval: ReturnType<typeof setInterval> | null = null;

async function checkHealth() {
  try {
    health.value = await api.health();
  } catch {
    health.value = null;
  }
}

onMounted(() => {
  checkHealth();
  healthInterval = setInterval(checkHealth, 30_000);
});

onUnmounted(() => {
  if (healthInterval) clearInterval(healthInterval);
});
</script>

<template>
  <header
    class="h-14 shrink-0 border-b border-base-300 bg-base-100/80 backdrop-blur-md sticky top-0 z-10"
  >
    <div class="h-full px-4 md:px-6 flex items-center gap-3">
      <!-- Mobile menu -->
      <Button
        variant="ghost"
        size="icon"
        class="md:hidden"
        @click="ui.toggleSidebar()"
        aria-label="Buka menu"
      >
        <Menu class="size-5" />
      </Button>

      <!-- Mobile brand -->
      <RouterLink to="/" class="md:hidden flex items-center gap-2">
        <img
          v-if="branding.logoSrc"
          :src="branding.logoSrc"
          alt="logo"
          class="h-7 w-7 object-contain"
        />
        <QrCode v-else class="size-5 text-primary" />
        <span
          class="font-display text-2xl italic text-primary leading-none tracking-tight"
          >{{ shortName }}</span
        >
      </RouterLink>

      <!-- Desktop: page title + breadcrumb (brand ada di sidebar) -->
      <div class="hidden md:flex items-center gap-3">
        <h1 class="font-display text-xl italic">{{ pageTitle }}</h1>
        <span
          class="text-[11px] text-base-content/60 font-mono uppercase tracking-wider"
        >
          {{ route.path }}
        </span>
      </div>

      <div class="ml-auto flex items-center gap-2">
        <!-- Server status -->
        <div
          class="flex items-center gap-1.5 text-xs text-base-content/60 mr-1"
          :title="health ? new Date(health.timestamp).toLocaleString('id-ID') : undefined"
        >
          <span
            :class="[
              'size-2 rounded-full',
              health
                ? 'bg-success shadow-[0_0_6px] shadow-success'
                : 'bg-destructive',
            ]"
          ></span>
          <span>{{ health ? "Online" : "Offline" }}</span>
        </div>

        <Button
          variant="ghost"
          size="icon"
          @click="ui.toggleTheme()"
          :aria-label="
            ui.theme === 'dark' ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'
          "
          :title="ui.theme === 'dark' ? 'Mode terang' : 'Mode gelap'"
        >
          <Sun v-if="ui.theme === 'dark'" class="size-4" />
          <Moon v-else class="size-4" />
        </Button>

        <Separator orientation="vertical" class="h-6 mx-1" />

        <Button
          variant="ghost"
          size="sm"
          class="text-error hover:text-error-content hover:bg-error"
          @click="emit('logout')"
        >
          <LogOut class="size-4" />
          <span class="hidden sm:inline ml-1.5">Keluar</span>
        </Button>
      </div>
    </div>
  </header>
</template>
