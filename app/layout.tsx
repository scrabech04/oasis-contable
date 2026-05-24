import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { getAccountProfiles, getActiveProfile } from "@/lib/account-profiles";
import { ThemeProvider } from "@/components/theme-provider";
import { PwaRegister } from "@/components/PwaRegister";

export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ContableApp - Software Contable",
  description: "Administracion contable para PYMES en Republica Dominicana",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "ContableApp",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport = {
  themeColor: "#2563eb",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [profiles, activeProfile] = await Promise.all([
    getAccountProfiles(),
    getActiveProfile(),
  ]);

  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <link href="https://fonts.googleapis.com/icon?family=Material+Icons+Round|Material+Icons+Outlined" rel="stylesheet" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <div className="flex h-screen w-full overflow-hidden bg-background print:h-auto print:block print:overflow-visible dark:bg-[#0b0f15]">
            <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 flex-col border-r bg-white transition-colors duration-200 dark:border-[#2a3442] dark:bg-[#151b23] md:flex">
              <Sidebar profiles={profiles} activeProfileId={activeProfile.id} />
            </aside>
            <main className="flex-1 overflow-y-auto custom-scrollbar print:ml-0 print:h-auto print:overflow-visible print:p-0 md:ml-64">
              <div className="mx-auto max-w-7xl p-4 pb-32 print:max-w-none print:p-0 md:p-8 md:pb-8">
                {children}
              </div>
            </main>
            <MobileBottomNav profiles={profiles} activeProfileId={activeProfile.id} />
            <PwaRegister />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
