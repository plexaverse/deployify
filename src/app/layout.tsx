import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Toaster } from 'sonner';
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
  return (
    <html lang="en" className="dark">
      <body className={`${geist.variable} antialiased`}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-white focus:text-black focus:rounded-md font-bold"
        >
          Skip to content
        </a>
        {children}
        <Toaster theme="dark" position="bottom-right" />
      </body>
    </html>
  );
}
