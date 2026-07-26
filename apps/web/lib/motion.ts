import type { Transition, Variants } from "motion/react";

export const motionEase = [0.22, 1, 0.36, 1] as const;
export const motionEaseIn = [0.4, 0, 1, 1] as const;

export const motionDuration = {
  micro: 0.12,
  fast: 0.18,
  base: 0.24,
  layout: 0.36,
  slow: 0.48,
} as const;

export const motionTransition: Transition = {
  duration: motionDuration.base,
  ease: motionEase,
};

export const motionSpring: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 34,
  mass: 0.7,
};

export const motionInstant: Transition = { duration: 0 };

export const motionLayoutTransition: Transition = {
  duration: motionDuration.layout,
  ease: motionEase,
};

export const motionPressTransition: Transition = {
  type: "spring",
  stiffness: 520,
  damping: 32,
  mass: 0.55,
};

export const backdropVariants: Variants = {
  closed: { opacity: 0 },
  open: { opacity: 1, transition: { duration: motionDuration.base, ease: motionEase } },
};

export const dialogVariants: Variants = {
  closed: { opacity: 0, scale: 0.96, y: 8 },
  open: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: motionDuration.base, ease: motionEase },
  },
};

export const drawerVariants: Variants = {
  closed: { opacity: 0, x: 24 },
  open: {
    opacity: 1,
    x: 0,
    transition: { duration: motionDuration.layout, ease: motionEase },
  },
};

export function getSheetVariants(side: "top" | "right" | "bottom" | "left"): Variants {
  const closed = {
    top: { y: "-100%" },
    right: { x: "100%" },
    bottom: { y: "100%" },
    left: { x: "-100%" },
  }[side];

  return {
    closed: { ...closed, opacity: 0 },
    open: {
      x: 0,
      y: 0,
      opacity: 1,
      transition: { duration: motionDuration.layout, ease: motionEase },
    },
  };
}

export const collapseVariants: Variants = {
  closed: {
    height: 0,
    opacity: 0,
    transition: { duration: motionDuration.layout, ease: motionEaseIn },
  },
  open: {
    height: "auto",
    opacity: 1,
    transition: { duration: motionDuration.layout, ease: motionEase },
  },
};

export const listContainerVariants: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.035,
      delayChildren: 0.02,
    },
  },
  exit: {},
};

export const tabPanelVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: motionDuration.base, ease: motionEase },
  },
};

export const fadeSlideVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: motionTransition },
  exit: { opacity: 0, y: -4, transition: { duration: motionDuration.fast, ease: motionEaseIn } },
};

export const scaleFadeVariants: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1, transition: motionTransition },
  exit: {
    opacity: 0,
    scale: 0.98,
    transition: { duration: motionDuration.fast, ease: motionEaseIn },
  },
};

export const popoverVariants: Variants = {
  initial: { opacity: 0, scale: 0.96, y: -4 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: motionDuration.fast, ease: motionEase },
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    y: -2,
    transition: { duration: motionDuration.micro, ease: motionEaseIn },
  },
};

export const drawerContentVariants: Variants = {
  closed: { opacity: 0, x: 24 },
  open: { opacity: 1, x: 0, transition: { duration: motionDuration.base, ease: motionEase } },
  exit: { opacity: 0, x: 24, transition: { duration: motionDuration.fast, ease: motionEaseIn } },
};

export const listItemVariants: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: motionDuration.fast, ease: motionEase },
  },
  exit: { opacity: 0, y: -4, transition: { duration: motionDuration.micro, ease: motionEaseIn } },
};
