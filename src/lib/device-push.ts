/** Reuse the device's persistent permission and subscription; never prompt on launch. */
export async function syncDevicePush(interactive=false):Promise<boolean>{
 if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window)){
  if(interactive)throw Error('באייפון: הוסף למסך הבית ופתח את האפליקציה משם כדי להפעיל התראות.');
  return false;
 }
 let permission=Notification.permission;
 if(permission==='default'&&interactive)permission=await Notification.requestPermission();
 if(permission!=='granted'){
  if(interactive)throw Error('יש לאשר התראות בהגדרות המכשיר כדי לקבל עדכונים.');
  return false;
 }
 await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});
 const registration=await navigator.serviceWorker.ready;
 const response=await fetch('/api/push',{cache:'no-store',signal:AbortSignal.timeout(15000)});
 const data=await response.json();if(!response.ok)throw Error(data.error||'לא ניתן לבדוק את הרשמת ההתראות');
 const raw=atob(data.publicKey.replace(/-/g,'+').replace(/_/g,'/'));
 const applicationServerKey=Uint8Array.from(raw,c=>c.charCodeAt(0));
 const subscription=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey});
 const saved=await fetch('/api/push',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(subscription.toJSON()),signal:AbortSignal.timeout(15000)});
 if(!saved.ok)throw Error('הרשאת ההתראות נשמרה בטלפון, אך הסנכרון לשרת לא הושלם. נסה שוב כשיש חיבור.');
 return true;
}
