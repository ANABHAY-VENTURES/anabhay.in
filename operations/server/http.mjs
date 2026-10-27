import {ApiError,reviewSubmission} from './enquiry.mjs';
import {withDeadline} from './deadline.mjs';
async function readBody(request,deadlineMs) {
 const length=request.headers.get('Content-Length');
 if(length!==null&&(!/^[0-9]+$/.test(length)||!Number.isSafeInteger(Number(length))||Number(length)>16384)) throw new ApiError(422,'Invalid enquiry.');
 if(request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='application/json') throw new ApiError(422,'Invalid enquiry.');
 if(!Number.isInteger(deadlineMs)||deadlineMs<1||deadlineMs>15000) throw new ApiError(503,'Service unavailable.');
 const reader=request.body?.getReader();if(!reader) throw new ApiError(422,'Invalid enquiry.');
 return withDeadline(async signal=>{
  const cancel=()=>{void reader.cancel().catch(()=>{});};
  signal.addEventListener('abort',cancel,{once:true});
  const chunks=[];let size=0;
  try {
   while(true){const {done,value}=await reader.read();if(done) break;size+=value.byteLength;if(size>16384){cancel();throw new ApiError(422,'Invalid enquiry.');}chunks.push(Buffer.from(value));}
   try {return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));}
   catch {throw new ApiError(422,'Invalid enquiry.');}
  } finally {signal.removeEventListener('abort',cancel);reader.releaseLock();}
 },deadlineMs,408);
}
// Proposed server adapter only; no listener, deployment, endpoint or credentials.
export async function handleEnquiry(request,{enabled=false,allowedOrigins=[],dependencies,fingerprint,bodyDeadlineMs=5000}={}) {
 const origin=request.headers.get('Origin');
 const allowed=origin && allowedOrigins.some(o=>{try {const u=new URL(o);return u.protocol==='https:'&&u.origin===o&&o===origin;}catch{return false;}});
 const headers={'Cache-Control':'no-store','Vary':'Origin','Content-Type':'application/json'};
 const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
 if(!allowed) return reply(403,{error:'Access denied.'});
 headers['Access-Control-Allow-Origin']=origin;
 if(!enabled) return reply(503,{error:'Service unavailable.'});
 if(request.method==='OPTIONS') {
  const requested=(request.headers.get('Access-Control-Request-Headers')||'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
  if(request.headers.get('Access-Control-Request-Method')!=='POST'||requested.some(h=>!['content-type','idempotency-key'].includes(h))) return reply(403,{error:'Access denied.'});
  headers['Access-Control-Allow-Methods']='POST';headers['Access-Control-Allow-Headers']='Content-Type, Idempotency-Key';
  return new Response(null,{status:204,headers});
 }
 if(request.method!=='POST') return reply(405,{error:'Method unavailable.'});
 try {
  if(typeof fingerprint!=='string'||! /^[0-9a-f]{64}$/.test(fingerprint)) throw new ApiError(503,'Service unavailable.');
  // Count once before body reading/validation; driver commits rate separately.
  const result=await reviewSubmission(()=>readBody(request,bodyDeadlineMs),request.headers.get('Idempotency-Key'),{...dependencies,fingerprint});
  return reply(result.status,result.body);
 } catch(error) {const status=error instanceof ApiError?error.status:503;return reply(status,{error:status===408?'Request timed out.':status===409?'Request identifier already used.':status===422?'Invalid enquiry.':status===429?'Please try again later.':'Service unavailable.'});}
}
