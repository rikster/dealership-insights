import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AutoGrab Bounded Orchestrator",
  description: "Evidence-backed dealership analytics proof of concept",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

