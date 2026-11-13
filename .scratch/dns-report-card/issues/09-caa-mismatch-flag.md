# 09: Flag CAA-mismatched issuers in the Issuance history

**What to build:** In the Certificate card's Issuance history, issuers that the current CAA set would not allow are visibly flagged, so a domain owner notices possible mis-issuance or outdated CAA. The flag is informational and changes no Status or Grade.

**Blocked by:** 05, 07

**Status:** resolved

- [x] Each issuer in the timeline is matched against the allowed CAs from the CAA Check
- [x] Mismatched issuers carry a visible flag with a short plain-English explanation (CAA may have changed since issuance, or the issuance was unexpected)
- [x] No flags when there is no CAA set, or when the CAA Check was excluded
- [x] No effect on any Status, the Score or the Grade
- [x] Engine tests: all issuers allowed, one mismatched issuer, no CAA
