import type { VariantProps } from "class-variance-authority"
import { cva } from "class-variance-authority"

export { default as Alert } from "./Alert.vue"
export { default as AlertAction } from "./AlertAction.vue"
export { default as AlertDescription } from "./AlertDescription.vue"
export { default as AlertTitle } from "./AlertTitle.vue"

export const alertVariants = cva('alert', {
  variants: {
    variant: {
      default: '',
      destructive: 'alert-error',
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

export type AlertVariants = VariantProps<typeof alertVariants>
