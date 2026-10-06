# ANABHAY VENTURES

Official static company website. The original charcoal/ivory/gold identity, Manrope + DM Mono typography, orbital artwork, grain and particle effects are retained.

## Routes

`/`, `/about/`, `/services/`, `/projects/`, `/projects/civicsync/`, `/projects/cognitive-mobility-platform/`, `/how-we-work/`, `/careers/`, `/contact/`, plus `404.html`.

## Maintenance

Edit page copy and shared navigation/footer in `scripts/generate-pages.mjs`, then run `node scripts/generate-pages.mjs`. Generated HTML is checked in and serves without a build or JavaScript-rendered navigation. CSS is shared in `style.css`; `js/shared.js` progressively enhances the mobile menu; `script.js` is homepage-only; the contact modules are contact-only. Original assets are retained.

Run `node scripts/check-site.mjs`, `node --test scripts/enquiry.test.mjs`, and `git diff --check` before reviewing changes. Preview with `node scripts/preview.mjs` and open `http://127.0.0.1:4173/`. A local HTTP server is needed for root-relative links and JavaScript modules; opening HTML directly as a file is not supported.

## Enquiry status

The form validates and reviews input but cannot send/save an enquiry because no API is configured. It states this openly. See `docs/enquiry-integration.md` for the typed payload, server persistence/email contract, minimal proposed storage, and activation requirements. No credentials belong in browser JavaScript.

## Content and deployment

See `docs/content-sources.md` for project sources and limits. Careers links to the separate recruitment application. Deployment remains static GitHub Pages as documented previously, with `CNAME` unchanged. This implementation does not deploy or change DNS. No dependencies are required.

© 2026 ANABHAY VENTURES. All rights reserved.
