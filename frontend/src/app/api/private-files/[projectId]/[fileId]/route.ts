import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic='force-dynamic';
export const runtime='nodejs';
const privateHeaders={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
export async function GET(request:Request,{params}:{params:Promise<{projectId:string;fileId:string}>}) {
  try {
    const {projectId,fileId}=await params;
    if(!/^[a-f0-9-]{36}$/i.test(projectId)||!/^[a-f0-9-]{36}$/i.test(fileId))return NextResponse.json({error:'File not found.'},{status:404,headers:privateHeaders});
    const supabase=await createClient();
    const {data:{user},error}=await supabase.auth.getUser();
    if(error||!user)return NextResponse.json({error:'Sign in to open this file.'},{status:401,headers:privateHeaders});
    // Session supplies transport only AFTER server-validated identity; not an authorization check.
    const {data:{session}}=await supabase.auth.getSession();
    if(!session?.access_token)return NextResponse.json({error:'Sign in again and retry.'},{status:401,headers:privateHeaders});
    const base=new URL(process.env.NEXT_PUBLIC_API_URL??'https://xroga-api.fly.dev');
    if(base.username||base.password||base.search||base.hash||base.pathname!=='/'||!(base.protocol==='https:'||(base.protocol==='http:'&&['127.0.0.1','localhost'].includes(base.hostname))))throw new Error('invalid API origin');
    const target=new URL(`/api/projects/${projectId}/files/${fileId}/download`,base);
    const links=new URL(request.url).searchParams.getAll('link');
    if(links.length>1)return NextResponse.json({error:'File link is unavailable.'},{status:404,headers:privateHeaders});
    if(links.length)target.searchParams.set('link',links[0]);
    const range=request.headers.get('range');
    const response=await fetch(target,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(25000),headers:{Authorization:`Bearer ${session.access_token}`,...(range?{Range:range}:{})}});
    if(![200,206].includes(response.status)) {
      await response.body?.cancel();
      const status=[400,401,404,409,416].includes(response.status)?response.status:503;
      return NextResponse.json({error:status===401?'Sign in again and retry.':status===404?'File not found or link no longer available.':'Secure file delivery is unavailable. Retry shortly.'},{status,headers:privateHeaders});
    }
    const headers=new Headers(privateHeaders);
    for(const key of ['content-type','content-disposition','content-length','content-range','accept-ranges','content-security-policy']){const value=response.headers.get(key);if(value)headers.set(key,value);}
    return new Response(response.body,{status:response.status,headers});
  }catch{return NextResponse.json({error:'Secure file delivery is unavailable. Retry shortly.'},{status:503,headers:privateHeaders});}
}
