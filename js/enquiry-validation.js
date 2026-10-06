/** @typedef {import('./enquiry-contract').EnquiryPayload} EnquiryPayload */
const projectTypes = new Set(['software-web','ai','automation','iot-embedded','cybersecurity','research-product','other']);
/** Normalize only boundary whitespace; never infer facts from an enquiry. */
export function makePayload(data) {
  const text = name => String(data.get(name) || '').trim();
  return {
    schemaVersion: 1,
    fullName: text('fullName'), workEmail: text('workEmail'),
    phone: text('phone') || null, organisation: text('organisation') || null,
    projectType: text('projectType'), description: text('description'),
    preferredContactMethod: text('preferredContactMethod'),
    consent: data.get('consent') === 'on',
    consentVersion: 'enquiry-v1', source: 'company-website'
  };
}
/** @returns {import('./enquiry-contract').EnquiryErrors} */
export function validateEnquiry(payload) {
  const errors = {};
  if (payload.fullName.length < 2 || payload.fullName.length > 120) errors.fullName = 'Enter your name (2–120 characters).';
  if (payload.workEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.workEmail)) errors.workEmail = 'Enter a valid email address.';
  if (payload.phone && (payload.phone.length > 40 || !/^[+\d\s().-]+$/.test(payload.phone) || (payload.phone.match(/\d/g)||[]).length < 7 || (payload.phone.match(/\d/g)||[]).length > 15)) errors.phone = 'Enter a phone number with 7–15 digits, or leave it empty.';
  if (payload.organisation && payload.organisation.length > 160) errors.organisation = 'Use 160 characters or fewer.';
  if (!projectTypes.has(payload.projectType)) errors.projectType = 'Choose a project type.';
  if (payload.description.length < 20 || payload.description.length > 5000) errors.description = 'Describe the project in 20–5,000 characters.';
  if (!['email','phone'].includes(payload.preferredContactMethod)) errors.preferredContactMethod = 'Choose email or phone.';
  if (payload.preferredContactMethod === 'phone' && !payload.phone) errors.phone = 'Add a phone number to be contacted by phone.';
  if (payload.consent !== true) errors.consent = 'Consent is required to contact you about this enquiry.';
  return errors;
}
