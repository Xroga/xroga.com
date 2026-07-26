# Synthetic monitoring

Synthetics must record URL/route, expected invariant, status, duration, time, release, and evidence reference. Checks never emit success before the request completes. Current CI performs endpoint probes; scheduled authenticated synthetics and alert delivery are not configured and remain external work.
