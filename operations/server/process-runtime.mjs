import {validateProcessConfig} from './config.mjs';
import {createIngestionDriver,createNotificationDriver} from './postgres.mjs';
import {postgresEnquiryCapabilities} from './capabilities.mjs';
// Explicit startup entry factories; no environment reads, listener or activation.
// Validate before constructing any pool. Returned objects never contain secrets.
export function createIngestionProcess(scopedConfig,approvedTarget,options={},dependencies){
 const config=validateProcessConfig('ingestion',scopedConfig,approvedTarget);
 const driver=createIngestionDriver(config.database,options,dependencies);
 return Object.freeze({capabilities:Object.freeze(postgresEnquiryCapabilities(driver)),shutdown:driver.shutdown});
}
export function createNotificationProcess(scopedConfig,approvedTarget,options={},dependencies){
 const config=validateProcessConfig('notification',scopedConfig,approvedTarget);
 return createNotificationDriver(config.database,{...options,persistence:true},dependencies);
}
