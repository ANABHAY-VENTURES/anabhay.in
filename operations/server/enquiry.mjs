import {createHash} from 'node:crypto';
import {validateEnquiry} from '../../js/enquiry-validation.js';

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const names = ['schemaVersion','fullName','workEmail','phone','organisation','projectType','description','preferredContactMethod','consent','consentVersion','source'];
export function validateRequest(raw, key) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > 16384) throw new ApiError(422,'Invalid enquiry.');
  if (typeof key !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) throw new ApiError(422,'Invalid request identifier.');
  let input;
  try { input = JSON.parse(raw); } catch { throw new ApiError(422,'Invalid enquiry.'); }
  if (!input || Array.isArray(input) || typeof input !== 'object' || Object.keys(input).length !== names.length || names.some(n => !Object.hasOwn(input,n))) throw new ApiError(422,'Invalid enquiry.');
  for (const n of ['fullName','workEmail','projectType','description','preferredContactMethod']) if (typeof input[n] !== 'string') throw new ApiError(422,'Invalid enquiry.');
  for (const n of ['phone','organisation']) if (input[n] !== null && typeof input[n] !== 'string') throw new ApiError(422,'Invalid enquiry.');
  if (input.schemaVersion !== 1 || input.consent !== true || input.consentVersion !== 'enquiry-v1' || input.source !== 'company-website') throw new ApiError(422,'Invalid enquiry.');
  const payload = Object.fromEntries(names.map(n => [n,typeof input[n] === 'string' ? input[n].trim() : input[n]]));
  for (const value of Object.values(payload)) if (typeof value === 'string' && value.includes('\0')) throw new ApiError(422,'Invalid enquiry.');
  if (payload.phone === '') payload.phone = null;
  if (payload.organisation === '') payload.organisation = null;
  if (Object.keys(validateEnquiry(payload)).length) throw new ApiError(422,'Invalid enquiry.');
  return {payload, key:key.toLowerCase(), hash:createHash('sha256').update(JSON.stringify(payload)).digest('hex')};
}
// Dependency boundary only: no HTTP endpoint or database client is configured.
// persist MUST implement one database transaction and concurrency-safe key uniqueness.
export async function reviewSubmission(raw,key,{abuseCheck,persist,fingerprint}) {
  try {
    // Trusted adapter may supply a body-reader closure. Count before reading or
    // validating, never expose this closure/dependencies as request fields.
    const allowed = await abuseCheck(fingerprint);
    if (typeof allowed !== 'boolean') throw new ApiError(503,'Service unavailable.');
    if (!allowed) throw new ApiError(429,'Please try again later.');
    const request = validateRequest(typeof raw === 'function' ? await raw() : raw,key);
    const result = await persist(request);
    if (result.conflict) throw new ApiError(409,'Request identifier already used.');
    if (result.persisted !== true || typeof result.enquiryId !== 'string' || !result.enquiryId || result.notification !== 'queued') throw new ApiError(503,'Service unavailable.');
    // queued confirms initial atomic enqueueing, not current queue state/delivery.
    return {status:result.replayed ? 200 : 201, body:{persisted:true,enquiryId:result.enquiryId,notification:'queued'}};
  } catch(error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503,'Service unavailable.');
  }
}
