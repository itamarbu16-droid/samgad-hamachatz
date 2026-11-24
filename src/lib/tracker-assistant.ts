import {
 FLEXIBLE_TRACKER_KIND,MAX_FLEXIBLE_COLUMNS,MAX_FLEXIBLE_COLUMN_NAME,MAX_FLEXIBLE_ROWS,MAX_FLEXIBLE_VALUE,
 type FlexibleTracker,
} from './flexible-tracker';

export const MAX_TRACKER_PROMPT=8000;
export const TRACKER_PROMPT_EXAMPLE='מעקב תחזוקה עם עמודות פריט, מצב, תאריך והערות, ו־12 שורות';
const presets:Record<string,string[]>={
 'משימות':['משימה','אחראי','תאריך יעד','סטטוס','הערות'],
 'מלאי':['פריט','כמות','יחידה','הערות'],
 'נוכחות':['שם','תאריך','נוכחות','הערות'],
};
const numbers:Record<string,number>={
 'אחת':1,'אחד':1,'שתי':2,'שתיים':2,'שניים':2,'שלוש':3,'ארבע':4,'חמש':5,'שש':6,'שבע':7,'שמונה':8,'תשע':9,'עשר':10,'עשרים':20,'חמישים':50,'מאה':100,'מאתיים':200,
};
const clean=(s:string)=>s.trim().replace(/^[״“"]|[״”"]$/gu,'').trim();
export type TrackerDraft={title:string;grid:FlexibleTracker};
type Result={draft:TrackerDraft;error?:never}|{draft?:never;error:string};

export function parseTrackerPrompt(prompt:string):Result{
 if(prompt.length>MAX_TRACKER_PROMPT)return {error:`התיאור ארוך מדי. אפשר להזין עד ${MAX_TRACKER_PROMPT.toLocaleString('he-IL')} תווים.`};
 const normalized=prompt.replaceAll('\r','').trim();
 if(!normalized)return {error:'מה שם המעקב ואילו עמודות להוסיף?'};
 const lines=normalized.split(/\n|;/u).filter(line=>line.trim());
 // Keep explicit cell rows separate from the descriptive grammar.
 const namedRows=lines.filter(line=>/^\s*שורה\s*:/u.test(line)).map(line=>line.replace(/^\s*שורה\s*:/u,'').split('|').map(cell=>cell.trim()));
 const descriptions=lines.filter(line=>!/^\s*שורה\s*:/u.test(line));
 const segments=descriptions.flatMap(line=>line
  .replace(/[,.]?\s+ו?[־-]?\s*(?:עם\s+)?(?=(?:שם(?:\s+המעקב)?|תבנית|עמודות)\s*:|עמודות\s+)/gu,'\n')
  .replace(/[,.]?\s+ו?[־-]?\s*(?=(?:\d+|אחת|אחד|שתי|שתיים|שניים|שלוש|ארבע|חמש|שש|שבע|שמונה|תשע|עשר|עשרים|חמישים|מאה|מאתיים)\s+שורות(?:\s|$|[.,]))/gu,'\n')
  .split('\n')).map(value=>value.trim().replace(/[,.]$/u,'')).filter(Boolean);
 let title:string|undefined,headers:string[]|undefined,rowCount:number|undefined,preset:string|undefined;
 for(const part of segments){
  const columns=part.match(/^(?:עם\s+)?עמודות\s*(?:(:)\s*|\s+)(.*)$/u);
  if(columns){
   if(headers)return {error:'מצאתי שתי רשימות עמודות. איזו רשימה להשתמש בה?'};
   headers=columns[2].split(/\s*[,|،]\s*/u).flatMap((value,index,values)=>{
    // Final conjunction after a comma: "שם, כמות והערות".
    if(!columns[1]&&index===values.length-1){
     const final=value.match(/^(.+?)\s+ו([^\s].*)$/u);
     if(final)return [clean(final[1]),clean(final[2])];
    }
    return [clean(value)];
   });
   continue;
  }
  const template=part.match(/^תבנית\s*:\s*(.*)$/u);
  if(template){
   if(preset!==undefined)return {error:'בחרו תבנית אחת בלבד.'};
   preset=clean(template[1]);
   if(!Object.hasOwn(presets,preset))return {error:'איזו תבנית להשתמש? אפשר לכתוב משימות, מלאי או נוכחות, או לתת שמות לעמודות.'};
   continue;
  }
  const count=part.match(/^(?:מספר\s+)?שורות\s*:\s*(.+)$/u)||part.match(/^(\S+)\s+שורות(?:\s+ריקות)?$/u);
  if(count){
   if(rowCount!==undefined)return {error:'מצאתי יותר ממספר אחד של שורות. כתבו מספר אחד.'};
   rowCount=/^\d+$/u.test(count[1])?Number(count[1]):numbers[count[1]]??NaN;
   if(!Number.isSafeInteger(rowCount)||rowCount<1||rowCount>MAX_FLEXIBLE_ROWS)return {error:`כמה שורות להוסיף? כתבו מספר בין 1 ל־${MAX_FLEXIBLE_ROWS}.`};
   continue;
  }
  if(title||/^(?:תוסיף|תמלא|הוסף|מלא|מזג|תמזג|שורות|עמודות)\s/u.test(part))return {error:'חלק מהתיאור לא ברור לי. כתבו את שם המעקב, העמודות ומספר השורות. לתוכן קיים, השתמשו בשורה: ערך | ערך.'};
  const withoutRequest=part.replace(/^(?:אני רוצה|תכין|תכיני|צור|צרי|תיצור|תיצרי|בנה|בני|תבנה|תבני)\s+(?:לי\s+)?/u,'');
  title=clean(withoutRequest
   .replace(/^(?:שם(?:\s+המעקב)?\s*:\s*|טבל(?:ה|ת)\s+(?:מעקב\s+)?(?:בשם\s+|למעקב\s+(?:אחרי\s+)?)?|מעקב\s+בשם\s+)/u,''));

 }
 if(!title||title.length<2||title.length>160)return {error:'מה שם המעקב? כתבו שם באורך 2–160 תווים.'};
 if(!headers&&preset)headers=presets[preset];
 if(!headers?.length)return {error:'אילו עמודות להוסיף? כתבו למשל: עמודות: פריט, כמות, הערות.'};
 if(headers.length>MAX_FLEXIBLE_COLUMNS||headers.some(value=>!value||value.length>MAX_FLEXIBLE_COLUMN_NAME))return {error:`כתבו עד ${MAX_FLEXIBLE_COLUMNS} שמות לעמודות, עד ${MAX_FLEXIBLE_COLUMN_NAME} תווים לכל שם, וביניהם פסיק.`};
 if(headers.some(value=>/(?:^|\s)(?:ותמלא|תמלא|ותוסיף|תוסיף|תמזג|מזג)\s/u.test(value)))return {error:'הפרידו בין שמות העמודות לבקשות נוספות. לתוכן קיים כתבו בשורה נפרדת: שורה: ערך | ערך.'};
 if(new Set(headers.map(value=>value.toLocaleLowerCase('he-IL'))).size!==headers.length)return {error:'מצאתי שם עמודה שחוזר פעמיים. כתבו שם שונה לכל עמודה.'};
 if(namedRows.some(row=>row.length>headers.length||row.some(cell=>cell.length>MAX_FLEXIBLE_VALUE)))return {error:`בדקו שכל שורה מפורשת מכילה לכל היותר ${headers.length} תאים (עד ${MAX_FLEXIBLE_VALUE} תווים לתא).`};
 if(namedRows.length>MAX_FLEXIBLE_ROWS||(rowCount!==undefined&&namedRows.length>rowCount))return {error:'יש יותר שורות תוכן ממספר השורות בטבלה. הגדילו את מספר השורות או הסירו שורות תוכן.'};
 const columns=headers.map((name,i)=>({name,id:'column-'+i}));
 const grid:FlexibleTracker={kind:FLEXIBLE_TRACKER_KIND,columns,merges:[],
  rows:Array.from({length:rowCount??Math.max(6,namedRows.length)},(_,i)=>({
   id:'row-'+i,cells:Object.fromEntries((namedRows[i]??[]).flatMap((cell,j)=>cell?[[columns[j].id,cell]]:[])),
  })),
 };
 return {draft:{title,grid}};
}
