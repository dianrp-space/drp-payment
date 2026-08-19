<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import { Loader2, Play, Send, RefreshCw } from "@lucide/vue";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, HttpError } from "@/lib/api";
import type { GopaySessionStatus } from "@/types";

const props = defineProps<{
  merchantId?: string;
}>();

const session = ref<GopaySessionStatus | null>(null);
const loadingStatus = ref(false);
const starting = ref(false);
const sending = ref(false);
const running = ref(false);
const output = ref("");
const offset = ref(0);
const inputText = ref("");
let pollTimer: ReturnType<typeof setInterval> | null = null;

async function loadStatus() {
  loadingStatus.value = true;
  try {
    session.value = await api.gopaySessionStatus(props.merchantId);
  } catch (e) {
    session.value = {
      success: false,
      connected: false,
      message: e instanceof HttpError ? e.message : "Gagal cek sesi GoBiz",
    };
  } finally {
    loadingStatus.value = false;
  }
}

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function pullOutput() {
  try {
    const res = await api.gopayLoginOutput(offset.value, props.merchantId);
    if (res.output) output.value += res.output;
    if (typeof res.offset === "number") offset.value = res.offset;
    running.value = !!res.running;
    if (!res.running) {
      stopPoll();
      await loadStatus();
    }
  } catch {
    /* keep polling until timeout */
  }
}

function startPoll() {
  stopPoll();
  pollTimer = setInterval(pullOutput, 1500);
}

async function startLogin() {
  starting.value = true;
  try {
    const res = await api.gopayLoginStart(props.merchantId);
    output.value = "";
    offset.value = 0;
    running.value = true;
    startPoll();
    await pullOutput();
    if (!res.success && !res.running) {
      toast.error(res.message || "Gagal mulai login");
    }
  } catch (e) {
    toast.error(e instanceof HttpError ? e.message : "Gagal mulai login");
    running.value = false;
  } finally {
    starting.value = false;
  }
}

async function sendInput() {
  const text = inputText.value.trim();
  if (!text) return;
  sending.value = true;
  try {
    await api.gopayLoginInput(text, props.merchantId);
    inputText.value = "";
    await pullOutput();
  } catch (e) {
    toast.error(e instanceof HttpError ? e.message : "Gagal kirim input");
  } finally {
    sending.value = false;
  }
}

watch(
  () => props.merchantId,
  () => {
    output.value = "";
    offset.value = 0;
    loadStatus();
  }
);

onMounted(loadStatus);
onUnmounted(stopPoll);
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between gap-2">
      <div class="text-sm">
        <span class="text-[11px] uppercase tracking-wider text-base-content/60">Sesi GoBiz</span>
        <p class="mt-0.5">
          <span
            v-if="session?.connected"
            class="inline-flex items-center rounded-full bg-success/15 text-success px-2 py-0.5 text-xs font-medium"
          >
            Terhubung
          </span>
          <span
            v-else
            class="inline-flex items-center rounded-full bg-warning/15 text-warning px-2 py-0.5 text-xs font-medium"
          >
            {{ session?.message || "Belum login" }}
          </span>
        </p>
      </div>
      <Button variant="ghost" size="sm" :disabled="loadingStatus" @click="loadStatus">
        <Loader2 v-if="loadingStatus" class="size-3.5 animate-spin" />
        <RefreshCw v-else class="size-3.5" />
      </Button>
    </div>

    <pre
      class="font-mono text-[11px] bg-base-200 border border-base-300 rounded-md p-3 min-h-28 max-h-48 overflow-auto whitespace-pre-wrap"
    >{{ output || "Output login.js akan tampil di sini setelah klik Mulai login." }}</pre>

    <div class="flex gap-2">
      <Input
        v-model="inputText"
        placeholder="Nomor HP GoBiz atau kode OTP"
        class="font-mono text-xs"
        :disabled="!running || sending"
        @keydown.enter.prevent="sendInput"
      />
      <Button size="sm" :disabled="!running || sending || !inputText.trim()" @click="sendInput">
        <Loader2 v-if="sending" class="size-3.5 animate-spin" />
        <Send v-else class="size-3.5" />
        Kirim
      </Button>
    </div>

    <Button
      variant="outline"
      size="sm"
      :disabled="starting || running"
      @click="startLogin"
    >
      <Loader2 v-if="starting" class="size-3.5 animate-spin" />
      <Play v-else class="size-3.5" />
      {{ running ? "Login sedang berjalan..." : "Mulai login OTP" }}
    </Button>
    <p class="text-[11px] text-base-content/60">
      Masukkan nomor HP saat diminta, lalu kode OTP 4 digit. Sesi tersimpan di instance gopay-qris.
    </p>
  </div>
</template>
