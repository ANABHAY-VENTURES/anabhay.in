import {makePayload,validateEnquiry} from './enquiry-validation.js';
import {submitEnquiry} from './enquiry-api.js';
const form = document.getElementById('enquiry-form');
const status = document.getElementById('form-status');
if (form && status) {
  const button = form.querySelector('button[type=button]');
  let ready = false;
  const fields = new Map();
  try {
    if (!button) throw new Error('Missing review control');
    button.disabled = true;
    // Keep review unavailable if required markup or browser support is missing.
    for (const name of ['fullName','workEmail','phone','organisation','projectType','description','preferredContactMethod','consent']) {
      const field = form.querySelector(`[name="${name}"]`);
      if (!field || !document.getElementById(`${name}-error`)) throw new Error('Incomplete form');
      fields.set(name, field);
    }
    if (typeof crypto.randomUUID !== 'function') throw new Error('Unsupported review environment');
    let busy = false, reviewed = false;
    // Kept in page memory only; preserve idempotency if a future request is retried.
    let previousPayload = '', requestId;
    function renderErrors(errors) {
      for (const name of ['fullName','workEmail','phone','organisation','projectType','description','preferredContactMethod','consent']) {
        const field = fields.get(name);
        document.getElementById(`${name}-error`).textContent = errors[name] || '';
        if (errors[name]) field.setAttribute('aria-invalid','true');
        else field.removeAttribute('aria-invalid');
      }
    }
    const readPayload = () => makePayload({get: name => {
      const field = fields.get(name);
      return name === 'consent' ? (field.checked ? 'on' : null) : field.value;
    }});
    button.addEventListener('click', async () => {
      if (!ready || busy) return;
      reviewed = true;
      const payload = readPayload();
      const errors = validateEnquiry(payload);
      renderErrors(errors);
      if (Object.keys(errors).length) {
        status.textContent = 'Please correct the highlighted fields. Nothing has been sent.';
        fields.get(Object.keys(errors)[0]).focus();
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
        for (const field of fields.values()) {
          if (field.type === 'checkbox') field.checked = field.defaultChecked;
          else field.value = field.tagName === 'SELECT' ? [...field.options].find(option => option.defaultSelected)?.value || field.options[0].value : field.defaultValue;
        }
        previousPayload = '';requestId = undefined;reviewed = false;
      } catch (error) {
        status.textContent = error.message;
      } finally {
        busy = false;button.disabled = false;form.removeAttribute('aria-busy');status.focus();
      }
    });
    form.addEventListener('input', () => {
      if (!ready) return;
      // Remove stale status/errors while editing, without interrupting typing focus.
      status.textContent = '';
      if (reviewed) renderErrors(validateEnquiry(readPayload()));
    });
    // Enter in a single-line input does nothing; textarea Enter remains editing.
    // Keyboard activation of the review button uses its normal click behavior.
    form.addEventListener('keydown', event => {
      if (event.key === 'Enter' && event.target.tagName === 'INPUT') event.preventDefault();
    });
    // Enable only after all handlers and initialization checks succeed.
    ready = true;
    button.disabled = false;
  } catch {
    if (button) button.disabled = true;
    status.textContent = 'Enquiry review is unavailable. Your enquiry has not been sent or saved.';
  }
}
