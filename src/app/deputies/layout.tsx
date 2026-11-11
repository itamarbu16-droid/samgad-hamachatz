import type { Metadata } from 'next';
export const metadata:Metadata={title:'סגני המחץ',applicationName:'סגני המחץ',appleWebApp:{capable:true,title:'סגני המחץ',statusBarStyle:'default'},manifest:'/deputies/manifest.webmanifest'};
export default function DeputiesLayout({children}:{children:React.ReactNode}) { return children; }
