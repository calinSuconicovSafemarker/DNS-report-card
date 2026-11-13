# 08: HSTS preload check

**What to build:** The HSTS preload card tells a domain owner whether browsers will always use HTTPS for their Hostname because it, or a parent with include-subdomains, is on the Preload list. See the spec's HSTS preload user stories and ADR 0002 (do NOT use the hstspreload.org API: it only works on localhost).

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Downloads Chromium's preload list JSON via jsDelivr; strips the `//` comment lines before parsing; 10 s timeout; relies on the browser's HTTP cache
- [ ] Pass: the Hostname is listed, or a parent listed with `include_subdomains`; the card shows which name matched
- [ ] Warning: not listed. The fix explains the `Strict-Transport-Security` header (with an example) and links to the preload submission site.
- [ ] Never Fail; download or parse failure → Couldn't check
- [ ] Explanation copy for each Status is in the content module
- [ ] Engine tests with a trimmed list fixture: direct match, parent match with include-subdomains, parent without include-subdomains (no match), not listed, download failure
