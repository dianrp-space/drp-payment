<script setup lang="ts">
import { computed } from "vue";
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from "@lucide/vue";
import type { AlertType } from "@/composables/useAlert";

const props = defineProps<{
  type: AlertType;
  visible: boolean;
  message: string;
}>();

const emit = defineEmits<{ dismiss: [] }>();

const icon = computed(() => {
  switch (props.type) {
    case "success": return CheckCircle2;
    case "error": return XCircle;
    case "warning": return AlertTriangle;
    case "info": return Info;
  }
});

const alertClass = computed(() => {
  switch (props.type) {
    case "success": return "alert-success";
    case "error": return "alert-error";
    case "warning": return "alert-warning";
    case "info": return "alert-info";
  }
});
</script>

<template>
  <Teleport to="body">
    <Transition name="alert-fade">
      <div
        v-if="visible"
        role="alert"
        :class="['alert fixed top-20 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-md shadow-lg', alertClass]"
      >
        <component :is="icon" class="size-5 shrink-0" />
        <span>{{ message }}</span>
        <button class="btn btn-ghost btn-xs btn-square shrink-0" @click="emit('dismiss')">
          <X class="size-4" />
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.alert-fade-enter-active {
  transition: all 0.3s ease-out;
}
.alert-fade-leave-active {
  transition: all 0.2s ease-in;
}
.alert-fade-enter-from {
  opacity: 0;
  transform: translate(-50%, -1rem);
}
.alert-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, -1rem);
}
</style>
