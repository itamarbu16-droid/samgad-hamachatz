export const dynamic='force-static';
export async function GET() {
 return Response.json({id:'/deputies',name:'סגני המחץ',short_name:'סגני המחץ',start_url:'/deputies',scope:'/',display:'standalone',lang:'he',dir:'rtl',background_color:'#080808',theme_color:'#080808',icons:[192,512].map(size=>({src:`/brand/605-icon-${size}.png`,sizes:`${size}x${size}`,type:'image/png'}))},{headers:{'Content-Type':'application/manifest+json'}});
}
