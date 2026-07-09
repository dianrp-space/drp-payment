import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { api, clearToken, setToken, getToken } from "@/lib/api";

export const useAuthStore = defineStore("auth", () => {
  const token = ref<string | null>(getToken());
  const verifying = ref(false);
  const verified = ref(false);
  const userEmail = ref<string | null>(null);
  const userName = ref<string | null>(null);

  const isAuthenticated = computed(() => !!token.value && verified.value);

  async function login(email: string, password: string): Promise<void> {
    const res = await api.login(email, password);
    setToken(res.apiToken);
    token.value = res.apiToken;
    userEmail.value = res.email;
    userName.value = res.name;
    verifying.value = true;
    try {
      await api.verifyToken();
      verified.value = true;
    } catch (e) {
      clearToken();
      token.value = null;
      userEmail.value = null;
      userName.value = null;
      verified.value = false;
      console.error("[auth] verifyToken gagal setelah login:", e);
      throw e;
    } finally {
      verifying.value = false;
    }
  }

  function logout(): void {
    clearToken();
    token.value = null;
    userEmail.value = null;
    userName.value = null;
    verified.value = false;
  }

  /** Called on app boot: verify persisted token. Idempotent — safe to call concurrently. */
  async function bootstrap(): Promise<void> {
    if (!token.value) return;
    if (verified.value) return;
    if (verifying.value) {
      // Another caller is already verifying; wait for it via polling the ref.
      await new Promise<void>((resolve) => {
        const stop = watch(verifying, (v) => {
          if (!v) {
            stop();
            resolve();
          }
        });
      });
      return;
    }
    verifying.value = true;
    try {
      const res = await api.verifyToken();
      verified.value = true;
      userEmail.value = res.email;
      userName.value = res.name;
    } catch {
      clearToken();
      token.value = null;
      userEmail.value = null;
      userName.value = null;
      verified.value = false;
    } finally {
      verifying.value = false;
    }
  }

  function setEmail(email: string) {
    userEmail.value = email;
  }

  function setName(name: string) {
    userName.value = name;
  }

  return { token, verifying, verified, userEmail, userName, isAuthenticated, login, logout, bootstrap, setEmail, setName };
});
