import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Streak — habit tracker for Fanvue creators",
  description:
    "Streak turns your Fanvue posting history into a streak, a heatmap and a few honest numbers about consistency. An independent third-party app.",
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
