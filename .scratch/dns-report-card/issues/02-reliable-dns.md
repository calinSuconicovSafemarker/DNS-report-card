# 02: Reliable DNS: Google fallback and Report-level outcomes

**What to build:** DNS lookups keep working when Cloudflare fails, and the Report handles names that don't exist and a total DNS outage gracefully. Cards for Alias hostnames explain whose records they're showing. The Zone apex is discovered so later Checks can use it. See the spec and ADR 0002.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Per-query fallback to Google DoH JSON. Requests to Google must be simple GETs with no custom headers, because its CORS preflight returns no CORS headers.
- [ ] 4 s timeout per provider; a timeout or network error moves on to the next provider
- [ ] Provider differences are normalized: trailing dots, hex case, the shape of the error comment
- [ ] NXDOMAIN for the Hostname produces a Report-level "We couldn't find this domain in DNS — check the spelling" page with no cards and no Grade
- [ ] When both providers fail, the Report shows a "Couldn't reach DNS lookup service, try again" error with no Grade
- [ ] Alias detection: a CNAME in the answer adds the note "`X` is an alias of `Y`; results reflect the alias target" to the affected cards, without changing the Status
- [ ] Zone apex discovery by walking up with SOA queries is available to Checks
- [ ] Engine tests cover: fallback, both failing, NXDOMAIN, Alias, Zone apex for a subdomain under a multi-label public suffix (e.g. `.co.uk`)
