// Provider-independent protocol. No HTTP implementation or production credentials.
export class ProviderUnknown extends Error{constructor(){super('Provider outcome unconfirmed.');}}
export function providerOutcome(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return Object.freeze({status:'unknown'});
 const keys=Object.keys(value);
 if(keys.some(k=>!['status','messageId','retryAfterMs'].includes(k)))return Object.freeze({status:'unknown'});
 if(['accepted','delivered','pending','failed'].includes(value.status)){
  if(typeof value.messageId!=='string'||!value.messageId.trim()||value.messageId.length>200)return Object.freeze({status:'unknown'});
  return Object.freeze({status:value.status,messageId:value.messageId});
 }
 if(['absent','rejected','rate-limited','retryable','unknown'].includes(value.status)){
  if(value.retryAfterMs!==undefined&&(!Number.isInteger(value.retryAfterMs)||value.retryAfterMs<0||value.retryAfterMs>300000))return Object.freeze({status:'unknown'});
  return Object.freeze({status:value.status});
 }
 return Object.freeze({status:'unknown'});
}
// Only verified absence permits a first/repeated send. Pending/failed lookup
// statuses with a receipt establish prior acceptance, NOT successful delivery.
export function reconciliationAction(value){
 const o=providerOutcome(value);
 if(['accepted','delivered','pending','failed'].includes(o.status))return Object.freeze({action:'accept',providerState:o.status,messageId:o.messageId});
 if(o.status==='absent')return Object.freeze({action:'send'});
 return Object.freeze({action:'hold'});
}
export function assertRecoveryProvider(provider){
 if(!provider||provider.kind!=='fake'||provider.idempotent!==true||provider.authoritativeLookup!==true||
  typeof provider.send!=='function'||typeof provider.lookup!=='function')throw new ProviderUnknown();
 // Live adapters require their own reviewed constructor/guarantees. A flag alone
 // never verifies a real provider's retention or lookup consistency.
 return provider;
}
