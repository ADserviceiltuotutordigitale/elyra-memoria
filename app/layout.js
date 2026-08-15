import { Inter_Tight, Roboto, Roboto_Mono } from "next/font/google";
import "./globals.css";

const interTight = Inter_Tight({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal"],
});

const roboto = Roboto({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata = {
  title: "Elyra — memoria",
  description: "Task, calendario, finanze e una memoria che impara chi sei.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="it" className={`${interTight.variable} ${roboto.variable} ${robotoMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
