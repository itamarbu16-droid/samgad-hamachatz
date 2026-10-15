import type { Metadata } from 'next';
import './globals.css';
import OfflineStatus from '@/components/offline-status';
export const metadata: Metadata = {
  title: 'סמג״ד המחץ | ניהול מנהלתי',
  description: 'משימות, אחריות והחלטות במקום אחד. סביבת הדגמה עם מידע סינתטי בלבד.',
  appleWebApp: { capable: true, title: 'סמג״ד המחץ', statusBarStyle: 'default' },
  icons: { apple: '/icon-180.png' },
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="he" dir="rtl"><body>{children}<OfflineStatus /></body></html>;
}
