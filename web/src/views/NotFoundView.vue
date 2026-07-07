<script setup lang="ts">
import { RouterLink } from "vue-router";
import { Button } from "@/components/ui/button";
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-background p-6">
    <div class="text-center max-w-sm">
      <p class="font-display text-8xl italic text-primary leading-none mb-4">404</p>
      <p class="text-sm text-muted-foreground mb-6">
        Halaman yang kamu cari tidak ada di konsol ini.
      </p>
      <Button as-child variant="outline">
        <RouterLink to="/">Kembali ke dashboard</RouterLink>
      </Button>
    </div>
  </div>
</template>
