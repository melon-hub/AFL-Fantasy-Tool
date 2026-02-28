import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AFL Fantasy Draft Tool 2026",
  description:
    "VORP-based draft assistant for 6-team AFL Fantasy leagues — smokies, bye planning, live value tracking",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
