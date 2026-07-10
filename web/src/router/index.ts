import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useBrandingStore } from "@/stores/branding";

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: (_to, _from, savedPosition) => savedPosition ?? { top: 0 },
  routes: [
    {
      path: "/login",
      name: "login",
      component: () => import("@/views/LoginView.vue"),
      meta: { public: true, title: "Login" },
    },
    {
      path: "/",
      component: () => import("@/components/layout/AppLayout.vue"),
      children: [
        {
          path: "",
          name: "dashboard",
          component: () => import("@/views/DashboardView.vue"),
          meta: { title: "Dashboard" },
        },
        {
          path: "transactions",
          name: "transactions",
          component: () => import("@/views/TransactionsView.vue"),
          meta: { title: "Transaksi" },
        },
        {
          path: "transactions/:id",
          name: "transaction-detail",
          component: () => import("@/views/TransactionDetailView.vue"),
          meta: { title: "Detail Transaksi" },
        },
        {
          path: "merchants",
          name: "merchants",
          component: () => import("@/views/MerchantsView.vue"),
          meta: { title: "Merchant" },
        },
        {
          path: "merchants/:id",
          name: "merchant-detail",
          component: () => import("@/views/MerchantDetailView.vue"),
          meta: { title: "Detail Merchant" },
        },
        {
          path: "settings",
          name: "settings",
          component: () => import("@/views/SettingsView.vue"),
          meta: { title: "Pengaturan" },
        },
        {
          path: "api-docs",
          name: "api-docs",
          component: () => import("@/views/ApiDocsView.vue"),
          meta: { title: "API Docs" },
        },
        {
          path: "audit-log",
          name: "audit-log",
          component: () => import("@/views/AuditLogView.vue"),
          meta: { title: "Audit Log" },
        },
        {
          path: "backups",
          name: "backups",
          component: () => import("@/views/BackupView.vue"),
          meta: { title: "Backup & Restore" },
        },
      ],
    },
    {
      path: "/:pathMatch(.*)*",
      name: "not-found",
      component: () => import("@/views/NotFoundView.vue"),
      meta: { public: true, title: "Tidak ditemukan" },
    },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (auth.token && !auth.verified) {
    await auth.bootstrap();
  }

  if (!to.meta.public && !auth.isAuthenticated) {
    return { name: "login", query: { redirect: to.fullPath } };
  }
  if (to.name === "login" && auth.isAuthenticated) {
    const redirect = (to.query.redirect as string) || "/";
    return redirect;
  }
});

router.afterEach((to) => {
  const branding = useBrandingStore();
  const base = branding.appName || "DRP Payment Gateway";
  document.title = to.meta.title ? `${to.meta.title} · ${base}` : base;
});

export default router;
