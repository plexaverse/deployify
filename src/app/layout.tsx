import type { Metadata } from "next";
import { Geist } from "next/font/google";
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
        {children}
      </body>
    </html>
  );
}
