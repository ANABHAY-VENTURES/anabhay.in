import {ProviderUnknown} from '../../server/provider.mjs';
// Deterministic in-memory FAKE, not durable provider evidence. No network or logs.
export function createFakeProvider({records=new Map(),behavior='accept',lookup=true}={}){
 let calls=0;
 return Object.freeze({kind:'fake',idempotent:true,authoritativeLookup:lookup,
  async lookup(key){if(!lookup)throw new ProviderUnknown();const r=records.get(key);return r?{status:r.status,messageId:r.messageId}:{status:'absent'};},
  async send({key,digest}){
   calls++;const old=records.get(key);
   if(old){if(old.digest!==digest)throw new ProviderUnknown();return {status:old.status,messageId:old.messageId};}
   if(behavior==='reject')return {status:'rejected'};
   if(behavior==='rate-limit')return {status:'rate-limited',retryAfterMs:300000};
   if(behavior==='server-error')return {status:'retryable'};
   if(behavior==='unknown')return {status:'unknown'};
   const r={status:'accepted',messageId:`fake-${records.size+1}`,digest};records.set(key,r);
   if(behavior==='lost-ack')throw new ProviderUnknown();
   if(behavior==='hang-after-accept')return new Promise(()=>{});
   return {status:r.status,messageId:r.messageId};
  },
  calls:()=>calls,
  // Test-only provider observation injection; never an application capability.
  setState(key,status){const r=records.get(key);if(!r)throw new ProviderUnknown();r.status=status;}
 });
}
