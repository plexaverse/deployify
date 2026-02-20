import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Toaster } from 'sonner';
import { ThemeProvider } from '@/components/ThemeProvider';
import { config } from "@/lib/config";
import Script from 'next/script';
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

export const metadata: Metadata = {
  title: "Deployify - Deploy Next.js Apps to GCP",
  description: "A self-hosted Vercel-like deployment platform for Next.js applications using Google Cloud Platform",
  keywords: ["deployment", "nextjs", "gcp", "cloud run", "vercel alternative"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let hostname = 'localhost';
  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    hostname = new URL(config.appUrl).hostname;
  } catch (e) {
    console.error('[Layout] Failed to parse APP_URL:', config.appUrl, e);
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geist.variable} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-white focus:text-black focus:rounded-md font-bold"
          >
            Skip to content
          </a>
          {children}
          <Toaster position="bottom-right" />
          <Script
            src="/deployify-insights.js"
            data-api-key="dp_37c36f31aeca110699c7cacc6c2476f2b780ca652cc19daa"
            strategy="afterInteractive"
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
