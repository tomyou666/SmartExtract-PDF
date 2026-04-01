export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <head>
        <script src="https://unpkg.com/react-scan/dist/auto.global.js" async />
        {/* 他の script */}
      </head>
      <body>{children}</body>
    </html>
  )
}

