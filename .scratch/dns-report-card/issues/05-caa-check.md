# 05: CAA check

**What to build:** The CAA card shows which certificate authorities may issue certificates for the Hostname, found by walking up the tree per RFC 8659, and fails when none are set. See the spec's CAA user stories.

**Blocked by:** 02, 03

**Status:** ready-for-agent

- [ ] Walks up from the Hostname; the first CAA set found applies. The card shows the name where it was found.
- [ ] Pass: a CAA set with at least one `issue` or `issuewild` tag; lists the allowed CAs (and `iodef` if present)
- [ ] Fail: no CAA anywhere up the tree. The fix includes a copy-paste example CAA record.
- [ ] Alias note shown when applicable (from 02)
- [ ] Parses the presentation form (e.g. `0 issue "pki.goog"`) from both DNS providers
- [ ] The allowed-CA list is exposed in the Check result so ticket 09 can compare issuers against it
- [ ] Explanation copy for each Status is in the content module
- [ ] Engine tests: CAA on the Hostname, CAA inherited from a parent, no CAA
