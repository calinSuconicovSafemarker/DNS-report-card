# 04: DNSSEC check

**What to build:** The DNSSEC card tells a domain owner whether their Zone apex is signed and validated, half-configured, broken, or unsigned, and what to do about it. See the spec's DNSSEC user stories and Status table.

**Blocked by:** 02, 03

**Status:** ready-for-agent

- [ ] Evaluated on the Zone apex; the card says so
- [ ] Pass: DS at the parent, DNSKEY present, and the resolver reports the answer as validated (AD flag)
- [ ] Warning: DNSKEY published but no DS. The fix explains adding DS at the registrar.
- [ ] Fail (broken): SERVFAIL normally but resolves with checking disabled (`cd`). The copy explains the domain may be unreachable for validating resolvers.
- [ ] Fail (none): no DNSSEC. The fix gives generic enable-at-provider-and-registrar steps.
- [ ] Raw details show the DS and DNSKEY records found
- [ ] Explanation copy for each Status is in the content module
- [ ] Engine tests with recorded fixtures: a signed zone (e.g. cloudflare.com), a broken zone (e.g. dnssec-failed.org), an unsigned zone, and DNSKEY without DS
