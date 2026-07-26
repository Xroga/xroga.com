# Research security and prompt injection

Status: **Implemented regression controls**.

External content is untrusted data, never system authority. Research URLs are checked against SSRF/private-network targets, redirects are bounded, secrets are redacted, content size is capped and repository/web instructions cannot override platform or owner authorization. Provider errors are normalized before user display.
