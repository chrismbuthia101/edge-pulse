import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'EdgePulse Dashboard',
  description: 'ML-Powered Edge Device Anomaly Detection System',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
