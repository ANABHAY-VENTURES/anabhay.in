# Implementation report — 6 October 2026

Work is limited to `D:\anabhay.in\anabhay-in-website`. No commit, push, deployment, DNS/repository setting changes, recruitment changes, Supabase changes, or production enquiries were made. No dependencies were installed.

## Exact files

Modified: `index.html`, `404.html`, `style.css`, `script.js`, `sitemap.xml`, `README.md`.

Added:

- `about/index.html`
- `services/index.html`
- `projects/index.html`
- `projects/civicsync/index.html`
- `projects/cognitive-mobility-platform/index.html`
- `how-we-work/index.html`
- `careers/index.html`
- `contact/index.html`
- `js/shared.js`
- `js/contact.js`
- `js/enquiry-validation.js`
- `js/enquiry-api.js`
- `js/enquiry-contract.d.ts`
- `scripts/generate-pages.mjs`
- `scripts/check-site.mjs`
- `scripts/enquiry.test.mjs`
- `scripts/preview.mjs`
- `docs/content-sources.md`
- `docs/enquiry-integration.md`
- `docs/preview-home.jpg`
- `docs/implementation-report.md` (this report)

Original brand assets, CNAME, robots.txt, manifest, license, security policy, and contribution policy remain unchanged.

## Routes and patterns

All requested folder routes exist, with verified presentations for CivicSync and Cognitive Mobility Platform. GradeWise is omitted pending source material. Navigation, footer, metadata and page copy are generated from one optional Node maintenance script; hosting remains buildless static HTML. Navigation is functional without JavaScript, with a progressively enhanced mobile menu when JavaScript is enabled. Shared JavaScript and homepage-only particle JavaScript are separate.

## Design and homepage

Preserved: circular logo, original artwork, charcoal/ivory/gold palette, Manrope/DM Mono, original hero heading and statement, orbital composition, particle interaction, grain, outlined headings, fine borders, generous spacing, and responsive stacking. Removed temporary launch indicator/date/countdown. Added capability overview, selected projects, approach, careers link, project CTA, and company footer. All pages extend the same visual patterns.

## Sources

Company capabilities and conceptual workflow are based on the owner's brief. Project descriptions are based on local CivicSync and CMP README documentation, read without changing those projects. Status and validation limitations are stated explicitly. These are documentation-backed presentations, not independent deployment verification. See content-sources.md. No adoption, ownership, metrics, certifications, or client claims were invented.

## Contact and database status

All requested fields, length/format validation, phone preference validation, consent, field errors, focus handling, status announcements, in-flight protection, typed payload and separate submission adapter are present. No endpoint is configured. Valid local form review visibly reports that the enquiry has not been sent or saved. No browser database credentials or browser storage are used.

A server/API is required to make submission operational. New Supabase schema may not be required if compatible storage already exists; this was not inspected or changed. The exact minimal proposed design is documented in enquiry-integration.md: same-origin HTTPS POST, server validation, idempotent enquiry persistence plus an atomic notification outbox, server-only credentials, RLS, email retries, abuse protection, and retention rules. Production schema work is deliberately stopped.

## SEO and accessibility

Added page-specific titles/descriptions/canonicals, Open Graph, Twitter card metadata, manifest/icons and truthful Organization/WebPage structured data. Sitemap lists nine public routes, excluding 404; robots.txt already points to it and is preserved. 404 is noindex.

Added skip link, visible keyboard focus, semantic headings/landmarks, associated labels/errors, ARIA status, current navigation indication, menu expanded/control state, Escape close with focus return, and inactive menu exclusion from focus. CSS motion effects and the homepage canvas respect reduced motion; particle work pauses while hidden.

## Verification

- Dependency-free structural HTML checks: 10 pages, balanced tag nesting, one h1, unique IDs, consistent shared navigation, internal links/anchors, assets and root-relative paths, ARIA targets, metadata/JSON-LD, manifest icons and nine sitemap entries.
- JavaScript syntax checks for every JS/MJS file.
- Eight passing Node tests: valid normalization, required/enum/email/consent rejection, optional-phone and contact-preference rules, bounds, no network call when unconfigured, strict persistence receipt/idempotency, API failure cases, origin guard, and simulated reduced-motion/visibility behavior.
- Local browser inspection: desktop homepage/contact, all new desktop routes; 320px and 390px checks across all eight new routes; 390px homepage/project/contact visual inspection; no horizontal overflow in final inspected layouts.
- Keyboard mobile menu: Enter opens, Tab reaches Home with visible focus, Escape closes and returns focus; closed links excluded from focus.
- Local form: empty review focuses first invalid field; valid synthetic input returns explicit unavailable/not-saved message. No production submission.
- No browser console errors observed in inspected pages.
- git diff --check passes after whitespace corrections.

Limits: no standards-grade HTML validator was installed; structural checks are not full HTML conformance validation. Reduced-motion preference changes were simulated in an isolated runtime rather than toggled in a browser emulation tool. No screen-reader certification, backend persistence/email test, live project deployment verification, or live-host slash redirect test is claimed.

## Owner input and concerns

Confirm service scope and public project attribution/status; supply GradeWise evidence if desired; confirm contact destination, endpoint/hosting, consent wording, retention/deletion process, privacy contact and notification recipient/sender. The current form cannot accept leads until backend activation. GitHub Pages cannot run the API. Original logo artwork remains large, and Google Fonts remains an external dependency. Static templates must be regenerated when shared markup/copy changes; README records the command. Preview screenshots are QA artifacts, not deployment evidence.
