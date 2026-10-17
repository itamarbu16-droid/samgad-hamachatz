export const dynamic='force-static';
export async function GET() {
 return Response.json({id:'/deputies',name:'סגני רומח',short_name:'סגני רומח',start_url:'/deputies',scope:'/',display:'standalone',lang:'he',dir:'rtl',background_color:'#080808',theme_color:'#080808',icons:[512].map(size=>({src:`/brand/75-crest.png?v=2`,sizes:`${size}x${size}`,type:'image/png'}))},{headers:{'Content-Type':'application/manifest+json'}});
}
