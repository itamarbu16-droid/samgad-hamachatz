import type { Metadata } from 'next';
import './globals.css';
import OfflineStatus from '@/components/offline-status';
import BattalionOpening from '@/components/battalion-opening';
export const metadata: Metadata = {
  title: 'סמג״ד המחץ',
  applicationName: 'סמג״ד המחץ',
  description: 'משימות, אחריות והחלטות במקום אחד. סביבת הדגמה עם מידע סינתטי בלבד.',
  appleWebApp: { capable: true, title: 'סמג״ד המחץ', statusBarStyle: 'default' },
  icons: { apple: '/brand/605-icon-180.png', icon: '/brand/605-icon-192.png' },
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="he" dir="rtl"><body>{children}<OfflineStatus /><BattalionOpening /></body></html>;
}
