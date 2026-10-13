'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main dir="rtl" style={{padding:48,fontFamily:'sans-serif'}}><h1>לא הצלחנו לטעון את העמוד</h1><p>המידע ששמרת נשמר. אפשר לנסות שוב.</p><button onClick={reset}>ניסיון נוסף</button></main>;
}
