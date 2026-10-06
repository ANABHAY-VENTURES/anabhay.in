export type ProjectType = 'software-web' | 'ai' | 'automation' | 'iot-embedded' | 'cybersecurity' | 'research-product' | 'other';
export interface EnquiryPayload {
  schemaVersion: 1;
  fullName: string;
  workEmail: string;
  phone: string | null;
  organisation: string | null;
  projectType: ProjectType;
  description: string;
  preferredContactMethod: 'email' | 'phone';
  consent: true;
  consentVersion: 'enquiry-v1';
  source: 'company-website';
}
export interface EnquiryReceipt {
  persisted: true;
  enquiryId: string;
  notification: 'queued' | 'sent';
}
export type EnquiryErrors = Partial<Record<'fullName' | 'workEmail' | 'phone' | 'organisation' | 'projectType' | 'description' | 'preferredContactMethod' | 'consent', string>>;
