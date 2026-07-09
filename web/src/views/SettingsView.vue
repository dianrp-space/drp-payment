<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { toast } from "vue-sonner";
import {
  Loader2, Save, Upload, X, RotateCcw, Image as ImageIcon, User, Lock,
} from "lucide-vue-next";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuthStore } from "@/stores/auth";
import { useBrandingStore } from "@/stores/branding";
import { api, HttpError } from "@/lib/api";
import Swal from "sweetalert2";

const auth = useAuthStore();
const branding = useBrandingStore();

// --- Branding form state ---
const DEFAULT_APP_NAME = "DRP Payment Gateway";
const appName = ref("");
const appLogoBase64 = ref<string | null>(null);
const faviconBase64 = ref<string | null>(null);
const logoPreview = ref<string | null>(null);
const faviconPreview = ref<string | null>(null);
const saving = ref(false);
const logoInput = ref<HTMLInputElement | null>(null);
const faviconInput = ref<HTMLInputElement | null>(null);

const hasChanges = computed(() => {
  if (appName.value.trim() !== branding.appName) return true;
  if ((appLogoBase64.value ?? null) !== (branding.appLogoBase64 ?? null)) return true;
  if ((faviconBase64.value ?? null) !== (branding.faviconBase64 ?? null)) return true;
  return false;
});

function syncFormFromStore() {
  appName.value = branding.appName === DEFAULT_APP_NAME ? "" : branding.appName;
  appLogoBase64.value = branding.appLogoBase64;
  faviconBase64.value = branding.faviconBase64;
  logoPreview.value = branding.appLogoBase64;
  faviconPreview.value = branding.faviconBase64;
}

// --- File -> data URL helpers ---
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Gagal membaca file"));
    reader.readAsDataURL(file);
  });
}

function validateImageFile(file: File, maxBytes = 400_000): string | null {
  if (!file.type.startsWith("image/")) return "File harus berupa gambar";
  if (file.size > maxBytes) {
    const kb = Math.round(file.size / 1024);
    return `Ukuran terlalu besar (${kb}KB). Maks ~375KB.`;
  }
  return null;
}

async function handleLogoFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const err = validateImageFile(file);
  if (err) {
    toast.error(err);
    input.value = "";
    return;
  }
  try {
    const dataUrl = await fileToDataUrl(file);
    appLogoBase64.value = dataUrl;
    logoPreview.value = dataUrl;
  } catch {
    toast.error("Gagal memproses logo");
  } finally {
    input.value = "";
  }
}

async function handleFaviconFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const err = validateImageFile(file);
  if (err) {
    toast.error(err);
    input.value = "";
    return;
  }
  try {
    const dataUrl = await fileToDataUrl(file);
    faviconBase64.value = dataUrl;
    faviconPreview.value = dataUrl;
  } catch {
    toast.error("Gagal memproses favicon");
  } finally {
    input.value = "";
  }
}

function clearLogo() {
  appLogoBase64.value = null;
  logoPreview.value = null;
}

function clearFavicon() {
  faviconBase64.value = null;
  faviconPreview.value = null;
}

function useLogoAsFavicon() {
  if (!appLogoBase64.value) {
    toast.error("Upload logo dulu");
    return;
  }
  faviconBase64.value = appLogoBase64.value;
  faviconPreview.value = appLogoBase64.value;
}

async function saveBranding() {
  const confirmed = await Swal.fire({
    title: "Simpan branding?",
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Ya, simpan",
    cancelButtonText: "Batal",
    reverseButtons: true,
  });
  if (!confirmed.isConfirmed) return;
  saving.value = true;
  try {
    const res = await api.updateBranding({
      appName: appName.value.trim() || null,
      appLogoBase64: appLogoBase64.value,
      faviconBase64: faviconBase64.value,
    });
    branding.hydrate(res.branding);
    syncFormFromStore();
    toast.success("Branding disimpan");
  } catch (e) {
    const msg = e instanceof HttpError ? e.message : "Gagal menyimpan branding";
    toast.error(msg);
  } finally {
    saving.value = false;
  }
}

function resetBranding() {
  appName.value = "";
  appLogoBase64.value = null;
  faviconBase64.value = null;
  logoPreview.value = null;
  faviconPreview.value = null;
}

// --- Credential form state ---
const credName = ref("");
const credEmail = ref("");
const oldPassword = ref("");
const newPassword = ref("");
const savingCred = ref(false);

async function saveCredentials() {
  const confirmed = await Swal.fire({
    title: "Simpan kredensial?",
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Ya, simpan",
    cancelButtonText: "Batal",
    reverseButtons: true,
  });
  if (!confirmed.isConfirmed) return;
  savingCred.value = true;
  try {
    const body: { name?: string; email?: string; oldPassword?: string; newPassword?: string } = {};
    if (credName.value.trim() && credName.value.trim() !== auth.userName) {
      body.name = credName.value.trim();
    }
    if (credEmail.value.trim() && credEmail.value.trim() !== auth.userEmail) {
      body.email = credEmail.value.trim();
    }
    if (oldPassword.value && newPassword.value) {
      body.oldPassword = oldPassword.value;
      body.newPassword = newPassword.value;
    }
    if (!body.name && !body.email && !body.newPassword) {
      toast.error("Tidak ada yang diubah");
      return;
    }
    const res = await api.updateCredentials(body);
    auth.setEmail(res.email);
    auth.setName(res.name);
    credName.value = res.name;
    credEmail.value = res.email;
    oldPassword.value = "";
    newPassword.value = "";
    toast.success("Kredensial diperbarui");
  } catch (e) {
    const msg = e instanceof HttpError ? e.message : "Gagal menyimpan kredensial";
    toast.error(msg);
  } finally {
    savingCred.value = false;
  }
}

onMounted(async () => {
  // Pastikan branding store sudah loaded (public endpoint), lalu sync form.
  if (!branding.loaded) await branding.load();
  syncFormFromStore();
  credName.value = auth.userName ?? "";
  credEmail.value = auth.userEmail ?? "";
});
</script>

<template>
  <div class="p-6 md:p-10 max-w-3xl mx-auto">
    <header class="mb-8">
      <p class="text-[11px] uppercase tracking-[0.15em] text-base-content/60 mb-2">
        Sistem
      </p>
      <h1 class="font-display text-4xl italic">Pengaturan</h1>
    </header>

    <!-- Branding card -->
    <Card class="p-6 mb-4">
      <div class="flex items-start justify-between gap-4 mb-1">
        <div>
          <h2 class="font-display text-2xl italic">Branding</h2>
          <p class="text-xs text-base-content/60 mt-1">
            Ubah nama app, logo, dan favicon. Berlaku untuk seluruh konsol.
          </p>
        </div>
      </div>
      <Separator class="mb-5" />

      <form @submit.prevent="saveBranding" class="flex flex-col gap-5">
        <!-- App name -->
        <div class="flex flex-col gap-1.5">
          <Label for="app-name" class="text-xs uppercase tracking-wider">
            Nama aplikasi
          </Label>
          <Input
            id="app-name"
            v-model="appName"
            :placeholder="DEFAULT_APP_NAME"
            :disabled="saving"
          />
          <p class="text-[11px] text-base-content/60">
            Kosongkan untuk kembalikan ke default
            <span class="font-mono">{{ DEFAULT_APP_NAME }}</span>.
          </p>
        </div>

        <!-- Logo -->
        <div class="flex flex-col gap-1.5">
          <Label class="text-xs uppercase tracking-wider">Logo</Label>
          <div class="flex items-center gap-4">
            <div
              class="flex items-center justify-center size-16 rounded-md border border-base-300 bg-base-200/30 overflow-hidden shrink-0"
            >
              <img
                v-if="logoPreview"
                :src="logoPreview"
                alt="logo preview"
                class="h-full w-full object-contain"
              />
              <ImageIcon v-else class="size-6 text-base-content/60/50" />
            </div>
            <div class="flex flex-col gap-2">
              <div class="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  :disabled="saving"
                  @click="logoInput?.click()"
                >
                  <Upload class="size-3.5" /> Upload
                </Button>
                <Button
                  v-if="logoPreview"
                  type="button"
                  variant="ghost"
                  size="sm"
                  class="text-base-content/60 hover:text-error"
                  :disabled="saving"
                  @click="clearLogo"
                >
                  <X class="size-3.5" /> Hapus
                </Button>
              </div>
              <p class="text-[11px] text-base-content/60">
                PNG/SVG/JPG · kotak · maks ~375KB. Kosongkan = pakai ikon default.
              </p>
              <input
                ref="logoInput"
                type="file"
                accept="image/*"
                class="sr-only"
                :disabled="saving"
                @change="handleLogoFile"
              />
            </div>
          </div>
        </div>

        <!-- Favicon -->
        <div class="flex flex-col gap-1.5">
          <Label class="text-xs uppercase tracking-wider">Favicon</Label>
          <div class="flex items-center gap-4">
            <div
              class="flex items-center justify-center size-10 rounded-md border border-base-300 bg-base-200/30 overflow-hidden shrink-0"
            >
              <img
                v-if="faviconPreview"
                :src="faviconPreview"
                alt="favicon preview"
                class="h-full w-full object-contain"
              />
              <ImageIcon v-else class="size-4 text-base-content/60/50" />
            </div>
            <div class="flex flex-col gap-2">
              <div class="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  :disabled="saving"
                  @click="faviconInput?.click()"
                >
                  <Upload class="size-3.5" /> Upload
                </Button>
                <Button
                  v-if="appLogoBase64"
                  type="button"
                  variant="ghost"
                  size="sm"
                  :disabled="saving"
                  @click="useLogoAsFavicon"
                >
                  Pakai logo
                </Button>
                <Button
                  v-if="faviconPreview"
                  type="button"
                  variant="ghost"
                  size="sm"
                  class="text-base-content/60 hover:text-error"
                  :disabled="saving"
                  @click="clearFavicon"
                >
                  <X class="size-3.5" /> Hapus
                </Button>
              </div>
              <p class="text-[11px] text-base-content/60">
                SVG/PNG/ICO · bujur · maks ~375KB. Kosongkan = pakai
                <span class="font-mono">/favicon.svg</span> default.
              </p>
              <input
                ref="faviconInput"
                type="file"
                accept="image/*"
                class="sr-only"
                :disabled="saving"
                @change="handleFaviconFile"
              />
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2 pt-1">
          <Button type="submit" :disabled="saving || !hasChanges">
            <Loader2 v-if="saving" class="size-4 animate-spin" />
            <Save v-else class="size-4" />
            <span>Simpan branding</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            :disabled="saving || !hasChanges"
            @click="resetBranding"
          >
            <RotateCcw class="size-4" /> Reset form
          </Button>
        </div>
      </form>
    </Card>

    <!-- Credential card -->
    <Card class="p-6 mb-4">
      <div class="flex items-start justify-between gap-4 mb-1">
        <div>
          <h2 class="font-display text-2xl italic">Akun</h2>
          <p class="text-xs text-base-content/60 mt-1">
            Ubah email atau password admin.
          </p>
        </div>
      </div>
      <Separator class="mb-5" />

      <form @submit.prevent="saveCredentials" class="flex flex-col gap-5">
        <div class="flex flex-col gap-1.5">
          <Label for="cred-name" class="text-xs uppercase tracking-wider">
            <User class="size-3 inline mr-1" />Nama
          </Label>
          <Input
            id="cred-name"
            v-model="credName"
            :disabled="savingCred"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label for="cred-email" class="text-xs uppercase tracking-wider">
            <User class="size-3 inline mr-1" />Email
          </Label>
          <Input
            id="cred-email"
            v-model="credEmail"
            type="email"
            :disabled="savingCred"
          />
        </div>

        <Separator />

        <div class="flex flex-col gap-1.5">
          <Label for="old-password" class="text-xs uppercase tracking-wider">
            <Lock class="size-3 inline mr-1" />Password lama
          </Label>
          <Input
            id="old-password"
            v-model="oldPassword"
            type="password"
            autocomplete="current-password"
            :disabled="savingCred"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label for="new-password" class="text-xs uppercase tracking-wider">
            <Lock class="size-3 inline mr-1" />Password baru
          </Label>
          <Input
            id="new-password"
            v-model="newPassword"
            type="password"
            autocomplete="new-password"
            :disabled="savingCred"
          />
        </div>

        <div class="flex items-center gap-2 pt-1">
          <Button type="submit" :disabled="savingCred">
            <Loader2 v-if="savingCred" class="size-4 animate-spin" />
            <Save v-else class="size-4" />
            <span>Simpan kredensial</span>
          </Button>
        </div>
      </form>
    </Card>

    <Card class="p-6">
      <h2 class="font-display text-2xl italic mb-1">Tentang</h2>
      <p class="text-xs text-base-content/60 mb-4">
        {{ branding.appName }} · QRIS-only console.
      </p>
      <Separator class="mb-4" />
      <dl class="text-sm space-y-2 font-mono text-xs">
        <div class="flex justify-between">
          <dt class="text-base-content/60">Versi</dt>
          <dd>v2.0.0</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-base-content/60">Stack</dt>
          <dd>Node · Vue 3 · Prisma · Postgres</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-base-content/60">Pemilik</dt>
          <dd>DRP Network Solutions</dd>
        </div>
      </dl>
    </Card>
  </div>
</template>
