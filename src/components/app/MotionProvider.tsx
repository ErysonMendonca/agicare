"use client";

import { MotionConfig } from "framer-motion";
import { type ReactNode } from "react";

/** Respeita prefers-reduced-motion em todo o app. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
