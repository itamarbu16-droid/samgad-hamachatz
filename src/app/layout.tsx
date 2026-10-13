import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'סמג״ד המחץ | ניהול מנהלתי',
  description: 'משימות, אחריות והחלטות במקום אחד. סביבת הדגמה עם מידע סינתטי בלבד.',
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="he" dir="rtl"><body>{children}</body></html>;
}
