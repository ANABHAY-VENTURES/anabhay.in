// Explicit role-scoped startup validation. No process.env loading or logging.
// The approved target is supplied by a trusted operator, never request data.
export class ConfigurationFailure extends Error{
 constructor(){super('Operations configuration unavailable.');}
}
const fail=()=>{throw new ConfigurationFailure();};
const groups={
 public:['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY'],
 staff:['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY'],
 ingestion:['OPERATIONS_INGESTION_DATABASE_URL','RATE_LIMIT_HMAC_SECRET','ALLOWED_ORIGINS'],
 notification:['OPERATIONS_NOTIFICATION_DATABASE_URL'],
 provider:['EMAIL_API_KEY','NOTIFICATION_FROM','NOTIFICATION_TO'],
 migration:['OPERATIONS_MIGRATION_DATABASE_URL']
};
const secretKeys=['SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY','SERVICE_ROLE_KEY'];
export function validateProcessConfig(role,env,{expectedProjectRef,expectedDatabaseHost,allowedOrigins=[],ca}={}){
 try{
  if(!groups[role]||!env||typeof env!=='object'||Array.isArray(env)||! /^[a-z]{20}$/.test(expectedProjectRef??''))fail();
  const allowed=new Set(['OPERATIONS_PROJECT_REF',...groups[role]]);
  // Receive a scoped configuration object, NOT a dump of the host environment.
  if(Object.keys(env).some(k=>!allowed.has(k)||secretKeys.includes(k)))fail();
  if(env.OPERATIONS_PROJECT_REF!==expectedProjectRef)fail();
  for(const k of allowed)if(typeof env[k]!=='string'||!env[k]||env[k]!==env[k].trim())fail();
  if(role==='public'||role==='staff'){
   const url=new URL(env.SUPABASE_URL);
   if(url.href!==`https://${expectedProjectRef}.supabase.co/`||url.username||url.password||url.search||url.hash)fail();
   // Deliberately accept only the typed modern public key; no legacy admin JWT fallback.
   if(!/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(env.SUPABASE_PUBLISHABLE_KEY))fail();
   return Object.freeze({projectRef:expectedProjectRef,url:url.origin,publishableKey:env.SUPABASE_PUBLISHABLE_KEY});
  }
  if(role==='provider'){
   // No production provider loader: only an explicitly requested fake is permitted.
   fail();
  }
  if(role==='migration')fail(); // No administrative runtime is implemented.
  const key=role==='ingestion'?'OPERATIONS_INGESTION_DATABASE_URL':'OPERATIONS_NOTIFICATION_DATABASE_URL';
  const u=new URL(env[key]);const user=decodeURIComponent(u.username),password=decodeURIComponent(u.password);
  if(!['postgres:','postgresql:'].includes(u.protocol)||!expectedDatabaseHost||u.hostname!==expectedDatabaseHost||
   u.search||u.hash||! /^[a-z_][a-z0-9_]{0,62}$/.test(user)||
   /^(postgres|service_role|supabase_admin|authenticator|anon|authenticated|ops_)/.test(user)||!password||
   ! /^\/[A-Za-z0-9_-]+$/.test(u.pathname)|| (ca!==undefined&&(typeof ca!=='string'||!ca.includes('-----BEGIN CERTIFICATE-----'))))fail();
  const database=Object.freeze({host:u.hostname,expectedHost:expectedDatabaseHost,port:Number(u.port||5432),database:u.pathname.slice(1),user,password,ssl:Object.freeze({rejectUnauthorized:true,...(ca?{ca}:{})})});
  if(database.port<1||database.port>65535)fail();
  if(role==='notification')return Object.freeze({projectRef:expectedProjectRef,database});
  if(env.RATE_LIMIT_HMAC_SECRET.length<32)fail();
  const origins=env.ALLOWED_ORIGINS.split(',');
  if(!origins.length||new Set(origins).size!==origins.length||origins.some(o=>{const p=new URL(o);return p.protocol!=='https:'||p.origin!==o||!allowedOrigins.includes(o);}))fail();
  return Object.freeze({projectRef:expectedProjectRef,database,rateLimitSecret:env.RATE_LIMIT_HMAC_SECRET,allowedOrigins:Object.freeze(origins)});
 }catch{throw new ConfigurationFailure();}
}
