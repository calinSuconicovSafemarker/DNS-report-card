# Domain Security Report

A browser-only tool that produces a visual, plain-English security report for a domain using only public, passive lookups.

## Names

**Target**:
Whatever the user typed (a domain or URL) before normalization.
_Avoid_: Input, query, URL

**Hostname**:
The normalized, lowercase, punycode name extracted from the Target.
_Avoid_: Domain (ambiguous), host

**Zone apex**:
The top of the DNS zone that contains the Hostname, i.e. the nearest name at or above it that has its own SOA.
_Avoid_: Root domain, naked domain

**Registrable domain**:
The Hostname's public-suffix-plus-one name (e.g. `example.co.uk`), the level at which HSTS preload applies.
_Avoid_: eTLD+1, base domain

## Report

**Report**:
The full result for one Target: one Check result per Check plus the Grade.
_Avoid_: Scan, audit

**Check**:
One of the six passive tests: DNSSEC, CAA, Nameservers, HTTPS record, Certificate, HSTS preload.
_Avoid_: Test, probe, scan

**Check result**:
The outcome of one Check: a Status, a plain-English explanation, a fix, and the name it was evaluated on.
_Avoid_: Finding

**Status**:
One of Pass, Warning, Fail, Couldn't check, or Info.

**Couldn't check**:
The Status when the service a Check depends on did not answer (blocked, error, or timeout); it is not a judgement about the Target and never counts toward the Grade.
_Avoid_: Error, unknown, failed

**Verdict**:
The one-line summary of a Check result shown on its card, e.g. "Signed and validated".
_Avoid_: Title, headline

**Info**:
A Status for data shown for context that is never graded.

**Score**:
The weighted 0–100 number computed from graded Check results.

**Grade**:
The letter A–F derived from the Score.
_Avoid_: Rating, rank

## Certificates

**Latest issued certificate**:
The most recent certificate for the Hostname recorded in Certificate Transparency logs; it is not necessarily the certificate the site currently serves.
_Avoid_: Site certificate, current certificate

**CAA set**:
The CAA policy that applies to the Hostname: the CAA records at the first name found when walking up the tree from the Hostname.
_Avoid_: CAA record (for the policy as a whole)

**Issuance history**:
The timeline of certificates issued for the Hostname over the last 12 months.

## DNS

**DNS provider**:
The organisation running a nameserver, judged by its provider domain (e.g. `awsdns-21.co.uk`).
_Avoid_: Host, registrar

## HSTS

**Preload list**:
The list of names built into Chromium that browsers always load over HTTPS; a name is covered if it, or a parent marked to include subdomains, is on it.
_Avoid_: HSTS list, preload status (as a noun for the list)

## Names (aliases)

**Alias**:
A Hostname whose DNS answer is a CNAME pointing at another name, so record-level results reflect the alias target.
_Avoid_: CNAME (in user-facing copy), redirect
