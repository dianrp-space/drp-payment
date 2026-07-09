<script setup lang="ts">
import { useRouter } from "vue-router";
import { toast } from "vue-sonner";
import AppSidebar from "./AppSidebar.vue";
import AppHeader from "./AppHeader.vue";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const router = useRouter();

function handleLogout() {
  auth.logout();
  toast.success("Berhasil keluar");
  router.replace({ name: "login" });
}
</script>

<template>
  <div class="min-h-screen flex bg-base-100 text-base-content">
    <AppSidebar />
    <div class="flex-1 flex flex-col min-w-0 min-h-screen">
      <AppHeader @logout="handleLogout" />
      <main class="flex-1 overflow-y-auto">
        <RouterView v-slot="{ Component }">
          <transition
            enter-active-class="transition duration-200 ease-out"
            enter-from-class="opacity-0 translate-y-1"
            enter-to-class="opacity-100 translate-y-0"
            mode="out-in"
          >
            <component :is="Component" />
          </transition>
        </RouterView>
      </main>
    </div>
  </div>
</template>
