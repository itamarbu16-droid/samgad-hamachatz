import type { Metadata } from 'next';
import './globals.css';
import OfflineStatus from '@/components/offline-status';
import BattalionOpening from '@/components/battalion-opening';
export const metadata: Metadata = {
  title: 'סמג״ד רומח',
  applicationName: 'סמג״ד רומח',
  description: 'גדוד 75 רומח — משימות, אחריות, לו״ז וסיכומי ישיבות במקום אחד.',
  appleWebApp: { capable: true, title: 'סמג״ד רומח', statusBarStyle: 'default' },
  icons: { apple: '/brand/75-crest.png', icon: '/brand/75-crest.png' },
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="he" dir="rtl"><body>{children}<OfflineStatus /><BattalionOpening /></body></html>;
}
