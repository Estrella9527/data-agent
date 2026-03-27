import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "重明 Data Agent",
  description: "AI-powered data analysis assistant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
