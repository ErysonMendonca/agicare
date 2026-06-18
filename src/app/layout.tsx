import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/app/ThemeProvider";
import { ThemeScript, BrandVars } from "@/components/app/WhiteLabel";
import { getSettings, type BrandingSettings } from "@/lib/data/settings";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AGIcare — Sistema de Gestão Clínica",
  description: "Sistema de Gestão Clínica Inteligente",
};

/**
 * Branding padrão (teal). Usado como fallback quando `getSettings()` não pode
 * rodar — em especial no prerender das páginas especiais do Next (`/_not-found`,
 * `/_global-error`), que renderizam o root layout SEM request/sessão. Os
 * providers de UI (framer-motion/sonner) ficam no layout do grupo `(app)`, fora
 * desse caminho, para não quebrarem o prerender dessas páginas.
 */
const DEFAULT_BRANDING: BrandingSettings = {
  theme: "claro",
  primaryColor: "#0db8c2",
  accentColor: "#0be0ae",
  logoUrl: null,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // White-label: tema/paleta da clínica (default teal quando sem config/sessão
  // ou no prerender das páginas especiais, onde getSettings não tem contexto).
  let branding: BrandingSettings = DEFAULT_BRANDING;
  try {
    branding = (await getSettings()).branding;
  } catch {
    branding = DEFAULT_BRANDING;
  }

  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} h-full antialiased`}
      // O ThemeScript ajusta a classe `.dark` antes da hidratação.
      suppressHydrationWarning
    >
      <body className="min-h-full">
        <ThemeScript mode={branding.theme} />
        <BrandVars branding={branding} />
        <ThemeProvider mode={branding.theme}>{children}</ThemeProvider>
      </body>
    </html>
  );
}
