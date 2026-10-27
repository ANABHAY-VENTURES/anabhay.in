import {ApiError} from './enquiry.mjs';

// Bounds caller wait and signals cancellation. Real drivers MUST additionally
// enforce statement deadlines and cancel/dispose connections. A timeout never
// proves a commit did not happen; do not automatically retry with a new key.
export async function withDeadline(operation,milliseconds,status=503) {
 if(!Number.isInteger(milliseconds)||milliseconds<1||milliseconds>15000) throw new ApiError(503,'Service unavailable.');
 const controller=new AbortController();let timer;
 const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{reject(new ApiError(status,status===408?'Request timed out.':'Service unavailable.'));controller.abort();},milliseconds);});
 try {return await Promise.race([Promise.resolve().then(()=>operation(controller.signal)),timeout]);}
 finally {clearTimeout(timer);}
}
