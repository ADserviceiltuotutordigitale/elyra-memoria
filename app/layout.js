import { Fraunces, Manrope, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import TopBar from "@/components/TopBar";
import CaptureBar from "@/components/CaptureBar";

const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal"],
});

const manrope = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata = {
  title: "Elyra — memoria",
  description: "Task, calendario, finanze, abitudini e una memoria che impara chi sei.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="it" className={`${fraunces.variable} ${manrope.variable} ${plexMono.variable}`}>
      <body>
        <TopBar />
        {children}
        <CaptureBar />
      </body>
    </html>
  );
}
