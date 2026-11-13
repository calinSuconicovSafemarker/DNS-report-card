# 05: CAA check

**What to build:** The CAA card shows which certificate authorities may issue certificates for the Hostname, found by walking up the tree per RFC 8659, and fails when none are set. See the spec's CAA user stories.

**Blocked by:** 02, 03

**Status:** resolved

- [x] Walks up from the Hostname; the first CAA set found applies. The card shows the name where it was found.
- [x] Pass: a CAA set with at least one `issue` or `issuewild` tag; lists the allowed CAs (and `iodef` if present)
- [x] Fail: no CAA anywhere up the tree. The fix includes a copy-paste example CAA record.
- [x] Alias note shown when applicable (from 02)
- [x] Parses the presentation form (e.g. `0 issue "pki.goog"`) from both DNS providers
- [x] The allowed-CA list is exposed in the Check result so ticket 09 can compare issuers against it
- [x] Explanation copy for each Status is in the content module
- [x] Engine tests: CAA on the Hostname, CAA inherited from a parent, no CAA
