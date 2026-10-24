# Community field authorization — Command 007

Confirmed code defect: `CommunityService.updateComment` previously promoted a post owner's accepted-answer permission to permission for the entire request. Supplying `isAcceptedAnswer` together with `body` or `isHidden` could update another author's text or a staff-only moderation field through the service-role API. The strict input schema permits these fields together; RLS alone does not protect this privileged caller.

The fix authorizes each requested field independently. Comment authors may edit their text; post authors may accept/unaccept answers; only existing staff roles may hide comments. Combining fields requires all corresponding permissions. Denial happens before the update, not after a partial write. Existing moderator/admin/owner capabilities are preserved, not confused with founder exclusivity.

Tests cover mixed true/false acceptance flags, hiding/unhiding, foreign body changes, self-approval denial, legitimate own edits and existing staff permission. The actual disposable API integration uses two real Auth users, checks every forbidden request returns403 and the stored row remains unchanged, verifies anonymous401, and exercises accepted-answer and author-edit204 paths. New-source real CI is required; unit tests do not substitute for it.

Full-source review includes the service, route, strict schemas, role helpers and optional-auth middleware. Public cross-user community content is intentional; hidden content requires server-loaded staff role and public profiles select only identity fields. Other calls remain REVIEWED_GAP pending complete concurrency/role-revocation, locked-comment behavior, public cursor parsing, global admission registry and real table-policy coverage. This correction is not certification of the whole community service.

No production community content, roles or schema changed. Rollback is a reviewed code revert only; do not restore the vulnerable mixed-field behavior as a release workaround. PR remains draft and security release NO-GO.
