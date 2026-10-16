import {notFound} from 'next/navigation';
import Training from './training';
export default function Page(){
 if(process.env.VERCEL_ENV!=='preview'||process.env.VERCEL_GIT_COMMIT_REF!=='feature/tutorial-recording')notFound();
 return <Training/>;
}
