import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Motor Thermal Digital Twin — Sensor-Free Thermal Estimation",
  description: "Professional motor thermal estimation tool using IEEE 112, IEC 60034, and NEMA MG-1 standards. First-order lumped-parameter thermal model with real-time loss segregation, root cause analysis, and health monitoring.",
  keywords: ["motor", "thermal", "digital twin", "IEC 60034", "IEEE 112", "NEMA MG-1", "predictive maintenance", "induction motor"],
  authors: [{ name: "Motor Thermal Digital Twin" }],
  icons: {
    icon: "/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
