// Explicit local harness binding only; no CLI, environment loader or hosted target.
import {validateProcessConfig} from './config.mjs';
import {createIngestionProcess} from './process-runtime.mjs';
import {startLocalEnquiry,developmentOrigin} from './local-http.mjs';

export async function startLocalPostgresEnquiry({developmentOptIn=false,scopedConfig,approvedTarget,driverOptions={},httpOptions={}}={}){
 if(developmentOptIn!==true||approvedTarget?.expectedDatabaseHost!=='127.0.0.1'||
  approvedTarget?.expectedProjectRef!=='aaaaaaaaaaaaaaaaaaaa'||
  typeof approvedTarget?.ca!=='string'||
  approvedTarget?.allowedOrigins?.length!==1||approvedTarget.allowedOrigins[0]!==developmentOrigin||
  Object.keys(httpOptions).some(k=>!['port','requestDeadlineMs','bodyDeadlineMs'].includes(k)))throw new Error('Isolated local configuration required.');
 // Validate before any pool/listener is constructed; only synthetic target marker.
 const checked=validateProcessConfig('ingestion',scopedConfig,approvedTarget);
 if(checked.database.host!=='127.0.0.1'||checked.database.user!=='synthetic_ingestion'||checked.database.database!=='postgres'||
  ![5432,15432,15433,15434].includes(checked.database.port)||checked.allowedOrigins.length!==1)throw new Error('Isolated local configuration required.');
 return startLocalEnquiry({...httpOptions,developmentOptIn:true,rateLimitSecret:checked.rateLimitSecret,
  createProcess:()=>createIngestionProcess(scopedConfig,approvedTarget,driverOptions)});
}
