import type { VariantProps } from "class-variance-authority"
import { cva } from "class-variance-authority"

export { default as Badge } from "./Badge.vue"

export const badgeVariants = cva(
  'badge',
  {
    variants: {
      variant: {
        default: 'badge-primary',
        secondary: 'badge-secondary',
        destructive: 'badge-error',
        outline: 'badge-outline',
        ghost: 'badge-ghost',
        link: 'text-primary underline-offset-4 hover:underline',
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)
export type BadgeVariants = VariantProps<typeof badgeVariants>
