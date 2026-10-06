/**
 * API boundary only. No endpoint is configured in this website.
 * A future server must persist the enquiry and queue its notification atomically.
 * @param {import('./enquiry-contract').EnquiryPayload} payload
 * @param {{endpoint?: string|null, requestId?: string, fetchImpl?: typeof fetch}} options
 * @returns {Promise<import('./enquiry-contract').EnquiryReceipt>}
 */
export async function submitEnquiry(payload, {endpoint = null, requestId, fetchImpl = fetch} = {}) {
  if (!endpoint) throw new Error('Online submission is not yet available. Your enquiry has not been sent or saved.');
  // Keep a configured future endpoint same-origin; never put database credentials here.
  const url = new URL(endpoint, location.origin);
  if (url.origin !== location.origin || url.protocol !== 'https:') throw new Error('Enquiry submission is unavailable. Your enquiry has not been sent.');
  if (!requestId) throw new Error('Submission could not start. Please try again.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetchImpl(url.href, {
      method:'POST', credentials:'omit', cache:'no-store', redirect:'error',
      headers:{'Content-Type':'application/json','Idempotency-Key':requestId},
      body:JSON.stringify(payload), signal:controller.signal
    });
    if (!response.ok) throw new Error('The service could not confirm your enquiry. Please try again with the same details.');
    const receipt = await response.json();
    if (receipt.persisted !== true || typeof receipt.enquiryId !== 'string' || !receipt.enquiryId.trim() || !['queued','sent'].includes(receipt.notification)) {
      throw new Error('The service did not confirm that your enquiry was saved. Please retry with the same details.');
    }
    return receipt;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The service did not respond in time. Your enquiry status is unconfirmed; retry with the same details.');
    if (error instanceof TypeError || error instanceof SyntaxError) throw new Error('The service response could not be confirmed. Please retry with the same details.');
    throw error;
  } finally { clearTimeout(timeout); }
}
