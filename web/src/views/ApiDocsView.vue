<script setup lang="ts">
import { BookOpen, ExternalLink, RotateCw } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { ref } from "vue";

const iframeKey = ref(0);
const iframeSrc = ref("/api-docs/");

function reload() {
  iframeKey.value++;
}

function openExternal() {
  window.open("/api-docs/", "_blank", "noopener,noreferrer");
}
</script>

<template>
  <div class="h-full flex flex-col">
    <header
      class="px-6 md:px-10 py-6 border-b border-base-300 flex items-center gap-3 shrink-0"
    >
      <div
        class="flex items-center justify-center size-9 rounded-md bg-primary/10 text-primary shrink-0"
      >
        <BookOpen class="size-4" />
      </div>
      <div class="min-w-0 flex-1">
        <h1 class="font-display text-2xl italic leading-none">API Docs</h1>
        <p class="text-[11px] text-base-content/60 font-mono mt-1">
          OpenAPI 3.0 · Swagger UI
        </p>
      </div>
      <div class="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          @click="reload"
          aria-label="Muat ulang"
          title="Muat ulang"
        >
          <RotateCw class="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          @click="openExternal"
          aria-label="Buka di tab baru"
          title="Buka di tab baru"
        >
          <ExternalLink class="size-4" />
        </Button>
      </div>
    </header>

    <div class="flex-1 min-h-0 bg-white">
      <iframe
        :key="iframeKey"
        :src="iframeSrc"
        class="w-full h-full border-0"
        title="API Documentation"
      />
    </div>
  </div>
</template>
