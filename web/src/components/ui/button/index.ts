import type { VariantProps } from "class-variance-authority"
import { cva } from "class-variance-authority"

export { default as Button } from "./Button.vue"

export const buttonVariants = cva(
  'btn [&_svg:not([class*=size-])]:size-4',
  {
    variants: {
      variant: {
        default: 'btn-primary',
        outline: 'btn-outline',
        secondary: 'btn-secondary',
        ghost: 'btn-ghost',
        destructive: 'btn-error',
        link: 'btn-link',
      },
      size: {
        "default": '',
        "xs": 'btn-xs',
        "sm": 'btn-sm',
        "lg": 'btn-lg',
        "icon": 'btn-square',
        "icon-xs": 'btn-square btn-xs',
        "icon-sm": 'btn-square btn-sm',
        "icon-lg": 'btn-square btn-lg',
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)
export type ButtonVariants = VariantProps<typeof buttonVariants>
