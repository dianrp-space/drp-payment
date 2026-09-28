<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRoute, useRouter, RouterLink } from "vue-router";
import { toast } from "vue-sonner";
import {
  ArrowLeft,
  Copy,
  Loader2,
  RefreshCw,
  Power,
  PowerOff,
  Trash2,
  QrCode,
  Send,
  CheckCircle2,
  XCircle,
  Smartphone,
  Eye,
  EyeOff,
  Pencil,
  Upload,
} from "@lucide/vue";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import StatusBadge from "@/components/StatusBadge.vue";
import MerchantCreateResult from "@/components/MerchantCreateResult.vue";
import AlertFeedback from "@/components/AlertFeedback.vue";
import GopayLoginConsole from "@/components/GopayLoginConsole.vue";
import { api, HttpError } from "@/lib/api";
import { copyToClipboard, formatDateTime, shortId } from "@/lib/utils";
import { useBrandingStore } from "@/stores/branding";
import type { MerchantDetail, MerchantCreated, QrisMode } from "@/types";
import { useAlert } from "@/composables/useAlert";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import Swal from "sweetalert2";

async function confirm(opts: {
  title: string;
  text: string;
  confirmText?: string;
  destructive?: boolean;
}) {
  const result = await Swal.fire({
    title: opts.title,
    text: opts.text,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: opts.confirmText ?? "Ya",
    cancelButtonText: "Batal",
    confirmButtonColor: opts.destructive ? "#dc2626" : "#2563eb",
    reverseButtons: true,
  });
  return result.isConfirmed;
}

const route = useRoute();
const router = useRouter();
const branding = useBrandingStore();
const merchant = ref<MerchantDetail | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const qrImageBase64 = ref<string | null>(null);
const loadingQr = ref(false);

const webhookUrlInput = ref("");
const savingWebhook = ref(false);
const rotated = ref<MerchantCreated | null>(null);

const testingWebhook = ref(false);
const testResult = ref<{
  success: boolean;
  statusCode: number | null;
  responseBody: string | null;
  errorMessage: string | null;
  payload: unknown;
  signature: string;
} | null>(null);

const alert = useAlert();

// --- Edit merchant dialog ---
const editOpen = ref(false);
const editForm = ref({
  name: "",
  email: "",
  staticQris: "",
  qrisMode: "OTHERS" as QrisMode,
  useCustomGateway: false,
  gopayGatewayUrl: "",
  gopayGatewayApiKey: "",
  useCustomShopeepayGateway: false,
  shopeepayGatewayUrl: "",
  shopeepayGatewayApiKey: "",
});
const editing = ref(false);
const editConfirmOpen = ref(false);
const testingGopay = ref(false);
const gopayFetching = ref(false);
const gopayStaticQris = ref<string | null>(null);
const testingShopeepay = ref(false);
const shopeepayFetching = ref(false);
const shopeepayStaticQris = ref<string | null>(null);

function openEdit() {
  if (!merchant.value) return;
  editForm.value = {
    name: merchant.value.name,
    email: merchant.value.email ?? "",
    staticQris: merchant.value.staticQris ?? "",
    qrisMode: merchant.value.qrisMode ?? "OTHERS",
    useCustomGateway: !!merchant.value.gopayGatewayUrl,
    gopayGatewayUrl: merchant.value.gopayGatewayUrl ?? "",
    gopayGatewayApiKey: "",
    useCustomShopeepayGateway: !!merchant.value.shopeepayGatewayUrl,
    shopeepayGatewayUrl: merchant.value.shopeepayGatewayUrl ?? "",
    shopeepayGatewayApiKey: "",
  };
  gopayStaticQris.value = merchant.value.staticQris;
  shopeepayStaticQris.value = merchant.value.staticQris;
  editOpen.value = true;
}

async function saveEdit() {
  if (!merchant.value) return;
  editConfirmOpen.value = true;
}

async function saveEditConfirmed() {
  if (!merchant.value) return;
  editConfirmOpen.value = false;
  editing.value = true;
  try {
    const payload: {
      name?: string;
      email?: string | null;
      staticQris?: string;
      qrisMode?: QrisMode;
      gopayGatewayUrl?: string | null;
      gopayGatewayApiKey?: string | null;
      shopeepayGatewayUrl?: string | null;
      shopeepayGatewayApiKey?: string | null;
    } = {};
    if (editForm.value.name.trim() !== merchant.value.name) payload.name = editForm.value.name.trim();
    if ((editForm.value.email.trim() || null) !== merchant.value.email) payload.email = editForm.value.email.trim() || null;
    if (editForm.value.qrisMode === "GOPAY") {
      // QRIS statis Gopay selalu dari gateway — jangan kirim staticQris manual.
      payload.qrisMode = "GOPAY";
      if (editForm.value.useCustomGateway) {
        payload.gopayGatewayUrl = editForm.value.gopayGatewayUrl.trim();
        if (editForm.value.gopayGatewayApiKey.trim()) {
          payload.gopayGatewayApiKey = editForm.value.gopayGatewayApiKey.trim();
        }
      } else if (merchant.value.gopayGatewayUrl) {
        payload.gopayGatewayUrl = null;
        payload.gopayGatewayApiKey = null;
      }
    } else if (editForm.value.qrisMode === "SHOPEEPAY") {
      // QRIS statis ShopeePay selalu dari gateway — jangan kirim staticQris manual.
      payload.qrisMode = "SHOPEEPAY";
      if (editForm.value.useCustomShopeepayGateway) {
        payload.shopeepayGatewayUrl = editForm.value.shopeepayGatewayUrl.trim();
        if (editForm.value.shopeepayGatewayApiKey.trim()) {
          payload.shopeepayGatewayApiKey = editForm.value.shopeepayGatewayApiKey.trim();
        }
      } else if (merchant.value.shopeepayGatewayUrl) {
        payload.shopeepayGatewayUrl = null;
        payload.shopeepayGatewayApiKey = null;
      }
    } else {
      if (editForm.value.staticQris.trim() !== (merchant.value.staticQris ?? "")) {
        payload.staticQris = editForm.value.staticQris.trim();
      }
      if (editForm.value.qrisMode !== (merchant.value.qrisMode ?? "OTHERS")) {
        payload.qrisMode = editForm.value.qrisMode;
      }
    }
    if (Object.keys(payload).length === 0) {
      editOpen.value = false;
      return;
    }
    await api.updateMerchant(merchant.value.id, payload);
    alert.show("Merchant berhasil diperbarui");
    editOpen.value = false;
    await load();
  } catch (e) {
    toast.error(e instanceof HttpError ? e.message : "Gagal memperbarui merchant");
  } finally {
    editing.value = false;
  }
}

async function fetchEditShopeepayStaticQris() {
  shopeepayFetching.value = true;
  shopeepayStaticQris.value = null;
  try {
    const body =
      editForm.value.useCustomShopeepayGateway &&
      editForm.value.shopeepayGatewayUrl.trim() &&
      editForm.value.shopeepayGatewayApiKey.trim()
        ? {
            url: editForm.value.shopeepayGatewayUrl.trim(),
            apiKey: editForm.value.shopeepayGatewayApiKey.trim(),
          }
        : {};
    const res = await api.getShopeepayStaticQris(body);
    if (res.success && res.qrisStatic) {
      shopeepayStaticQris.value = res.qrisStatic;
      alert.show("QRIS statis ShopeePay berhasil diambil", "success");
    } else {
      alert.show(
        res.message || "Gagal mengambil QRIS statis dari gateway ShopeePay",
        "warning"
      );
    }
  } catch (e) {
    alert.show(
      e instanceof HttpError ? e.message : "Gagal mengambil QRIS statis",
      "error"
    );
  } finally {
    shopeepayFetching.value = false;
  }
}

async function testMerchantShopeepay(fromEdit = false) {
  testingShopeepay.value = true;
  try {
    const fromEditUrl =
      fromEdit && editForm.value.useCustomShopeepayGateway
        ? editForm.value.shopeepayGatewayUrl.trim()
        : "";
    const res = fromEditUrl
      ? await api.testShopeepayConnection({
          url: fromEditUrl,
          apiKey: editForm.value.shopeepayGatewayApiKey.trim() || undefined,
        })
      : await api.testShopeepayConnection();
    if (res.success) {
      alert.show(
        `Koneksi ShopeePay berhasil. Token ${res.tokenStatus === "invalid" ? "tidak valid" : "valid"}. ${res.message || ""}`,
        "success"
      );
    } else {
      alert.show(res.message || "Koneksi ShopeePay gagal", "error");
    }
  } catch (e) {
    alert.show(e instanceof HttpError ? e.message : "Gagal tes koneksi", "error");
  } finally {
    testingShopeepay.value = false;
  }
}

async function testMerchantGopay(fromEdit = false) {
  testingGopay.value = true;
  try {
    const body =
      fromEdit && editForm.value.useCustomGateway && editForm.value.gopayGatewayUrl.trim()
        ? {
            url: editForm.value.gopayGatewayUrl.trim(),
            apiKey: editForm.value.gopayGatewayApiKey.trim() || undefined,
            merchantId: merchant.value?.id,
          }
        : { merchantId: merchant.value?.id };
    if (fromEdit && body.url && !body.apiKey && !merchant.value?.hasGopayGatewayApiKey) {
      toast.error("Isi API key untuk tes koneksi");
      return;
    }
    const res = await api.testGopayConnection(
      body.url && body.apiKey
        ? { url: body.url, apiKey: body.apiKey }
        : { merchantId: merchant.value?.id }
    );
    if (res.success) {
      alert.show(
        `Koneksi Gopay berhasil. Token ${res.tokenStatus === "invalid" ? "tidak valid" : "valid"}. ${res.message || ""}`,
        "success"
      );
    } else {
      alert.show(res.message || "Koneksi Gopay gagal", "error");
    }
  } catch (e) {
    alert.show(e instanceof HttpError ? e.message : "Gagal tes koneksi", "error");
  } finally {
    testingGopay.value = false;
  }
}

async function fetchEditGopayStaticQris() {
  if (!merchant.value) return;
  gopayFetching.value = true;
  try {
    const body =
      editForm.value.useCustomGateway &&
      editForm.value.gopayGatewayUrl.trim() &&
      editForm.value.gopayGatewayApiKey.trim()
        ? {
            url: editForm.value.gopayGatewayUrl.trim(),
            apiKey: editForm.value.gopayGatewayApiKey.trim(),
          }
        : { merchantId: merchant.value.id };
    const res = await api.getGopayStaticQris(body);
    if (res.success && res.qrisStatic) {
      gopayStaticQris.value = res.qrisStatic;
      editForm.value.staticQris = res.qrisStatic;
      alert.show(
        `QRIS statis berhasil diambil dari gateway ${res.source === "merchant" ? "pribadi" : "global"}.`,
        "success"
      );
    } else {
      alert.show(
        res.message || "Gagal mengambil QRIS statis dari gateway GoBiz",
        "warning"
      );
    }
  } catch (e) {
    alert.show(
      e instanceof HttpError ? e.message : "Gagal mengambil QRIS statis",
      "error"
    );
  } finally {
    gopayFetching.value = false;
  }
}

// API key reveal state
const revealedApiKey = ref<string | null>(null);
const revealingKey = ref(false);
const avatarUploading = ref(false);
const avatarInput = ref<HTMLInputElement | null>(null);

function merchantInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0] || "")
      .join("")
      .toUpperCase() || "?"
  );
}

async function onAvatarFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !merchant.value) return;
  avatarUploading.value = true;
  try {
    const res = await api.uploadMerchantAvatar(merchant.value.id, file);
    merchant.value.avatarPath = res.merchant.avatarPath;
    toast.success("Foto profil diperbarui");
  } catch (err) {
    toast.error(err instanceof HttpError ? err.message : "Gagal upload foto");
  } finally {
    avatarUploading.value = false;
  }
}

async function removeAvatar() {
  if (!merchant.value?.avatarPath) return;
  const ok = await confirm({
    title: "Hapus foto profil?",
    text: "Merchant akan tampil tanpa foto di daftar.",
    confirmText: "Hapus",
    destructive: true,
  });
  if (!ok) return;
  avatarUploading.value = true;
  try {
    const res = await api.deleteMerchantAvatar(merchant.value.id);
    merchant.value.avatarPath = res.merchant.avatarPath;
    toast.success("Foto profil dihapus");
  } catch (err) {
    toast.error(err instanceof HttpError ? err.message : "Gagal menghapus foto");
  } finally {
    avatarUploading.value = false;
  }
}

async function testWebhook() {
  if (!merchant.value) return;
  testingWebhook.value = true;
  testResult.value = null;
  try {
    const res = await api.testMerchantWebhook(merchant.value.id);
    testResult.value = res;
    if (res.success) {
      alert.show("Webhook berhasil terkirim (HTTP " + res.statusCode + ")");
    } else if (res.errorMessage) {
      alert.show(res.errorMessage, "error");
    } else {
      alert.show("Webhook gagal (HTTP " + res.statusCode + ")", "error");
    }
  } catch (e) {
    testResult.value = { success: false, statusCode: null, responseBody: null, errorMessage: "Gagal terhubung ke server", payload: null, signature: "" };
    alert.show("Gagal mengirim webhook", "error");
  } finally {
    testingWebhook.value = false;
  }
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const res = await api.getMerchant(route.params.id as string);
    merchant.value = res.merchant;
    webhookUrlInput.value = res.merchant.webhookUrl ?? "";
    loadQr();
  } catch (e) {
    error.value = e instanceof HttpError ? e.message : "Gagal memuat merchant";
  } finally {
    loading.value = false;
  }
}

async function loadQr() {
  loadingQr.value = true;
  try {
    const res = await api.getMerchantQrImage(route.params.id as string);
    qrImageBase64.value = res.qrImageBase64;
  } catch {
    // non-critical
  } finally {
    loadingQr.value = false;
  }
}

// ... rest of functions unchanged

async function saveWebhook() {
  if (!merchant.value) return;
  savingWebhook.value = true;
  try {
    const url = webhookUrlInput.value.trim() || null;
    await api.updateWebhook(merchant.value.id, url);
    alert.show("Webhook URL berhasil diperbarui");
    await load();
  } catch (e) {
    const msg = e instanceof HttpError ? e.message : "Gagal menyimpan webhook URL";
    alert.show(msg, "error");
    toast.error(msg);
  } finally {
    savingWebhook.value = false;
  }
}

async function rotateKey() {
  if (!merchant.value) return;
  const ok = await confirm({
    title: "Rotasi API key?",
    text: "Key lama langsung tidak berlaku. Merchant harus update key di aplikasinya. Key baru hanya ditampilkan sekali.",
    confirmText: "Rotasi",
    destructive: true,
  });
  if (!ok) return;
  try {
    const res = await api.rotateApiKey(merchant.value.id);
    revealedApiKey.value = null;
    rotated.value = {
      ...merchant.value,
      apiKey: res.apiKey,
      webhookSecret: merchant.value.webhookSecret,
      callbackToken: merchant.value.callbackToken,
      notice: "Previous API key is now invalid.",
    };
    toast.success("API key dirotasi");
    await load();
  } catch (e) {
    toast.error(e instanceof HttpError ? e.message : "Gagal rotasi");
  }
}

async function rotateWebhookSecret() {
  if (!merchant.value) return;
  const ok = await confirm({
    title: "Rotasi webhook secret?",
    text: "Signature webhook merchant akan invalid sampai mereka update secret baru. Lakukan saat merchant siap.",
    confirmText: "Rotasi",
    destructive: true,
  });
  if (!ok) return;
  try {
    const res = await api.rotateWebhookSecret(merchant.value.id);
    toast.success("Webhook secret dirotasi");
    if (merchant.value) merchant.value.webhookSecret = res.webhookSecret;
  } catch (e) {
    toast.error("Gagal rotasi webhook secret");
  }
}

async function rotateCallbackToken() {
  if (!merchant.value) return;
  const isNew = !merchant.value.callbackToken;
  const ok = await confirm({
    title: isNew ? "Generate callback token?" : "Rotasi callback token?",
    text: "Token lama langsung tidak berlaku. Update Macrodroid merchant dengan token baru supaya callback tetap jalan.",
    confirmText: isNew ? "Generate" : "Rotasi",
    destructive: true,
  });
  if (!ok) return;
  try {
    const res = await api.rotateCallbackToken(merchant.value.id);
    toast.success("Callback token dirotasi");
    if (merchant.value) merchant.value.callbackToken = res.callbackToken;
  } catch (e) {
    toast.error(e instanceof HttpError ? e.message : "Gagal rotasi callback token");
  }
}

/** URL callback per-merchant, pakai APP_URL gateway sebagai base (bukan origin konsol,
 * supaya admin bisa copy URL yang benar-benar reachable dari HP detector). */
const callbackUrl = computed(() =>
  merchant.value ? branding.url(`/v2/callback/${merchant.value.id}`) : ""
);

async function setStatus(status: "ACTIVE" | "SUSPENDED") {
  if (!merchant.value) return;
  if (status === "SUSPENDED") {
    const ok = await confirm({
      title: "Nonaktifkan merchant?",
      text: "Semua request API merchant akan ditolak (403). Webhook tetap berjalan untuk transaksi yang sudah ada.",
      confirmText: "Nonaktifkan",
      destructive: true,
    });
    if (!ok) return;
  }
  try {
    await api.setMerchantStatus(merchant.value.id, status);
    alert.show(status === "ACTIVE" ? "Merchant berhasil diaktifkan" : "Merchant dinonaktifkan");
    await load();
  } catch (e) {
    toast.error("Gagal mengubah status");
  }
}

async function deleteMerchant() {
  if (!merchant.value) return;
  const ok = await confirm({
    title: "Hapus merchant?",
    text: "Semua transaksi merchant ini akan ikut terhapus. Tindakan ini tidak bisa dibatalkan.",
    confirmText: "Hapus",
    destructive: true,
  });
  if (!ok) return;
  try {
    await api.deleteMerchant(merchant.value.id);
    alert.show("Merchant berhasil dihapus");
    router.replace("/merchants");
  } catch (e) {
    toast.error(e instanceof HttpError ? e.message : "Gagal menghapus merchant");
  }
}

async function copy(text: string, label = "Disalin") {
  const ok = await copyToClipboard(text);
  if (ok) alert.show(label);
}

async function revealApiKey() {
  if (!merchant.value) return;
  if (revealedApiKey.value) {
    revealedApiKey.value = null; // toggle sembunyikan
    return;
  }
  revealingKey.value = true;
  try {
    const res = await api.revealMerchantApiKey(merchant.value.id);
    revealedApiKey.value = res.apiKey;
  } catch (e) {
    toast.error(e instanceof HttpError ? e.message : "Gagal memuat API key");
  } finally {
    revealingKey.value = false;
  }
}

async function copyApiKey() {
  if (!revealedApiKey.value) return;
  await copy(revealedApiKey.value, "API key disalin");
}

onMounted(load);
</script>

<template>
  <div class="p-6 md:p-10 max-w-4xl mx-auto">
    <RouterLink
      to="/merchants"
      class="inline-flex items-center gap-1.5 text-sm text-base-content/60 hover:text-base-content mb-6"
    >
      <ArrowLeft class="size-4" /> Kembali
    </RouterLink>

    <AlertFeedback
      :type="alert.type.value"
      :visible="alert.visible.value"
      :message="alert.message.value"
      @dismiss="alert.dismiss"
    />

    <template v-if="loading">
      <Skeleton class="h-10 w-64 mb-3" />
      <Skeleton class="h-4 w-96 mb-8" />
      <Skeleton class="h-64" />
    </template>

    <div v-else-if="error" class="text-error">{{ error }}</div>

    <template v-else-if="merchant">
      <header class="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div class="flex items-start gap-4 min-w-0">
          <div class="relative shrink-0">
            <img
              v-if="merchant.avatarPath"
              :src="merchant.avatarPath"
              :alt="merchant.name"
              class="size-16 rounded-full object-cover border border-base-300 bg-base-200"
            />
            <span
              v-else
              class="flex items-center justify-center size-16 rounded-full bg-primary/10 text-primary text-lg font-semibold border border-base-300"
            >
              {{ merchantInitials(merchant.name) }}
            </span>
            <input
              ref="avatarInput"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              class="hidden"
              @change="onAvatarFile"
            />
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-3 mb-2">
              <StatusBadge :status="merchant.status" />
              <span
                class="text-[11px] font-medium px-2 py-0.5 rounded-full border border-base-300"
              >
                {{ merchant.qrisMode === "GOPAY" ? "Gopay" : merchant.qrisMode === "SHOPEEPAY" ? "ShopeePay" : "Others" }}
              </span>
              <span class="text-[11px] text-base-content/60 font-mono">
                {{ shortId(merchant.id) }}
              </span>
            </div>
            <h1 class="font-display text-4xl italic truncate">{{ merchant.name }}</h1>
            <p class="text-sm text-base-content/60 mt-1">
              {{ merchant.email ?? "Tanpa email" }} · dibuat
              {{ formatDateTime(merchant.createdAt) }}
            </p>
            <div class="flex flex-wrap gap-2 mt-3">
              <Button
                variant="outline"
                size="sm"
                :disabled="avatarUploading"
                @click="avatarInput?.click()"
              >
                <Loader2 v-if="avatarUploading" class="size-3.5 animate-spin" />
                <Upload v-else class="size-3.5" />
                {{ merchant.avatarPath ? "Ganti foto" : "Upload foto" }}
              </Button>
              <Button
                v-if="merchant.avatarPath"
                variant="ghost"
                size="sm"
                class="text-base-content/60 hover:text-error"
                :disabled="avatarUploading"
                @click="removeAvatar"
              >
                <Trash2 class="size-3.5" /> Hapus foto
              </Button>
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" @click="openEdit">
          <Pencil class="size-3.5" /> Edit
        </Button>
      </header>

      <!-- Rotated key display -->
      <MerchantCreateResult
        v-if="rotated"
        :merchant="rotated"
        class="mb-6"
      />

      <div class="grid gap-4">
        <div class="grid gap-4 md:grid-cols-2">
        <!-- Credentials -->
        <Card class="p-6">
          <h2 class="font-display text-2xl italic mb-4">Kredensial</h2>

          <!-- QR Preview -->
          <div class="mb-5">
            <p class="text-[11px] uppercase tracking-wider text-base-content/60 mb-2">
              QRIS Merchant
            </p>
            <div class="flex gap-4 items-start">
              <div
                class="inline-flex items-center justify-center bg-white rounded-md border border-base-300 p-2 shrink-0"
              >
                <img
                  v-if="qrImageBase64"
                  :src="qrImageBase64"
                  alt="QRIS"
                  class="size-32 object-contain"
                />
                <div
                  v-else-if="loadingQr"
                  class="size-32 flex items-center justify-center text-base-content/60"
                >
                  <Loader2 class="size-5 animate-spin" />
                </div>
                <div
                  v-else
                  class="size-32 flex flex-col items-center justify-center gap-1 text-base-content/60"
                >
                  <QrCode class="size-6" />
                  <span class="text-[10px]">
                    {{ merchant.staticQris ? "Gagal muat" : "Belum ada QRIS" }}
                  </span>
                </div>
              </div>
              <div class="flex-1 min-w-0 space-y-2">
                <div v-if="merchant.qrisName">
                  <p class="text-[11px] uppercase tracking-wider text-base-content/60 mb-0.5">
                    Nama QRIS
                  </p>
                  <p class="font-display text-xl italic">{{ merchant.qrisName }}</p>
                  <p v-if="merchant.qrisCity" class="text-xs text-base-content/60">
                    {{ merchant.qrisCity }}
                  </p>
                </div>
                <div v-if="merchant.qrisProvider">
                  <p class="text-[11px] uppercase tracking-wider text-base-content/60 mb-0.5">
                    Provider QRIS
                  </p>
                  <p class="text-sm font-mono">{{ merchant.qrisProvider }}</p>
                </div>
                <div>
                  <p class="text-[11px] uppercase tracking-wider text-base-content/60 mb-0.5">
                    String QRIS
                  </p>
                  <code class="block font-mono text-[11px] bg-base-200 border border-base-300 rounded px-2.5 py-2 break-all leading-relaxed max-h-20 overflow-y-auto">
                    {{ merchant.staticQris ?? "(belum ada — ambil dari GoBiz lewat Edit)" }}
                  </code>
                </div>
              </div>
            </div>
          </div>

          <dl class="space-y-3 text-sm">
            <div>
              <dt class="text-[11px] uppercase tracking-wider text-base-content/60 mb-1">
                API Key
              </dt>
              <dd class="flex flex-col gap-2">
                <!-- Raw key (revealed) -->
                <div
                  v-if="revealedApiKey"
                  class="flex items-center gap-2"
                >
                  <code
                    class="flex-1 font-mono text-xs bg-base-200 border border-base-300 rounded px-2 py-1.5 break-all"
                  >{{ revealedApiKey }}</code>
                  <Button variant="ghost" size="sm" class="shrink-0" @click="copyApiKey">
                    <Copy class="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="shrink-0 text-base-content/60"
                    @click="revealedApiKey = null"
                  >
                    <EyeOff class="size-3.5" />
                  </Button>
                </div>
                <!-- Hint (default) -->
                <div v-else class="flex items-center justify-between gap-2">
                  <code class="font-mono text-xs bg-base-200 border border-base-300 rounded px-2 py-1 flex-1">
                    {{ merchant.apiKeyHint }}
                  </code>
                  <div class="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      :disabled="revealingKey"
                      @click="revealApiKey"
                      :title="'Tampilkan API key utuh'"
                    >
                      <Loader2 v-if="revealingKey" class="size-3.5 animate-spin" />
                      <Eye v-else class="size-3.5" />
                    </Button>
                    <Button variant="outline" size="sm" @click="rotateKey">
                      <RefreshCw class="size-3.5" /> Rotasi
                    </Button>
                  </div>
                </div>
                <p class="text-[11px] text-base-content/60">
                  Klik <Eye class="inline size-3 align-text-bottom" /> untuk
                  tampilkan &amp; salin key utuh.
                </p>
              </dd>
            </div>

            <div>
              <dt class="text-[11px] uppercase tracking-wider text-base-content/60 mb-1">
                Webhook Secret
              </dt>
              <dd class="flex items-center justify-between gap-2">
                <code class="font-mono text-xs break-all bg-base-200 border border-base-300 rounded px-2 py-1 flex-1">
                  {{ merchant.webhookSecret }}
                </code>
                <div class="flex gap-1">
                  <Button variant="ghost" size="sm" @click="copy(merchant.webhookSecret)">
                    <Copy class="size-3.5" />
                  </Button>
                  <Button variant="outline" size="sm" @click="rotateWebhookSecret">
                    <RefreshCw class="size-3.5" />
                  </Button>
                </div>
              </dd>
            </div>
          </dl>
        </Card>

        <!-- Webhook config -->
        <Card class="p-6">
          <h2 class="font-display text-2xl italic mb-4">Webhook</h2>
          <div class="flex flex-col gap-2">
            <Label for="webhook-url" class="text-xs uppercase tracking-wider">
              URL Callback
            </Label>
            <Input
              id="webhook-url"
              v-model="webhookUrlInput"
              type="text"
              placeholder="https://app.merchant.com/qris-callback"
              class="font-mono text-xs"
            />
            <p class="text-[11px] text-base-content/60">
              http/https, termasuk IP LAN (mis. http://192.168.1.10:5678/webhook).
              Kosongkan untuk menonaktifkan webhook.
            </p>
            <Button
              class="mt-2 self-start"
              size="sm"
              @click="saveWebhook"
              :disabled="savingWebhook"
            >
              <Loader2 v-if="savingWebhook" class="size-4 animate-spin" />
              <span v-else>Simpan</span>
            </Button>
          </div>

          <Separator class="my-5" />

          <div>
            <p class="text-[11px] uppercase tracking-wider text-base-content/60 mb-2">
              Test Webhook
            </p>
            <p class="text-xs text-base-content/60 mb-3">
              Kirim sample payload <code class="font-mono text-[11px]">payment.success</code>
              ke URL webhook merchant untuk verifikasi integrasi.
            </p>
            <Button
              size="sm"
              variant="secondary"
              :disabled="!merchant.webhookUrl || testingWebhook"
              @click="testWebhook"
            >
              <Loader2 v-if="testingWebhook" class="size-4 animate-spin" />
              <Send v-else class="size-3.5" />
              {{ testingWebhook ? "Mengirim..." : "Test Webhook" }}
            </Button>
            <div
              v-if="testResult"
              class="mt-3 text-xs space-y-1"
            >
              <div class="flex items-center gap-1.5">
                <CheckCircle2
                  v-if="testResult.success"
                  class="size-3.5 text-success shrink-0"
                />
                <XCircle
                  v-else
                  class="size-3.5 text-error shrink-0"
                />
                <span v-if="testResult.statusCode">
                  HTTP {{ testResult.statusCode }}
                </span>
                <span v-else-if="testResult.errorMessage" class="text-error">
                  {{ testResult.errorMessage }}
                </span>
              </div>
              <div v-if="testResult.responseBody" class="mt-1">
                <details class="text-base-content/60">
                  <summary class="cursor-pointer text-[11px]">Response body</summary>
                  <pre class="mt-1 font-mono text-[10px] bg-base-200 border border-base-300 rounded p-2 max-h-32 overflow-auto whitespace-pre-wrap">{{ testResult.responseBody }}</pre>
                </details>
              </div>
            </div>
          </div>

          <Separator class="my-5" />

          <div>
            <p class="text-[11px] uppercase tracking-wider text-base-content/60 mb-2">
              Status merchant
            </p>
            <div class="flex gap-2">
              <Button
                v-if="merchant.status !== 'ACTIVE'"
                variant="outline"
                size="sm"
                @click="setStatus('ACTIVE')"
              >
                <Power class="size-3.5" /> Aktifkan
              </Button>
              <Button
                v-if="merchant.status === 'ACTIVE'"
                variant="outline"
                size="sm"
                @click="setStatus('SUSPENDED')"
              >
                <PowerOff class="size-3.5" /> Nonaktifkan
              </Button>
            </div>
            <Separator class="my-5" />
            <div class="flex gap-2">
              <Button variant="outline" size="sm" @click="openEdit">
                <Pencil class="size-3.5" /> Edit
              </Button>
              <Button variant="ghost" size="sm" class="text-base-content/60 hover:text-error" @click="deleteMerchant">
                <Trash2 class="size-3.5" /> Hapus merchant
              </Button>
            </div>
          </div>
        </Card>
        </div>

        <Card v-if="merchant.qrisMode === 'GOPAY'" class="p-6">
          <h2 class="font-display text-2xl italic mb-1">Gopay Gateway</h2>
          <p class="text-xs text-base-content/60 mb-4">
            Verifikasi pembayaran via instance gopay-qris, bukan MacroDroid.
            {{ merchant.gopayGatewayUrl ? "Merchant ini memakai gateway sendiri." : "Memakai gateway global dari Integrasi." }}
          </p>
          <Separator class="mb-5" />
          <dl class="text-sm space-y-2 mb-4">
            <div class="flex justify-between gap-4">
              <dt class="text-base-content/60">URL</dt>
              <dd class="font-mono text-xs break-all text-right">
                {{ merchant.gopayGatewayUrl || "Global" }}
              </dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-base-content/60">API Key</dt>
              <dd class="font-mono text-xs">
                {{ merchant.gopayGatewayApiKeyHint || (merchant.gopayGatewayUrl ? "—" : "Global") }}
              </dd>
            </div>
          </dl>
          <Button
            variant="outline"
            size="sm"
            class="mb-5"
            :disabled="testingGopay"
            @click="testMerchantGopay(false)"
          >
            <Loader2 v-if="testingGopay" class="size-3.5 animate-spin" />
            Test koneksi
          </Button>
          <GopayLoginConsole
            v-if="merchant.gopayGatewayUrl"
            :merchant-id="merchant.id"
          />
          <p v-else class="text-[11px] text-base-content/60">
            Login GoBiz untuk gateway global ada di halaman Integrasi.
          </p>
        </Card>

        <Card v-if="merchant.qrisMode === 'SHOPEEPAY'" class="p-6">
          <h2 class="font-display text-2xl italic mb-1">ShopeePay Gateway</h2>
          <p class="text-xs text-base-content/60 mb-4">
            Verifikasi pembayaran via instance qris-shopeepay, bukan MacroDroid.
            {{ merchant.shopeepayGatewayUrl ? "Merchant ini memakai gateway sendiri." : "Memakai gateway global dari Integrasi." }}
          </p>
          <Separator class="mb-5" />
          <dl class="text-sm space-y-2 mb-4">
            <div class="flex justify-between gap-4">
              <dt class="text-base-content/60">URL</dt>
              <dd class="font-mono text-xs break-all text-right">
                {{ merchant.shopeepayGatewayUrl || "Global" }}
              </dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-base-content/60">API Key</dt>
              <dd class="font-mono text-xs">
                {{ merchant.shopeepayGatewayApiKeyHint || (merchant.shopeepayGatewayUrl ? "—" : "Global") }}
              </dd>
            </div>
          </dl>
          <Button
            variant="outline"
            size="sm"
            :disabled="testingShopeepay"
            @click="testMerchantShopeepay(false)"
          >
            <Loader2 v-if="testingShopeepay" class="size-3.5 animate-spin" />
            Test koneksi
          </Button>
        </Card>

        <!-- Macrodroid callback (per-merchant) -->
        <Card v-if="merchant.qrisMode === 'OTHERS'" class="p-6">
          <div class="flex items-center gap-2 mb-1">
            <Smartphone class="size-4 text-primary" />
            <h2 class="font-display text-2xl italic">Callback Macrodroid</h2>
          </div>
          <p class="text-xs text-base-content/60 mb-4">
            Konfigurasi pendeteksi notifikasi per-merchant. Tiap merchant punya
            URL &amp; token sendiri — hanya cocokkan transaksi merchant ini.
          </p>
          <Separator class="mb-5" />

          <div class="flex flex-col gap-5">
            <!-- Callback URL -->
            <div class="flex flex-col gap-1.5">
              <Label class="text-xs uppercase tracking-wider">URL Callback</Label>
              <div class="flex gap-2">
                <code
                  class="flex-1 font-mono text-[11px] bg-base-200 border border-base-300 rounded px-2.5 py-2 break-all leading-relaxed"
                >{{ callbackUrl }}</code>
                <Button
                  variant="ghost"
                  size="sm"
                  class="shrink-0"
                  :disabled="!merchant.callbackToken"
                  @click="copy(callbackUrl)"
                >
                  <Copy class="size-3.5" />
                </Button>
              </div>
              <p class="text-[11px] text-base-content/60">
                URL ini yang dipakai Macrodroid. Base = <code class="font-mono">APP_URL</code> di env backend.
              </p>
            </div>

            <!-- Callback token -->
            <div class="flex flex-col gap-1.5">
              <Label class="text-xs uppercase tracking-wider">Callback Token</Label>
              <div class="flex items-center justify-between gap-2">
                <code
                  v-if="merchant.callbackToken"
                  class="font-mono text-xs break-all bg-base-200 border border-base-300 rounded px-2 py-1 flex-1"
                >{{ merchant.callbackToken }}</code>
                <span v-else class="text-xs text-base-content/60 italic">
                  Belum dibuat — klik Rotasi untuk generate.
                </span>
                <div class="flex gap-1 shrink-0">
                  <Button
                    v-if="merchant.callbackToken"
                    variant="ghost"
                    size="sm"
                    @click="copy(merchant.callbackToken!)"
                  >
                    <Copy class="size-3.5" />
                  </Button>
                  <Button variant="outline" size="sm" @click="rotateCallbackToken">
                    <RefreshCw class="size-3.5" />
                    <span v-if="!merchant.callbackToken">Generate</span>
                    <span v-else>Rotasi</span>
                  </Button>
                </div>
              </div>
              <p class="text-[11px] text-base-content/60">
                Kirim sebagai header <code class="font-mono">X-Callback-Token</code>
                di setiap HTTP POST ke URL callback.
              </p>
            </div>

            <!-- Setup snippet -->
            <div class="rounded-md border border-base-300 bg-base-200 p-4">
              <p class="text-[11px] uppercase tracking-wider text-base-content/60 mb-2">
                Setup singkat Macrodroid
              </p>
              <ol class="text-xs text-base-content/60 space-y-1.5 list-decimal pl-4 leading-relaxed">
                <li>
                  Trigger: <strong>Notification received</strong> → pilih
                  e-wallet / m-banking merchant ini.
                </li>
                <li>Action: <strong>HTTP Request</strong> → method
                  <code class="font-mono">POST</code>, URL =
                  <code class="font-mono">[v=callback_url]</code>.</li>
                <li>Custom header:
                  <code class="font-mono">X-Callback-Token</code> =
                  <code class="font-mono">[v=callback_token]</code>.</li>
                <li>Content-Type:
                  <code class="font-mono">application/json</code>, body =
                  <code class="font-mono">{"text":"[notification_text]"}</code>.</li>
              </ol>
            </div>
          </div>
        </Card>
      </div>
    </template>

    <!-- Edit dialog -->
    <Dialog v-model:open="editOpen">
      <DialogContent class="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit merchant</DialogTitle>
        </DialogHeader>
        <div class="space-y-4">
          <div>
            <Label for="edit-name" class="text-xs uppercase tracking-wider">Nama</Label>
            <Input id="edit-name" v-model="editForm.name" class="mt-1" />
          </div>
          <div>
            <Label for="edit-email" class="text-xs uppercase tracking-wider">Email</Label>
            <Input id="edit-email" v-model="editForm.email" type="email" class="mt-1" />
          </div>
          <div>
            <Label class="text-xs uppercase tracking-wider">Tipe QRIS</Label>
            <div class="flex gap-2 mt-1">
              <Button
                type="button"
                size="sm"
                :variant="editForm.qrisMode === 'OTHERS' ? 'default' : 'outline'"
                @click="editForm.qrisMode = 'OTHERS'"
              >
                Others
              </Button>
              <Button
                type="button"
                size="sm"
                :variant="editForm.qrisMode === 'GOPAY' ? 'default' : 'outline'"
                @click="editForm.qrisMode = 'GOPAY'"
              >
                Gopay
              </Button>
              <Button
                type="button"
                size="sm"
                :variant="editForm.qrisMode === 'SHOPEEPAY' ? 'default' : 'outline'"
                @click="editForm.qrisMode = 'SHOPEEPAY'"
              >
                ShopeePay
              </Button>
            </div>
          </div>
          <div v-if="editForm.qrisMode === 'OTHERS'">
            <Label for="edit-qris" class="text-xs uppercase tracking-wider">String QRIS</Label>
            <Input id="edit-qris" v-model="editForm.staticQris" class="mt-1 font-mono text-xs" />
          </div>
          <div v-if="editForm.qrisMode === 'GOPAY'" class="space-y-3 rounded-md border border-base-300 p-3">
            <div class="flex gap-2">
              <Button
                type="button"
                size="sm"
                :variant="!editForm.useCustomGateway ? 'default' : 'outline'"
                @click="editForm.useCustomGateway = false"
              >
                Gateway global
              </Button>
              <Button
                type="button"
                size="sm"
                :variant="editForm.useCustomGateway ? 'default' : 'outline'"
                @click="editForm.useCustomGateway = true"
              >
                Gateway sendiri
              </Button>
            </div>
            <template v-if="editForm.useCustomGateway">
              <Input
                v-model="editForm.gopayGatewayUrl"
                placeholder="https://gopay.domainkamu.com"
                class="font-mono text-xs"
              />
              <Input
                v-model="editForm.gopayGatewayApiKey"
                type="password"
                :placeholder="merchant?.hasGopayGatewayApiKey ? 'Kosongkan jika tidak diganti' : 'API key gateway'"
                class="font-mono text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                :disabled="testingGopay"
                @click="testMerchantGopay(true)"
              >
                <Loader2 v-if="testingGopay" class="size-3.5 animate-spin" />
                Test koneksi
              </Button>
            </template>
            <div class="rounded-md border border-base-300 bg-base-200/50 p-3 flex flex-col gap-2">
              <div class="flex items-center justify-between gap-2">
                <p class="text-[11px] uppercase tracking-wider text-base-content/60">
                  QRIS statis GoBiz
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  :disabled="gopayFetching"
                  @click="fetchEditGopayStaticQris"
                >
                  <Loader2 v-if="gopayFetching" class="size-3.5 animate-spin" />
                  <RefreshCw v-else class="size-3.5" />
                  Ambil dari GoBiz
                </Button>
              </div>
              <p v-if="gopayStaticQris" class="font-mono text-[11px] bg-base-100 border border-base-300 rounded px-2.5 py-2 break-all leading-relaxed max-h-20 overflow-y-auto">
                {{ gopayStaticQris }}
              </p>
              <p v-else class="text-xs text-base-content/60">
                {{
                  gopayFetching
                    ? "Mengambil QRIS statis dari gateway GoBiz..."
                    : "Belum ada QRIS statis. Klik 'Ambil dari GoBiz' untuk memuat otomatis, atau simpan perubahan (server akan mengambil dari gateway)."
                }}
              </p>
            </div>
          </div>
          <div v-if="editForm.qrisMode === 'SHOPEEPAY'" class="space-y-3 rounded-md border border-base-300 p-3">
            <div class="flex gap-2">
              <Button
                type="button"
                size="sm"
                :variant="!editForm.useCustomShopeepayGateway ? 'default' : 'outline'"
                @click="editForm.useCustomShopeepayGateway = false"
              >
                Gateway global
              </Button>
              <Button
                type="button"
                size="sm"
                :variant="editForm.useCustomShopeepayGateway ? 'default' : 'outline'"
                @click="editForm.useCustomShopeepayGateway = true"
              >
                Gateway sendiri
              </Button>
            </div>
            <template v-if="editForm.useCustomShopeepayGateway">
              <Input
                v-model="editForm.shopeepayGatewayUrl"
                placeholder="https://shopee.domainkamu.com"
                class="font-mono text-xs"
              />
              <Input
                v-model="editForm.shopeepayGatewayApiKey"
                type="password"
                :placeholder="merchant?.hasShopeepayGatewayApiKey ? 'Kosongkan jika tidak diganti' : 'API key gateway'"
                class="font-mono text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                :disabled="testingShopeepay"
                @click="testMerchantShopeepay(true)"
              >
                <Loader2 v-if="testingShopeepay" class="size-3.5 animate-spin" />
                Test koneksi
              </Button>
            </template>
            <div class="rounded-md border border-base-300 bg-base-200/50 p-3 flex flex-col gap-2">
              <div class="flex items-center justify-between gap-2">
                <p class="text-[11px] uppercase tracking-wider text-base-content/60">
                  QRIS statis ShopeePay
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  :disabled="shopeepayFetching"
                  @click="fetchEditShopeepayStaticQris"
                >
                  <Loader2 v-if="shopeepayFetching" class="size-3.5 animate-spin" />
                  <RefreshCw v-else class="size-3.5" />
                  Ambil dari gateway
                </Button>
              </div>
              <p v-if="shopeepayStaticQris" class="font-mono text-[11px] bg-base-100 border border-base-300 rounded px-2.5 py-2 break-all leading-relaxed max-h-20 overflow-y-auto">
                {{ shopeepayStaticQris }}
              </p>
              <p v-else class="text-xs text-base-content/60">
                {{
                  shopeepayFetching
                    ? "Mengambil QRIS statis dari gateway ShopeePay..."
                    : "Belum ada QRIS statis. Klik 'Ambil dari gateway' untuk memuat otomatis, atau simpan perubahan (server akan mengambil dari gateway)."
                }}
              </p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" @click="editOpen = false">Batal</Button>
          <Button :disabled="editing" @click="saveEdit">
            <Loader2 v-if="editing" class="size-4 animate-spin mr-1" />
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Edit confirm -->
    <AlertDialog :open="editConfirmOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Simpan perubahan?</AlertDialogTitle>
          <AlertDialogDescription>
            Data merchant akan diperbarui dengan perubahan yang dimasukkan.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="ghost" @click="editConfirmOpen = false">Batal</Button>
          <Button @click="saveEditConfirmed">Ya, simpan</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
