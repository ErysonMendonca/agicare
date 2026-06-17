import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/Toaster";
import { MotionProvider } from "@/components/app/MotionProvider";
import { ThemeProvider } from "@/components/app/ThemeProvider";
import { ThemeScript, BrandVars } from "@/components/app/WhiteLabel";
import { getSettings } from "@/lib/data/settings";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AGIcare — Sistema de Gestão Clínica",
  description: "Sistema de Gestão Clínica Inteligente",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // White-label: tema/paleta da clínica (default teal quando sem config/sessão).
  const { branding } = await getSettings();

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
        <ThemeProvider mode={branding.theme}>
          <MotionProvider>{children}</MotionProvider>
        </ThemeProvider>
        <Toaster />
      </body>
    </html>
  );
}
