# Spec: DNS Report Card

Status: resolved

## Problem Statement

Website owners, and the non-experts who look after a domain for a small business, have no easy way to tell whether their domain's DNS and certificate setup follows good security practice. The existing tools are written for specialists: they dump raw records, assume knowledge of DNSSEC, CAA or HSTS, and don't say what to change. Many also require an account, run server-side scans, or check email setup that the person didn't ask about. People want a quick, trustworthy, visual answer to two questions: "how is my domain doing?" and "what exactly should I fix?". They also want to know that the tool only looked at public information.

## Solution

DNS Report Card is a free, static website. The user types a domain or URL and gets a visual Report. The Report has a large letter Grade and six Check cards: DNSSEC, CAA, Nameservers, HTTPS record, Certificate, and HSTS preload.

- Each card shows a Status (Pass, Warning, Fail, Couldn't check, or Info).
- Each card gives a plain-English explanation of what the result means and a concrete fix, with copy-paste examples where useful.
- Every lookup is passive and public, and runs directly from the visitor's browser. There is no backend, account or storage, and no email checks.
- If a third-party service doesn't answer, its card says "Couldn't check — no response from the service". That card is left out of the Grade instead of counting as a Fail.
- Reports are shareable via a URL that carries the domain.

## User Stories

### Entering a Target
1. As a visitor, I want a single prominent search box, so that I can start a check without reading instructions.
2. As a visitor, I want to paste a full URL (with scheme, path, port or query), so that I don't have to work out the bare Hostname myself.
3. As a visitor, I want my input lowercased and cleaned automatically, so that `HTTPS://Shop.Example.com/cart` works.
4. As a visitor with an internationalized domain, I want it converted to punycode automatically, so that non-ASCII domains can be checked.
5. As a visitor who typed an IP address, `localhost`, or a single-label name, I want a friendly message saying that only public domain names can be checked, so that I understand why nothing ran.
6. As a visitor who mistyped a domain that doesn't exist (NXDOMAIN), I want a clear "We couldn't find this domain in DNS — check the spelling" page with no cards and no Grade, so that I'm not shown a misleading F.
7. As a visitor checking a name that exists but has no web records, I want the Report to run normally, so that partial setups are still assessed.

### Report and Grade
8. As a visitor, I want a big letter Grade (A–F) with the numeric Score, so that I get the headline at a glance.
9. As a visitor, I want the Grade to show "Calculating…" until all graded Checks have settled, so that I never see a provisional Grade change under me.
10. As a visitor, I want to see "Based on N of 6 checks" when some Checks were excluded, so that I know the Grade is partial.
11. As a visitor, I want Checks marked Couldn't check left out of the Grade, so that a third-party outage doesn't lower my Grade.
12. As a visitor, I want each card to fill in as soon as its own result arrives, so that a slow certificate lookup never blocks the DNS results.
13. As a visitor, I want skeleton placeholders while cards load, so that the page feels responsive.
14. As a visitor, I want a "Run again" button, so that I can re-check after making a fix.
15. As a visitor, I want a shareable URL that includes the domain (`?d=example.com`), so that I can send the Report to a colleague or my hosting provider.
16. As a visitor opening a shared link, I want the Report to run automatically, so that I see current results.
17. As a privacy-conscious visitor, I want nothing stored in my browser and no analytics, so that my lookups aren't tracked.

### Check cards (common)
18. As a non-expert, I want each card to show a Status with an icon and a word (never color alone), so that I understand it even if I'm color-blind.
19. As a non-expert, I want a one-line verdict on each card, so that I get the gist without expanding it.
20. As a non-expert, I want to expand a card to see "What this means", so that I learn why it matters in plain English.
21. As a domain owner, I want a "How to fix" section with copy-paste examples where relevant, so that I can act on it immediately.
22. As a technical user, I want to see the raw details (records, names, values) in each card, so that I can verify the result.
23. As a visitor, I want each card to say which name it was evaluated on (e.g. "Checked on example.co.uk"), so that I understand why it may differ from what I typed.
24. As a visitor checking an Alias, I want a note saying "`www.shop.com` is an alias of `shop.cdn.net`; results reflect the alias target", so that I know whose records I'm seeing.
25. As a keyboard user, I want cards to expand and collapse with the keyboard and use proper headings, so that the page is fully accessible.

### DNSSEC
26. As a domain owner, I want to know whether my Zone apex is DNSSEC-signed and validated (DS at the parent, DNSKEY present, resolver reports validated), so that I know whether my DNS answers can be forged.
27. As a domain owner who published DNSKEY but no DS, I want a Warning explaining that the setup is only half done and that I need to add the DS record at my registrar, so that I can finish it.
28. As a domain owner whose DNSSEC is broken (answers fail validation but resolve with checking disabled), I want a Fail that explains my domain may be unreachable for validating resolvers, so that I treat it as urgent.
29. As a domain owner with no DNSSEC, I want an Info card that costs no points (many large sites skip it) with optional steps to enable it at my DNS provider and registrar, so that I know where to start.

### CAA
30. As a domain owner, I want to see which certificate authorities are allowed to issue certificates for my Hostname (found by walking up the tree), so that I know who can issue for me.
31. As a domain owner with no CAA record anywhere up the tree, I want a Fail with an example CAA record, so that I can restrict issuance.
32. As a domain owner, I want to see at which name the applicable CAA set was found, so that I understand inheritance.

### Nameservers
33. As a domain owner, I want to see my nameservers, their provider domains and their networks, so that I can judge resilience.
34. As a domain owner with at least two nameservers spread across at least two providers and at least two /24 networks, I want a Pass.
35. As a domain owner whose nameservers are all at one provider or all in one /24, I want a Warning explaining the single point of failure.
36. As a domain owner with fewer than two nameservers, I want a Fail.

### HTTPS record
37. As a domain owner, I want to know whether my Hostname publishes an HTTPS (SVCB) record and what it advertises (ALPN such as h3, whether ECH is present), so that I know whether browsers can connect faster and more privately.
38. As a domain owner without an HTTPS record, I want a Warning (never a Fail) with a note that many CDNs can add one automatically.

### Certificate
39. As a domain owner, I want to see my Latest issued certificate (issuer, validity dates and an expiry countdown), so that I can spot an upcoming expiry.
40. As a domain owner, I want the card to make clear this is the latest *issued* certificate from public logs, not necessarily the one my site is serving, so that I'm not misled.
41. As a domain owner whose Latest issued certificate has more than 21 days left, I want a Pass.
42. As a domain owner with 21 days or fewer left, I want a Warning to renew or check auto-renewal.
43. As a domain owner whose Latest issued certificate has expired, or with no certificates found, I want a Fail.
44. As a domain owner, I want an Issuance history timeline for the last 12 months grouped by issuer (Info Status), so that I can see renewal patterns and unexpected issuers.
45. As a domain owner, I want issuers that my current CAA wouldn't allow to be flagged in the timeline (informational only), so that I notice possible mis-issuance or outdated CAA.
46. As a visitor, I want the card to name which public log service answered, so that I can verify the data.
47. As a visitor, I want the card to show Couldn't check when neither certificate service answers in time, so that an outage isn't counted against me.

### HSTS preload
48. As a domain owner, I want to know whether my Hostname is on the Preload list, directly or via a parent with include-subdomains, so that I know whether browsers will always use HTTPS for it.
49. As a domain owner who is on the Preload list, I want a Pass that shows which name matched.
50. As a domain owner who isn't on it, I want a Warning (never a Fail) explaining the `Strict-Transport-Security` header and linking to the preload submission site.
51. As a visitor, I want the card to show Couldn't check if the Preload list can't be downloaded, so that the Grade isn't penalised.

### Failure handling
52. As a visitor, I want the Report to fall back to a second DNS provider if the first doesn't answer, so that one outage doesn't break everything.
53. As a visitor, I want a whole-Report error ("Couldn't reach DNS lookup service, try again") if both DNS providers fail, so that I'm not shown a meaningless Grade.

### Look and feel
54. As a visitor, I want a polished, modern design in light and dark modes, so that the Report is pleasant to read and share.
55. As a mobile visitor, I want the layout to adapt to narrow screens, so that I can check a domain from my phone.
56. As a visitor sensitive to motion, I want animations reduced when I've asked my system for that, so that the page is comfortable.
57. As a visitor, I want text contrast to meet WCAG AA in both themes, so that it is readable.

## Implementation Decisions

- **Architecture**: a static React + TypeScript + Vite single-page app with no backend. All lookups run from the browser (ADR 0001). Deployed to GitHub Pages via a GitHub Action, under the name DNS Report Card (repo `dns-report-card`).
- **Modules**:
  - **Target normalization**: Target → Hostname, or a typed rejection (IP, localhost, single label, invalid). Strips scheme, path, port and query; lowercases; converts to punycode.
  - **DNS client**: DNS-over-HTTPS JSON queries. Cloudflare first (requires `Accept: application/dns-json`), falling back to Google per query. Google requests must be simple GETs with no custom headers, because its CORS preflight lacks CORS headers. Supports the checking-disabled flag. Normalizes provider differences: trailing dots, hex case, the shape of the error comment field. Records are returned in presentation form (e.g. CAA `0 issue "pki.goog"`). Timeout is 4 s per provider.
  - **Name resolution helpers**: finding the Zone apex by walking up with SOA queries; walking up the tree for CAA (RFC 8659); detecting an Alias from a CNAME in the answer; deriving the Registrable domain.
  - **Six Check modules** (DNSSEC, CAA, Nameservers, HTTPS record, Certificate, HSTS preload). Each turns lookups into a Check result: Status, verdict, which name was checked, details, and an optional Alias note.
  - **Certificate source**: Cert Spotter issuances API first (keyless; exact-domain query; pages with `after=` because the Link header isn't exposed to the browser; issuances come oldest first, so it reads to the last page, up to 10 pages, and a listing cut off by that cap is treated as no answer (falling back to crt.sh) rather than judged; expired certificates filtered on the client for the "latest" view), timeout 8 s. crt.sh JSON as the fallback, timeout 20 s. crt.sh returns 502 responses without CORS headers, which the browser surfaces as a generic network error; treat that as no answer (ADR 0002).
  - **Preload list source**: Chromium's `transport_security_state_static.json` via jsDelivr. The file starts with `//` comment lines, which must be stripped before JSON parsing. Timeout 10 s; the browser's HTTP cache handles repeat visits. The hstspreload.org API must not be used: it works on localhost but is blocked once deployed (ADR 0002).
  - **Grading**: Pass = 1, Warning = 0.5, Fail = 0. Weights: DNSSEC 25, Nameservers 20, Certificate 20, CAA 15, HTTPS record 10, HSTS preload 10. Couldn't check and Info results are excluded and the remaining weights are rescaled (only Couldn't check lowers "Based on N of 6"). Score 0–100, rounded only for display; the Grade thresholds apply to the unrounded Score: A ≥ 90, B ≥ 75, C ≥ 60, D ≥ 40, otherwise F. No single Fail caps the Grade.
  - **Report engine**: the single seam. Input: a Target plus an injected `fetch`. Output: the Report, delivered progressively (each Check result as it settles, then Score and Grade), or a Report-level outcome (invalid Target, NXDOMAIN, DNS unreachable). All Checks start in parallel.
  - **Explanation copy**: a content module holding the "What this means" and "How to fix" text for each Check × Status, kept separate from the Check logic. Fixes are generic and never assume a particular DNS provider.
  - **UI**: search bar, Grade ring, a 3×2 card grid, expandable cards with skeletons, light/dark themes, responsive layout. Plain CSS with design tokens and no component library; icons from `lucide-react`. Reads and writes the `?d=` query parameter. No storage and no analytics.
- **Status rules** (settled during grilling):

| Check | Pass | Warning | Fail |
|---|---|---|---|
| DNSSEC (Zone apex) | DS at parent + DNSKEY + resolver reports validated | DNSKEY but no DS; or DS + DNSKEY but the resolver doesn't report the answer as validated (`not-validated`) | Broken (SERVFAIL normally, resolves with checking disabled) | No DNSSEC at all → Info: no points either way, since many large sites skip it.
| CAA (tree walk from Hostname) | CAA set with ≥1 `issue`/`issuewild` | — | No CAA anywhere up the tree, or a CAA set that names no certificate authority (e.g. `iodef` only), each with its own copy |
| Nameservers (Zone apex) | ≥2 NS, ≥2 provider domains, ≥2 /24 networks | ≥2 NS but one provider or one /24 | <2 NS |
| HTTPS record (Hostname) | Record present | Absent | — |
| Certificate (Hostname) | Latest issued certificate >21 days left | ≤21 days left | Expired, or none found |
| HSTS preload (Hostname or parent with include-subdomains) | On the Preload list | Not on it | — |

  Any check whose service doesn't answer → Couldn't check. A DNS answer with an error RCODE other than NXDOMAIN (e.g. SERVFAIL) is also Couldn't check, never "no records" (the DNSSEC broken-detection path is the exception, by design). The Issuance history is shown as Info.

- **Settled additions** (added during implementation, kept after code review):
  - The DNSSEC `not-validated` Warning: DS and DNSKEY are present, but the resolver doesn't set the AD flag.
  - The Scorecard panel: an at-a-glance list of the six Checks with their weight and current Status.
  - The Grade summary sentence under the Hostname (e.g. "Excellent. This domain follows good practice.").
  - The "Try again" button on the DNS-unreachable page.
  - A 60 s per-Check safety timeout in the Report engine: a Check that hasn't settled by then becomes Couldn't check, so no card spins forever.

## Testing Decisions

- **One seam: the Report engine.** Tests give it a Target and a fake `fetch` that serves saved real-world responses (fixtures) by URL. They assert on the Report it produces: Statuses, verdicts, names checked, Alias notes, Score, Grade, the excluded-check count, and Report-level outcomes.
- Good tests check only externally visible behavior: what the Report says for a given set of network responses. They never call internal helpers directly, so the internals can be refactored freely.
- Coverage through the seam:
  - Target normalization and rejections, NXDOMAIN
  - Cloudflare → Google fallback, and both failing
  - Timeouts and network errors becoming Couldn't check
  - Cert Spotter → crt.sh fallback
  - Preload list matching, including a parent with include-subdomains
  - Every Pass/Warning/Fail row of the table above
  - Alias detection
  - Grade calculation with exclusions
- Fixtures are recorded from real responses: a signed zone, a broken zone (e.g. `dnssec-failed.org`), an unsigned zone, a zone with CAA, an Alias, Google's trailing-dot and uppercase-hex variants, Cert Spotter pages, a crt.sh response, and a trimmed Preload list.
- Tool: Vitest. There's no existing test code (greenfield), so no prior art. The UI is not tested in v1, and there are no end-to-end browser tests.

## Out of Scope

- Email security checks (SPF, DKIM, DMARC, MTA-STS, MX).
- Active probing: opening TLS connections, fetching the site, reading live HTTP headers, port scanning.
- Any backend, proxy, serverless function, account, saved history, analytics, or scheduled monitoring.
- ASN or hosting-company lookups for nameserver diversity (/24 is used instead).
- Showing "pending" or "rejected" HSTS preload states.
- Bulk or multi-domain reports, PDF export, API access.
- End-to-end browser tests.

## Further Notes

- Browser-access (CORS) behavior of every service was verified with curl on 2026-11-13, not in a real browser; the first build should confirm it in a browser.
- Cert Spotter's keyless rate limit was 100 for exact-domain queries, but the reset window and terms of use weren't confirmed. Heavy use may hit the limit, in which case the crt.sh fallback and Couldn't check apply.
- The Preload list via jsDelivr `@main` can lag Chromium by a few hours because of CDN caching. That's acceptable.
- Glossary: `GLOSSARY.md`. Decisions: `docs/adr/0001-browser-only-no-backend.md`, `docs/adr/0002-third-party-data-sources.md`.
