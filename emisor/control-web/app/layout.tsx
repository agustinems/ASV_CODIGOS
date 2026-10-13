import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ||
      'https://asv-litoral-01.agustinmirandasalvay.chatgpt.site',
  ),
  title: 'ASV Control · LoRa',
  description:
    'Estación móvil de control y telemetría para vehículo de superficie autónomo.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/favicon.svg' },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'ASV Control',
  },
  openGraph: {
    type: 'website',
    title: 'ASV Control · LoRa',
    description: 'Control y telemetría en tiempo real para tu ASV.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'ASV Control · LoRa' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ASV Control · LoRa',
    description: 'Control y telemetría en tiempo real para tu ASV.',
    images: ['/og.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#061016',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
