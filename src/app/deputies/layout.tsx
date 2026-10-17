import type { Metadata } from 'next';
export const metadata:Metadata={title:'סגני רומח',applicationName:'סגני רומח',appleWebApp:{capable:true,title:'סגני רומח',statusBarStyle:'default'},manifest:'/deputies/manifest.webmanifest'};
export default function DeputiesLayout({children}:{children:React.ReactNode}) { return children; }
