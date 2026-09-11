import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { m } from "motion/react";

import { cn } from "@/lib/utils";
import { motionPressTransition } from "@/lib/motion";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-editorial-hairline-strong/60 bg-editorial-surface-strong text-editorial-ink shadow-2xs hover:bg-editorial-hairline hover:border-editorial-hairline-strong active:bg-editorial-hairline-strong/60 dark:border-editorial-hairline-strong/80 dark:bg-editorial-surface-strong dark:text-editorial-ink dark:hover:bg-editorial-hairline-strong/50",
        outline:
          "border-border bg-background hover:bg-editorial-hairline hover:text-foreground aria-expanded:bg-editorial-hairline aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-editorial-hairline aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-editorial-hairline hover:text-foreground aria-expanded:bg-editorial-hairline aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "border border-red-500/20 bg-red-500/8 text-red-600 shadow-2xs hover:bg-red-500/16 hover:border-red-500/40 hover:text-red-700 active:bg-red-500/24 focus-visible:border-red-500/40 focus-visible:ring-red-500/20 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-400 dark:hover:bg-red-500/25 dark:hover:border-red-500/50 dark:hover:text-red-300 transition-colors",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-md px-2.5 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7 rounded-md",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      render={
        <m.button
          whileHover={{ scale: 1.015 }}
          whileTap={{ scale: 0.96 }}
          transition={motionPressTransition}
        />
      }
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
