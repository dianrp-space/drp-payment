<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@/lib/utils"

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <tr
    data-slot="table-row"
    :class="cn('hover:bg-base-200/50 data-[state=selected]:bg-base-200 border-b transition-colors has-aria-expanded:bg-base-200/50', props.class)"
  >
    <slot />
  </tr>
</template>
