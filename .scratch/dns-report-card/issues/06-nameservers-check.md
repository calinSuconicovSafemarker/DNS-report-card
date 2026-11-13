# 06: Nameservers check

**What to build:** The Nameservers card shows how resilient the Zone apex's DNS hosting is: how many nameservers there are, which providers run them, and whether they sit on different networks. See the spec's Nameservers user stories.

**Blocked by:** 02, 03

**Status:** resolved

- [x] Evaluated on the Zone apex; lists each nameserver with its provider domain (the registrable domain of the nameserver hostname) and its IPv4 addresses and /24 networks
- [x] Pass: at least 2 nameservers, at least 2 provider domains, and at least 2 distinct /24 networks
- [x] Warning: at least 2 nameservers but all from one provider or all in one /24. The copy explains the single point of failure.
- [x] Fail: fewer than 2 nameservers
- [x] No ASN or third-party IP lookups (out of scope)
- [x] Explanation copy for each Status is in the content module
- [x] Engine tests: a diverse setup, a single-provider setup, a single-/24 setup, one nameserver
