"use client";
import { useEffect,useState,type FormEvent } from 'react';
type Member={id:string;email:string;name:string;level:string;active:boolean};
export default function AccessSettings(){
 const [editing,setEditing]=useState<string|null>(null),[editedName,setEditedName]=useState('');
 const [members,setMembers]=useState<Member[]>([]),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 async function load(){const r=await fetch('/api/access',{cache:'no-store'});const j=await r.json();if(!r.ok)throw Error(j.error);setMembers(j.members);}
 useEffect(()=>{void load().catch(e=>setError(e.message));},[]);
 async function save(body:object){setBusy(true);setError('');setNotice('');try{const r=await fetch('/api/access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw Error(j.error);await load();window.dispatchEvent(new Event('samgad:saved'));setNotice('רשימת ההרשאות עודכנה');return true;}catch(e){setError(e instanceof Error?e.message:'השמירה לא הצליחה');return false;}finally{setBusy(false);}}
 async function rename(event:FormEvent<HTMLFormElement>,member:Member){
  event.preventDefault();setBusy(true);setError('');setNotice('');
  try{const response=await fetch('/api/access',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:member.id,name:editedName})});const result=await response.json();if(!response.ok)throw Error(result.error||'לא ניתן לשמור את השם');await load();setEditing(null);setNotice('השם עודכן. המייל וההרשאות נשארו ללא שינוי');window.dispatchEvent(new Event('samgad:saved'));}
  catch(error){setError(error instanceof Error?error.message:'לא ניתן לשמור את השם');}finally{setBusy(false);}
 }
 async function remove(member:Member){
  if(!window.confirm(`למחוק את ההרשאה של ${member.name} (${member.email})?\nהגישה לאפליקציה תבוטל והחיבורים הקיימים ינותקו. המשימות וההיסטוריה יישמרו.`))return;
  setBusy(true);setError('');setNotice('');
  try{
   const r=await fetch('/api/access',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:member.id})});
   const j=await r.json();if(!r.ok)throw Error(j.error);
   setMembers(current=>current.filter(m=>m.id!==member.id));
   window.dispatchEvent(new Event('samgad:saved'));
   setNotice('ההרשאה נמחקה והגישה לאפליקציה בוטלה');
  }catch(e){setError(e instanceof Error?e.message:'המחיקה לא הצליחה');}finally{setBusy(false);}
 }
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=e.currentTarget,f=new FormData(form);const ok=await save({email:f.get('email'),name:f.get('name')||undefined,level:f.get('level'),password:f.get('password')||undefined});if(ok)form.reset();}
 return <section className="panel access-settings"><h2>ניהול גישה לפי מייל</h2><p>רק מיילים פעילים ברשימה הזאת יכולים להיכנס. הקישור לבדו אינו מעניק גישה. בעלי הרשאת עריכה כללית נכנסים לממשק המנהל. בעלי הרשאה זו שותפים גם לאישי, לשעל״ח ולניהול ההרשאות.</p><p><a className="text-action" href="/deputies/login">קישור הכניסה לסגני רומח</a></p><p>עריכת המשימות שלי: רק משימות שהוקצו למשתמש. עריכה כללית: ממשק מנהל וכל המשימות המשותפות. גם מנהלים שותפים יכולים לנהל את רשימת ההרשאות.</p>
 {error&&<p role="alert" className="error-banner">{error}</p>}{notice&&<p role="status">{notice}</p>}
 <form onSubmit={submit} className="access-form"><label>מייל<input type="email" name="email" required autoComplete="off" dir="ltr" /></label><label>שם / בעל תפקיד — רשות<input name="name" minLength={2} /></label><label>הרשאה<select name="level" defaultValue="own"><option value="own">עריכת המשימות שלי בלבד</option><option value="all">מנהל שותף — גישה מלאה</option><option value="view">צפייה בלבד</option></select></label><label>סיסמה ראשונית — לחשבון חדש בלבד<input type="password" name="password" minLength={12} autoComplete="new-password" /></label><small>12 תווים לפחות. לחשבון קיים הסיסמה לא משתנה. לא נשלחת הודעה אוטומטית.</small><button disabled={busy} className="button primary">שמירת הרשאה</button></form>
 <div className="access-members">{members.map(m=><div className="access-member" key={m.id}><div className="access-member-identity">{editing===m.id?<form className="access-name-form" onSubmit={event=>void rename(event,m)}><label>שם מורשה הגישה<input aria-label={`שם עבור ${m.email}`} value={editedName} onChange={event=>setEditedName(event.target.value)} required minLength={2} maxLength={100} autoFocus disabled={busy}/></label><small dir="ltr">{m.email}</small><div className="access-name-actions"><button className="button secondary" type="submit" disabled={busy}>שמירת שם</button><button className="button secondary" type="button" disabled={busy} onClick={()=>setEditing(null)}>ביטול</button></div></form>:<><strong>{m.name}</strong><small dir="ltr">{m.email}</small><button className="button secondary access-edit-name" type="button" disabled={busy} aria-label={`עריכת שם עבור ${m.email}`} onClick={()=>{setEditing(m.id);setEditedName(m.name);setError('');setNotice('');}}>עריכת שם</button></>}</div>{m.level==='owner'?<span>בעל המרחב</span>:<><select aria-label={`הרשאה עבור ${m.email}`} value={m.active?m.level:'revoke'} disabled={busy} onChange={e=>void save({email:m.email,level:e.target.value})}><option value="view">צפייה בלבד</option><option value="own">המשימות שלו בלבד</option><option value="all">מנהל שותף — גישה מלאה</option><option value="revoke">חסימת כניסה</option></select><button type="button" className="button" disabled={busy} aria-label={`מחיקת הרשאה עבור ${m.name} (${m.email})`} onClick={()=>void remove(m)}>מחיקת הרשאה</button></>}</div>)}</div></section>;
}
