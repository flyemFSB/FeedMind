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

export const fadeSlideVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: motionTransition },
  exit: { opacity: 0, y: -4, transition: { duration: motionDuration.fast, ease: motionEaseIn } },
};

// 手风琴高度开合（height 0↔auto）：用户触发、有界、小子树的展开动画，高度由内容决定、
// transform 无法表达——属 no-layout-property-animation 规则文档明示的 intentional exception，
// 集中在此统一记录，不在各使用点重复豁免
export const accordionVariants: Variants = {
  closed: {
    height: 0,
    opacity: 0,
    transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
  },
  open: {
    height: "auto",
    opacity: 1,
    transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
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
