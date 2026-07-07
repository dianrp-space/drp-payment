<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { toast } from "vue-sonner";
import { Loader2, ArrowRight, Mail, Lock, QrCode } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuthStore } from "@/stores/auth";
import { useBrandingStore } from "@/stores/branding";
import { HttpError } from "@/lib/api";
import Swal from "sweetalert2";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const branding = useBrandingStore();

const email = ref("");
const password = ref("");
const loading = ref(false);

const shortName = computed(() => {
  const name = branding.appName.trim();
  if (!name) return "DRP";
  const firstWord = name.split(/\s+/)[0] ?? name;
  return firstWord.length <= 4 ? firstWord : firstWord.slice(0, 3).toUpperCase();
});

const subtitle = computed(() => {
  const name = branding.appName.trim();
  const rest = name.split(/\s+/).slice(1).join(" ").trim();
  return rest || "Payment Gateway";
});

onMounted(() => {
  if (auth.isAuthenticated) {
    const redirect = (route.query.redirect as string) || "/";
    router.replace(redirect);
  }
});

async function handleSubmit() {
  if (!email.value.trim() || !password.value) {
    toast.error("Email dan password wajib diisi");
    return;
  }
  loading.value = true;
  try {
    await auth.login(email.value.trim(), password.value);
    Swal.fire({
      icon: "success",
      title: `Selamat datang, ${auth.userName ?? "admin"}!`,
      timer: 2000,
      timerProgressBar: true,
      showConfirmButton: false,
    });
    const redirect = (route.query.redirect as string) || "/";
    router.replace(redirect);
  } catch (e) {
    const msg =
      e instanceof HttpError
        ? e.status === 0
          ? "Tidak bisa terhubung ke server"
          : e.status === 401
            ? "Email atau password salah"
            : e.message
        : "Login gagal";
    toast.error(msg);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen grid md:grid-cols-2 bg-background">
    <!-- Left: form -->
    <div class="flex items-center justify-center px-6 py-12">
      <div class="w-full max-w-sm">
        <div class="mb-10">
          <RouterLink to="/" class="inline-flex items-center gap-2 mb-8">
            <img
              v-if="branding.logoSrc"
              :src="branding.logoSrc"
              alt="logo"
              class="h-9 w-9 object-contain"
            />
            <span
              v-else
              class="flex items-center justify-center size-9 rounded-md bg-primary/10 text-primary"
            >
              <QrCode class="size-5" />
            </span>
            <span class="flex items-baseline gap-2">
              <span class="font-display text-4xl italic text-primary leading-none">{{
                shortName
              }}</span>
              <span
                class="text-[10px] text-muted-foreground uppercase tracking-[0.2em]"
                >{{ subtitle }}</span
              >
            </span>
          </RouterLink>
          <h1 class="font-display text-3xl italic mb-2">Masuk ke konsol</h1>
          <p class="text-sm text-muted-foreground leading-relaxed">
            Akses dashboard untuk mengelola merchant, memantau transaksi,
            dan mengatur pengaturan payment gateway.
          </p>
        </div>

        <form @submit.prevent="handleSubmit" class="flex flex-col gap-4">
          <div class="flex flex-col gap-2">
            <Label for="email" class="text-xs uppercase tracking-wider">
              Email
            </Label>
            <div class="relative">
              <Mail
                class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
              />
              <Input
                id="email"
                v-model="email"
                type="email"
                autocomplete="email"
                placeholder="admin@drp.local"
                class="pl-9"
                :disabled="loading"
              />
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <Label for="password" class="text-xs uppercase tracking-wider">
              Password
            </Label>
            <div class="relative">
              <Lock
                class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
              />
              <Input
                id="password"
                v-model="password"
                type="password"
                autocomplete="current-password"
                placeholder="••••••••"
                class="pl-9"
                :disabled="loading"
              />
            </div>
          </div>

          <Button
            type="submit"
            :disabled="loading || !email.trim() || !password"
            class="w-full"
            size="lg"
          >
            <Loader2 v-if="loading" class="size-4 animate-spin" />
            <span v-else>Masuk</span>
            <ArrowRight v-if="!loading" class="size-4 ml-1" />
          </Button>
        </form>

        <div class="mt-10 pt-6 border-t border-border">
          <p class="text-[11px] text-muted-foreground/70 font-mono leading-relaxed">
            Sesi token disimpan di localStorage browser. Keluar untuk
            menghapusnya dari perangkat ini.
          </p>
        </div>
      </div>
    </div>

    <!-- Right: brand panel -->
    <div
      class="hidden md:flex relative overflow-hidden bg-primary text-primary-foreground"
    >
      <div
        class="absolute inset-0 opacity-[0.08]"
        style="
          background-image: radial-gradient(
              circle at 25% 30%,
              currentColor 1px,
              transparent 1px
            );
          background-size: 28px 28px;
        "
      ></div>
      <div class="relative m-auto max-w-md p-12">
        <p
          class="font-display italic text-5xl leading-[1.1] mb-6 tracking-tight"
        >
          Sebuah<BR />buku besar,<br />
          <span class="opacity-60">modern.</span>
        </p>
        <Separator class="my-6 bg-primary-foreground/20" />
        <p class="text-sm opacity-80 leading-relaxed">
          Catat setiap transaksi QRIS. Lacak status real-time. Kirim webhook
          bertanda tangan ke merchant. Tanpa perantara.
        </p>
      </div>
    </div>
  </div>
</template>
