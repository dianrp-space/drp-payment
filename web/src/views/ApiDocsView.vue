<script setup lang="ts">
import { BookOpen, ExternalLink } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { onMounted } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();

function openDocs() {
  window.open("/api/docs/", "_blank", "noopener,noreferrer");
}

onMounted(() => {
  openDocs();
});
</script>

<template>
  <div class="h-full flex flex-col items-center justify-center gap-4 p-8 text-center">
    <div class="flex items-center justify-center size-14 rounded-full bg-primary/10 text-primary">
      <BookOpen class="size-6" />
    </div>
    <h1 class="font-display text-2xl italic">API Docs</h1>
    <p class="text-base-content/60 max-w-sm">
      Dokumentasi API terbuka di tab baru. Jika tidak muncul, klik tombol di bawah.
    </p>
    <Button @click="openDocs" class="gap-2">
      <ExternalLink class="size-4" />
      Buka API Docs
    </Button>
  </div>
</template>
