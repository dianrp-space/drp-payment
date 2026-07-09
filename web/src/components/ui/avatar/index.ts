import type { VariantProps } from "class-variance-authority"
import { cva } from "class-variance-authority"

export { default as Avatar } from "./Avatar.vue"
export { default as AvatarBadge } from "./AvatarBadge.vue"
export { default as AvatarFallback } from "./AvatarFallback.vue"
export { default as AvatarGroup } from "./AvatarGroup.vue"
export { default as AvatarGroupCount } from "./AvatarGroupCount.vue"
export { default as AvatarImage } from "./AvatarImage.vue"

export const avatarVariants = cva(
  'avatar size-8 data-[size=lg]:size-10 data-[size=sm]:size-6',
  {
    variants: {
      size: {
        sm: "",
        default: "",
        lg: "",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
)

export type AvatarVariants = VariantProps<typeof avatarVariants>
