import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Untangle — 해야 할 일은 아는데, 시작이 안 될 때",
  description:
    "머릿속을 함께 정리하고, 당신이 고른 일을 지금 바로 할 수 있는 작은 첫 행동으로 쪼개주는 Co-Planner. 베타 체험 진행 중.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <head>
        <link
          rel="preconnect"
          href="https://cdn.jsdelivr.net"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
