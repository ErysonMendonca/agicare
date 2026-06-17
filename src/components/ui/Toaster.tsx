"use client";

import { Toaster as SonnerToaster } from "sonner";

/** Toaster global estilizado ao design system (teal/verde da marca). */
export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      richColors
      closeButton
      toastOptions={{
        style: {
          borderRadius: "12px",
          fontFamily: "var(--font-inter), sans-serif",
        },
      }}
    />
  );
}
