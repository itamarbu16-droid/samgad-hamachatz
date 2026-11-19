/** Match role names as complete words, accepting common Hebrew quote variants. */
export function mentionsRole(text:string,role:string){
 const normalize=(value:string)=>value.normalize('NFKC').replace(/[״׳'"“”‘’]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
 const haystack=normalize(text),needle=normalize(role);
 if(!needle)return false;
 let start=haystack.indexOf(needle);
 while(start!==-1){const before=haystack[start-1]||'',after=haystack[start+needle.length]||'';if(!/[\p{L}\p{N}]/u.test(before)&&!/[\p{L}\p{N}]/u.test(after))return true;start=haystack.indexOf(needle,start+1);}
 return false;
}
