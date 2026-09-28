<script setup lang="ts">
import { ref, onMounted } from "vue";
import { toast } from "vue-sonner";
import { Loader2, Save, Plug } from "@lucide/vue";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { api, HttpError } from "@/lib/api";
import { useAlert } from "@/composables/useAlert";
import AlertFeedback from "@/components/AlertFeedback.vue";
import GopayLoginConsole from "@/components/GopayLoginConsole.vue";

const alert = useAlert();
const activeTab = ref("gopay");
const gopayUrl = ref("");
const gopayApiKey = ref("");
const gopayHasKey = ref(false);
const gopayHint = ref<string | null>(null);
const savingGopay = ref(false);
const testingGopay = ref(false);
const gopayFetching = ref(false);
const gopayStaticQris = ref<string | null>(null);

const shopeepayUrl = ref("");
const shopeepayApiKey = ref("");
const shopeepayHasKey = ref(false);
const shopeepayHint = ref<string | null>(null);
const savingShopeepay = ref(false);
const testingShopeepay = ref(false);
const shopeepayFetching = ref(false);
const shopeepayStaticQris = ref<string | null>(null);

async function loadGopaySettings() {
  try {
    const res = await api.getGopayGatewaySettings();
    gopayUrl.value = res.settings.gopayGatewayUrl ?? "";
    gopayHasKey.value = res.settings.hasGopayGatewayApiKey;
    gopayHint.value = res.settings.gopayGatewayApiKeyHint;
    gopayStaticQris.value = res.settings.gopayQrisStatic;
    gopayApiKey.value = "";
  } catch (e) {
    toast.error(e instanceof HttpError ? e.message : "Gagal memuat setting Gopay");
  }
}

async function saveGopaySettings() {
  savingGopay.value = true;
  try {
    const body: { gopayGatewayUrl?: string | null; gopayGatewayApiKey?: string | null } = {
      gopayGatewayUrl: gopayUrl.value.trim() || null,
    };
    if (gopayApiKey.value.trim()) body.gopayGatewayApiKey = gopayApiKey.value.trim();
    if (!gopayUrl.value.trim()) body.gopayGatewayApiKey = null;
    const res = await api.updateGopayGatewaySettings(body);
    gopayUrl.value = res.settings.gopayGatewayUrl ?? "";
    gopayHasKey.value = res.settings.hasGopayGatewayApiKey;
    gopayHint.value = res.settings.gopayGatewayApiKeyHint;
    gopayApiKey.value = "";
    toast.success("Setting Gopay disimpan");
  } catch (e) {
    toast.error(e instanceof HttpError ? e.message : "Gagal menyimpan setting Gopay");
  } finally {
    savingGopay.value = false;
  }
}

async function testGlobalGopay() {
  testingGopay.value = true;
  try {
    const body =
      gopayUrl.value.trim() && gopayApiKey.value.trim()
        ? { url: gopayUrl.value.trim(), apiKey: gopayApiKey.value.trim() }
        : {};
    const res = await api.testGopayConnection(body);
    if (res.success) {
      // Cek juga QRIS statis dari gateway untuk info lengkap
      let qrisInfo = "";
      try {
        const qrisRes = await api.getGopayStaticQris(body);
        if (qrisRes.success && qrisRes.qrisStatic) {
          gopayStaticQris.value = qrisRes.qrisStatic;
          qrisInfo = " QRIS statis GoBiz: ADA.";
        } else {
          qrisInfo = " QRIS statis GoBiz: BELUM ADA — isi QRIS_STATIC di .env gateway.";
        }
      } catch {
        qrisInfo = " (tidak bisa cek QRIS statis)";
      }
      alert.show(
        `Koneksi Gopay berhasil. Token ${res.tokenStatus === "invalid" ? "tidak valid" : "valid"}.${qrisInfo}`,
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

async function fetchGlobalGopayStaticQris() {
  const body =
    gopayUrl.value.trim() && gopayApiKey.value.trim()
      ? { url: gopayUrl.value.trim(), apiKey: gopayApiKey.value.trim() }
      : {};
  gopayFetching.value = true;
  try {
    const res = await api.getGopayStaticQris(body);
    if (res.success && res.qrisStatic) {
      gopayStaticQris.value = res.qrisStatic;
      alert.show("QRIS statis GoBiz berhasil diambil", "success");
    } else {
      gopayStaticQris.value = null;
      alert.show(
        res.message || "QRIS statis belum tersedia di gateway",
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

async function loadShopeepaySettings() {
  try {
    const res = await api.getShopeepayGatewaySettings();
    shopeepayUrl.value = res.settings.shopeepayGatewayUrl ?? "";
    shopeepayHasKey.value = res.settings.hasShopeepayGatewayApiKey;
    shopeepayHint.value = res.settings.shopeepayGatewayApiKeyHint;
    shopeepayStaticQris.value = res.settings.shopeepayQrisStatic;
    shopeepayApiKey.value = "";
  } catch (e) {
    toast.error(
      e instanceof HttpError ? e.message : "Gagal memuat setting ShopeePay"
    );
  }
}

async function saveShopeepaySettings() {
  savingShopeepay.value = true;
  try {
    const body: {
      shopeepayGatewayUrl?: string | null;
      shopeepayGatewayApiKey?: string | null;
    } = {
      shopeepayGatewayUrl: shopeepayUrl.value.trim() || null,
    };
    if (shopeepayApiKey.value.trim())
      body.shopeepayGatewayApiKey = shopeepayApiKey.value.trim();
    if (!shopeepayUrl.value.trim()) body.shopeepayGatewayApiKey = null;
    const res = await api.updateShopeepayGatewaySettings(body);
    shopeepayUrl.value = res.settings.shopeepayGatewayUrl ?? "";
    shopeepayHasKey.value = res.settings.hasShopeepayGatewayApiKey;
    shopeepayHint.value = res.settings.shopeepayGatewayApiKeyHint;
    shopeepayApiKey.value = "";
    toast.success("Setting ShopeePay disimpan");
  } catch (e) {
    toast.error(
      e instanceof HttpError ? e.message : "Gagal menyimpan setting ShopeePay"
    );
  } finally {
    savingShopeepay.value = false;
  }
}

function shopeepayInputOverride() {
  return shopeepayUrl.value.trim() && shopeepayApiKey.value.trim()
    ? { url: shopeepayUrl.value.trim(), apiKey: shopeepayApiKey.value.trim() }
    : {};
}

async function testShopeepayConnection() {
  testingShopeepay.value = true;
  try {
    const res = await api.testShopeepayConnection(shopeepayInputOverride());
    if (res.success) {
      let qrisInfo = "";
      try {
        const qrisRes = await api.getShopeepayStaticQris(
          shopeepayInputOverride()
        );
        if (qrisRes.success && qrisRes.qrisStatic) {
          shopeepayStaticQris.value = qrisRes.qrisStatic;
          qrisInfo = " QRIS statis ShopeePay: ADA.";
        } else {
          qrisInfo =
            " QRIS statis ShopeePay: BELUM ADA — isi QRIS_STATIC di .env gateway.";
        }
      } catch {
        qrisInfo = " (tidak bisa cek QRIS statis)";
      }
      alert.show(
        `Koneksi ShopeePay berhasil. Token ${res.tokenStatus === "invalid" ? "tidak valid" : "valid"}.${qrisInfo}`,
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

async function fetchShopeepayStaticQris() {
  shopeepayFetching.value = true;
  try {
    const res = await api.getShopeepayStaticQris(shopeepayInputOverride());
    if (res.success && res.qrisStatic) {
      shopeepayStaticQris.value = res.qrisStatic;
      alert.show("QRIS statis ShopeePay berhasil diambil", "success");
    } else {
      shopeepayStaticQris.value = null;
      alert.show(
        res.message || "QRIS statis belum tersedia di gateway",
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

onMounted(() => {
  loadGopaySettings();
  loadShopeepaySettings();
});
</script>

<template>
  <div class="p-6 md:p-10 max-w-3xl mx-auto">
    <header class="mb-8">
      <p class="text-[11px] uppercase tracking-[0.15em] text-base-content/60 mb-2">
        Sistem
      </p>
      <h1 class="font-display text-4xl italic">Integrasi</h1>
      <p class="text-sm text-base-content/60 mt-2">
        Hubungkan layanan pihak ketiga untuk verifikasi pembayaran.
      </p>
    </header>

    <Tabs v-model="activeTab" class="gap-4">
      <TabsList>
        <TabsTrigger value="gopay">GoPay</TabsTrigger>
        <TabsTrigger value="shopeepay">ShopeePay</TabsTrigger>
      </TabsList>

      <TabsContent value="gopay">
        <Card class="p-6">
          <div class="flex items-start justify-between gap-4 mb-1">
            <div>
              <h2 class="font-display text-2xl italic">Gopay Gateway (Global)</h2>
              <p class="text-xs text-base-content/60 mt-1">
                Instance gopay-qris default. Merchant Gopay tanpa URL sendiri memakai setting ini.
              </p>
            </div>
          </div>
          <Separator class="mb-5" />

          <form @submit.prevent="saveGopaySettings" class="flex flex-col gap-4">
            <div class="flex flex-col gap-1.5">
              <Label for="gopay-url" class="text-xs uppercase tracking-wider">URL gateway</Label>
              <Input
                id="gopay-url"
                v-model="gopayUrl"
                placeholder="https://gopay.domainkamu.com"
                class="font-mono text-xs"
                :disabled="savingGopay"
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <Label for="gopay-key" class="text-xs uppercase tracking-wider">API Key</Label>
              <Input
                id="gopay-key"
                v-model="gopayApiKey"
                type="password"
                :placeholder="gopayHasKey ? `Tersimpan ${gopayHint ?? ''} — isi untuk ganti` : 'API_KEY dari .env gopay-qris'"
                class="font-mono text-xs"
                :disabled="savingGopay"
              />
            </div>
            <div class="flex flex-wrap gap-2">
              <Button type="submit" :disabled="savingGopay">
                <Loader2 v-if="savingGopay" class="size-4 animate-spin" />
                <Save v-else class="size-4" />
                Simpan
              </Button>
              <Button
                type="button"
                variant="outline"
                :disabled="testingGopay"
                @click="testGlobalGopay"
              >
                <Loader2 v-if="testingGopay" class="size-4 animate-spin" />
                <Plug v-else class="size-4" />
                Test koneksi
              </Button>
            </div>
          </form>

          <Separator class="my-5" />

          <div class="flex flex-col gap-2 rounded-md border border-base-300 p-3">
            <div class="flex items-center justify-between gap-2">
              <p class="text-xs uppercase tracking-wider text-base-content/60">
                QRIS statis GoBiz (global)
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                @click="fetchGlobalGopayStaticQris"
              >
                <Loader2 v-if="gopayFetching" class="size-3.5 animate-spin" />
                Ambil QRIS statis
              </Button>
            </div>
            <p v-if="gopayStaticQris" class="font-mono text-[11px] bg-base-200 border border-base-300 rounded px-2.5 py-2 break-all leading-relaxed max-h-20 overflow-y-auto">
              {{ gopayStaticQris }}
            </p>
            <p v-else class="text-xs text-base-content/60">
              Belum dimuat. Klik "Ambil QRIS statis" untuk melihat QRIS_STATIC dari .env gateway.
            </p>
          </div>

          <Separator class="my-5" />
          <GopayLoginConsole />
        </Card>
      </TabsContent>

      <TabsContent value="shopeepay">
        <Card class="p-6">
          <div class="flex items-start justify-between gap-4 mb-1">
            <div>
              <h2 class="font-display text-2xl italic">ShopeePay Gateway (Global)</h2>
              <p class="text-xs text-base-content/60 mt-1">
                Instance qris-shopeepay default. Verifikasi pembayaran lewat polling
                transaksi dari akun ShopeePay merchant.
              </p>
            </div>
          </div>
          <Separator class="mb-5" />

          <form @submit.prevent="saveShopeepaySettings" class="flex flex-col gap-4">
            <div class="flex flex-col gap-1.5">
              <Label for="shopeepay-url" class="text-xs uppercase tracking-wider">
                URL gateway
              </Label>
              <Input
                id="shopeepay-url"
                v-model="shopeepayUrl"
                placeholder="https://shopee.domainkamu.com"
                class="font-mono text-xs"
                :disabled="savingShopeepay"
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <Label for="shopeepay-key" class="text-xs uppercase tracking-wider">
                API Key
              </Label>
              <Input
                id="shopeepay-key"
                v-model="shopeepayApiKey"
                type="password"
                :placeholder="shopeepayHasKey ? `Tersimpan ${shopeepayHint ?? ''} — isi untuk ganti` : 'API_KEY dari .env qris-shopeepay'"
                class="font-mono text-xs"
                :disabled="savingShopeepay"
              />
            </div>
            <div class="flex flex-wrap gap-2">
              <Button type="submit" :disabled="savingShopeepay">
                <Loader2 v-if="savingShopeepay" class="size-4 animate-spin" />
                <Save v-else class="size-4" />
                Simpan
              </Button>
              <Button
                type="button"
                variant="outline"
                :disabled="testingShopeepay"
                @click="testShopeepayConnection"
              >
                <Loader2 v-if="testingShopeepay" class="size-4 animate-spin" />
                <Plug v-else class="size-4" />
                Test koneksi
              </Button>
            </div>
          </form>

          <Separator class="my-5" />

          <div class="flex flex-col gap-2 rounded-md border border-base-300 p-3">
            <div class="flex items-center justify-between gap-2">
              <p class="text-xs uppercase tracking-wider text-base-content/60">
                QRIS statis ShopeePay (global)
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                :disabled="shopeepayFetching"
                @click="fetchShopeepayStaticQris"
              >
                <Loader2 v-if="shopeepayFetching" class="size-3.5 animate-spin" />
                Ambil QRIS statis
              </Button>
            </div>
            <p
              v-if="shopeepayStaticQris"
              class="font-mono text-[11px] bg-base-200 border border-base-300 rounded px-2.5 py-2 break-all leading-relaxed max-h-20 overflow-y-auto"
            >
              {{ shopeepayStaticQris }}
            </p>
            <p v-else class="text-xs text-base-content/60">
              Belum dimuat. Klik "Ambil QRIS statis" untuk membaca QRIS_STATIC dari
              .env gateway.
            </p>
          </div>
        </Card>
      </TabsContent>
    </Tabs>

    <AlertFeedback
      :type="alert.type.value"
      :visible="alert.visible.value"
      :message="alert.message.value"
      @dismiss="alert.dismiss"
    />
  </div>
</template>
