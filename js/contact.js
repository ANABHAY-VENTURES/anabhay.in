import {makePayload,validateEnquiry} from './enquiry-validation.js';
import {submitEnquiry} from './enquiry-api.js';
const form = document.getElementById('enquiry-form');
const status = document.getElementById('form-status');
if (form && status) {
  const button = form.querySelector('button[type=submit]');
  let busy = false, reviewed = false;
  // Kept in page memory only; preserve idempotency if a future request is retried.
  let previousPayload = '', requestId;
  function renderErrors(errors) {
    for (const name of ['fullName','workEmail','phone','organisation','projectType','description','preferredContactMethod','consent']) {
      const field = form.elements.namedItem(name);
      document.getElementById(`${name}-error`).textContent = errors[name] || '';
      if (errors[name]) field.setAttribute('aria-invalid','true');
      else field.removeAttribute('aria-invalid');
    }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    reviewed = true;
    const payload = makePayload(new FormData(form));
    const errors = validateEnquiry(payload);
    renderErrors(errors);
    if (Object.keys(errors).length) {
      status.textContent = 'Please correct the highlighted fields. Nothing has been sent.';
      form.elements.namedItem(Object.keys(errors)[0]).focus();
      return;
    }
    busy = true;button.disabled = true;form.setAttribute('aria-busy','true');
    status.textContent = 'Reviewing your enquiry…';
    const fingerprint = JSON.stringify(payload);
    if (fingerprint !== previousPayload) {
      previousPayload = fingerprint;
      requestId = crypto.randomUUID();
    }
    try {
      await submitEnquiry(payload, {requestId});
      // This branch is reachable only after a real API confirms persistence.
      status.textContent = 'Your enquiry has been saved and its notification queued. Thank you.';
      form.reset(); previousPayload = '';requestId = undefined;reviewed = false;
    } catch (error) {
      status.textContent = error.message;
    } finally {
      busy = false;button.disabled = false;form.removeAttribute('aria-busy');status.focus();
    }
  });
  form.addEventListener('input', () => {
    // Remove stale status/errors while editing, without interrupting typing focus.
    status.textContent = '';
    if (reviewed) renderErrors(validateEnquiry(makePayload(new FormData(form))));
  });
}
