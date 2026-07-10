import { ref } from "vue";

export type AlertType = "success" | "error" | "info" | "warning";

export function useAlert(autoDismissMs = 3500) {
  const visible = ref(false);
  const type = ref<AlertType>("success");
  const message = ref("");
  let timer: ReturnType<typeof setTimeout> | null = null;

  function show(msg: string, t: AlertType = "success") {
    message.value = msg;
    type.value = t;
    visible.value = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      visible.value = false;
    }, autoDismissMs);
  }

  function dismiss() {
    visible.value = false;
    if (timer) clearTimeout(timer);
  }

  return { visible, type, message, show, dismiss };
}
