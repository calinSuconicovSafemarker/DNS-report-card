# 07: Certificate check

**What to build:** The Certificate card shows the Latest issued certificate for the Hostname (issuer, dates, expiry countdown) and a 12-month Issuance history timeline, using Certificate Transparency data from Cert Spotter with crt.sh as the fallback. It clearly says the data shows *issued* certificates, not necessarily the one the site is serving. See the spec's Certificate user stories and ADRs 0001 and 0002.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Cert Spotter issuances API first: exact-domain query with issuer and DNS-name details; pages using `after=` (the Link header isn't readable from the browser), up to about 3 pages; 8 s timeout
- [ ] crt.sh JSON as the fallback, 20 s timeout; any network error, including 502s that arrive without CORS headers, counts as no answer
- [ ] Neither answers → Couldn't check
- [ ] The card names which service answered and says "Latest certificate issued for this name"
- [ ] Pass: Latest issued certificate (expired ones filtered out client-side) has more than 21 days left. Warning: 21 days or fewer. Fail: latest expired, or no certificates found.
- [ ] Expiry countdown shown
- [ ] Issuance history: a 12-month timeline grouped by issuer, with Status Info
- [ ] Explanation copy for each Status is in the content module
- [ ] Engine tests: Cert Spotter success (multi-page), Cert Spotter failure with crt.sh success, both failing, expiring soon, expired, none found
