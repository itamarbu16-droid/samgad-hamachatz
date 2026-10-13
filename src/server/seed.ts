import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb, isDemo } from './db';
import { getAuth } from './auth';
import * as s from './schema';
import { localDate } from './policy';

export async function seedDemo() {
  if(!isDemo() || process.env.VERCEL || process.env.DATABASE_URL) throw new Error('Synthetic seed is restricted to explicit local PGlite demonstration mode');
  const password=process.env.DEMO_PASSWORD;
  if(!password || password.length<12) throw new Error('Set DEMO_PASSWORD to at least 12 characters');
  const db=await getDb(); const auth=await getAuth(true);
  const people=[
    {email:process.env.DEMO_EMAIL||'demo@samgad.example',name:'איתי לוי',role:'deputy',companyId:null,domainId:null},
    {email:'company.a@samgad.example',name:'נועה כהן',role:'company_commander',companyId:'company-a',domainId:null},
    {email:'company.b@samgad.example',name:'עומר שחר',role:'company_commander',companyId:'company-b',domainId:null},
    {email:'logistics@samgad.example',name:'דניאל ברק',role:'staff',companyId:null,domainId:'logistics'},
    {email:'contributor@samgad.example',name:'יעל רז',role:'contributor',companyId:'company-a',domainId:null},
    {email:'viewer@samgad.example',name:'רועי הדר',role:'viewer',companyId:'company-a',domainId:null},
  ];
  const ids:string[]=[];
  for(const person of people) { const [existing]=await db.select().from(s.user).where(eq(s.user.email,person.email)); if(existing) ids.push(existing.id); else { const created=await auth.api.signUpEmail({body:{email:person.email,name:person.name,password}}); ids.push(created.user.id); } }
  await db.transaction(async tx=>{
    await tx.insert(s.organizations).values({id:'demo-org',name:'גדוד הדגמה — נתונים סינתטיים'}).onConflictDoNothing();
    await tx.insert(s.companies).values([{id:'company-a',organizationId:'demo-org',name:'פלוגת אופק'},{id:'company-b',organizationId:'demo-org',name:'פלוגת שקד'}]).onConflictDoNothing();
    await tx.insert(s.domains).values([
      {id:'safety',name:'בטיחות',color:'#d49245'},{id:'logistics',name:'לוגיסטיקה',color:'#358c85'},
      {id:'maintenance',name:'אחזקה וטנ״א',color:'#688bba'},{id:'communications',name:'תקשוב',color:'#8877b5'},
      {id:'medical',name:'תיאום רפואה',color:'#c1778d'},{id:'infrastructure',name:'תשתיות ומחנה',color:'#7b9273'},{id:'people',name:'כוח אדם וניהול',color:'#5e95a4'},
    ].map(d=>({...d,organizationId:'demo-org'}))).onConflictDoNothing();
    await tx.insert(s.memberships).values(people.map((p,i)=>({id:`demo-member-${i}`,organizationId:'demo-org',userId:ids[i],role:p.role,companyId:p.companyId,domainId:p.domainId}))).onConflictDoNothing();
    const existing=await tx.select({id:s.tasks.id}).from(s.tasks).where(eq(s.tasks.organizationId,'demo-org')).limit(1);
    if(existing.length) return;
    const date=(delta:number)=>{const now=new Date();now.setUTCDate(now.getUTCDate()+delta);return localDate(now);};
    const taskRows=[
      {id:'demo-task-1',title:'השלמת תדריך בטיחות לצוות המנהלה',description:'לרכז אישורי השתתפות בתדריך הבטיחות המנהלי ולעדכן שהושלמו. כל הפרטים בדוגמה זו סינתטיים.',domainId:'safety',companyId:'company-a',ownerId:ids[1],priority:'urgent',status:'in_progress',dueDate:date(-3)},
      {id:'demo-task-2',title:'ריכוז בקשות ציוד משרדי לחודש הבא',description:'לאסוף את צורכי הציוד המשרדי מהמסגרות ולרכז רשימה אחת לאישור.',domainId:'logistics',companyId:null,ownerId:ids[3],priority:'high',status:'in_progress',dueDate:date(-2)},
      {id:'demo-task-3',title:'עדכון רשימת אנשי קשר מנהליים',description:'לאמת את חלוקת האחריות ברשימה הסינתטית ולפרסם גרסה מעודכנת.',domainId:'people',companyId:'company-b',ownerId:ids[2],priority:'normal',status:'open',dueDate:date(-1)},
      {id:'demo-task-4',title:'תיאום תיקון התאורה בחדר הישיבות',description:'נדרש אישור למסגרת התקציב לפני תיאום מועד תיקון. אין מדובר במידע על כשירות או פעילות מבצעית.',domainId:'infrastructure',companyId:'company-a',ownerId:ids[1],priority:'high',status:'blocked',blockerReason:'ממתינים לאישור מסגרת התקציב',dueDate:date(2)},
      {id:'demo-task-5',title:'הכנת סיכום ישיבת המנהלה השבועית',description:'לסכם אחריות, החלטות פתוחות ומועדי מעקב.',domainId:'people',companyId:'company-a',ownerId:ids[4],priority:'normal',status:'in_progress',dueDate:date(1)},
      {id:'demo-task-6',title:'בדיקת טפסי בקשה לציוד משרדי',description:'בדיקת בהירות הטפסים לפני הפצתם.',domainId:'logistics',companyId:'company-a',ownerId:ids[1],priority:'normal',status:'pending_review',requiresReview:true,dueDate:date(3)},
      {id:'demo-task-7',title:'פרסום שעות קבלת קהל של המנהלה',description:'ריכוז שעות מענה מנהלי בלבד.',domainId:'people',companyId:'company-b',ownerId:ids[2],priority:'low',status:'open',dueDate:date(5)},
      {id:'demo-task-8',title:'עדכון מדריך התחברות למערכת',description:'לשפר את ההנחיות למשתמשים חדשים.',domainId:'communications',companyId:'company-a',ownerId:ids[4],priority:'normal',status:'open',dueDate:date(4)},
      {id:'demo-task-9',title:'ארגון תיקיית נהלי המנהלה',description:'הקמת מבנה תיקיות למסמכים מנהליים לא רגישים.',domainId:'people',companyId:null,ownerId:ids[0],priority:'low',status:'completed',completedAt:new Date(),completedBy:ids[0],dueDate:date(-1)},
    ];
    for(const task of taskRows) { await tx.insert(s.tasks).values({...task,organizationId:'demo-org',creatorId:ids[0]}); await tx.insert(s.auditEvents).values({id:randomUUID(),organizationId:'demo-org',entityType:'task',entityId:task.id,actorId:ids[0],action:'task.created',summary:`נוצרה משימת הדגמה: ${task.title}`}); }
    await tx.insert(s.decisions).values([
      {id:'demo-decision-1',organizationId:'demo-org',companyId:'company-a',domainId:'infrastructure',title:'אישור מסגרת תקציב לתאורה',description:'מבוקש אישור עקרוני לתיקון התאורה בחדר הישיבות. בקשת הדגמה סינתטית.',requesterId:ids[1],deciderId:ids[0],priority:'high',taskId:'demo-task-4'},
      {id:'demo-decision-2',organizationId:'demo-org',companyId:null,domainId:'logistics',title:'אישור פורמט אחיד לבקשות ציוד משרדי',description:'הצעה לאחד את טופסי הבקשה כדי למנוע כפילות ולהבהיר את האחריות.',requesterId:ids[3],deciderId:ids[0],priority:'normal',taskId:'demo-task-2'},
    ]);
    for(const id of ['demo-decision-1','demo-decision-2']) await tx.insert(s.auditEvents).values({id:randomUUID(),organizationId:'demo-org',entityType:'decision',entityId:id,actorId:ids[0],action:'decision.created',summary:'נפתחה בקשת הדגמה להחלטה'});
    await tx.insert(s.comments).values({id:randomUUID(),taskId:'demo-task-4',actorId:ids[1],body:'כל הפרטים נאספו. ממתינים להחלטה כדי להתקדם.'});
  });
  return {email:people[0].email};
}
