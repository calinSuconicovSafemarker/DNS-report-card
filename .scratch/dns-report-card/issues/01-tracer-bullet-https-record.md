# 01: Tracer bullet: one domain, one card, live on GitHub Pages

**What to build:** A visitor opens the deployed DNS Report Card site, types a domain or URL, and sees a Report with a working **HTTPS record** card and a Grade based on that one Check. This ticket puts the whole stack in place: project scaffold, Target normalization, the DNS client (Cloudflare only), the Report engine as the single test seam, the explanation copy module, a minimal UI, the `?d=` shareable URL, and deployment. See the spec (`.scratch/dns-report-card/spec.md`), `GLOSSARY.md`, and ADRs 0001 and 0002.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] React + TypeScript + Vite project with Vitest; a GitHub Action builds the site and deploys it to GitHub Pages (base path set for project pages)
- [x] Target normalization: strips scheme, path, port and query; lowercases; converts IDN to punycode; rejects IP addresses, `localhost` and single-label names with a friendly message
- [x] DNS client queries Cloudflare DoH JSON with `Accept: application/dns-json` and returns records in normalized presentation form
- [x] Report engine takes a Target plus an injected `fetch` and emits Check results as each one settles, then the Score and Grade
- [x] HTTPS record Check: Pass when present (shows ALPN, and whether ECH is present), Warning when absent, never Fail; the card says which name was checked
- [x] Explanation copy (What this means / How to fix) lives in its own content module, keyed by Check × Status
- [x] Minimal UI: search box, Grade display, one card
- [x] Submitting updates the URL to `?d=<hostname>`; opening such a URL runs the Report automatically
- [x] Engine tests use a fake `fetch` serving recorded fixtures: a hostname with an HTTPS record, one without, and invalid Targets
