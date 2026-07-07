<script setup lang="ts">
import { Toaster } from "@/components/ui/sonner";
</script>

<template>
  <RouterView />
  <Toaster
    position="top-right"
    :toast-options="{
      style: {
        fontFamily: 'var(--font-sans)',
      },
      class: 'group toast group',
    }"
  />
</template>
