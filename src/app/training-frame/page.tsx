import {notFound} from 'next/navigation';
export default async function Page({searchParams}:{searchParams:Promise<{role?:string}>}){
 if(process.env.VERCEL_ENV!=='preview'||process.env.VERCEL_GIT_COMMIT_REF!=='feature/tutorial-recording')notFound();
 const role=(await searchParams).role==='manager'?'manager':'deputy';
 return <main style={{margin:0,padding:0,display:'grid',placeItems:'start center',background:'#080808',height:'100vh',overflow:'hidden'}}><iframe title="ממשק האפליקציה — נתוני הדרכה" src={'/training?role='+role} style={{width:390,height:844,border:0,flexShrink:0}}/></main>;
}
