import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'GreenRun — Smart Lawn Care',
  description: 'Book a professional lawn cut in under 60 seconds.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  )
}
