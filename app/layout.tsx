import type { Metadata } from "next";
import type { ReactNode } from "react";
import { STATIC_CONTENT_SECURITY_POLICY } from "@/lib/contentSecurityPolicy";
import "./globals.css";

export const metadata: Metadata = {
  title: "ポケモン タイプ相性補完ツール",
  description: "チーム全体の弱点と耐性を見ながら、補完タイプ候補を確認できる最小構成ツール"
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        <meta
          httpEquiv="Content-Security-Policy"
          content={STATIC_CONTENT_SECURITY_POLICY}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
