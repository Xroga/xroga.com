# Original twelve action classes

The stable IDs are unchanged. `ACTION_POLICIES` is the server-side policy floor. This table describes current policy and open coverage, not complete caller certification.

| Class | Current business classification | Required scope or remaining proof |
| --- | --- | --- |
| READ | Existing non-mutating read capability | No unnecessary high-risk confirmation. Existing read tool restrictions remain. |
| CREATE | CREATE, ADD, INSERT operations | Exact durable business permit. Other enabled adapters still need inventory reconciliation. |
| UPDATE | UPDATE, EDIT, PATCH, SET, CANCEL | Exact durable permit. Operations compatibility mapping remains mandatory. |
| DELETE | DELETE, REMOVE, DESTROY, PURGE | Exact payload/account permit, one-use claim and locked revocation check. |
| SEND_COMMUNICATION | SEND, REPLY, POST_MESSAGE, INVITE | Exact destination and message payload digest. No live sends used for testing. |
| PUBLISH | PUBLISH, DEPLOY, RELEASE | Exact artifact/target/account binding. Existing publishing paths retain their own explicit owner authorization and no Phase 3 test performs a live publish. |
| PURCHASE_OR_SPEND | PURCHASE, CHARGE, PAYMENT, BUY, CHECKOUT | Business dispatch requires a positive integer micro-USD ceiling and USD binding. Operations benchmarks additionally reserve and settle through the existing ledger against the exact approved action ceiling. Other unsupported payment effects fail closed. |
| TRANSFER_OR_FINANCIAL | TRANSFER, PAYOUT, WITHDRAW, REFUND | Same fail-closed financial scope. No payment, transfer or live transaction executed. |
| CREDENTIAL_OR_PERMISSION_CHANGE | TOKEN, PASSWORD, PERMISSION, API_KEY, CREDENTIAL, GRANT_ACCESS | Exact target/account permit. Credential writes separately require owner-bound authorization epochs, vault revision and persistence CAS. |
| SENSITIVE_DATA_EXPORT | EXPORT, DOWNLOAD | Exact payload/target permit. Complete export caller coverage still pending. |
| EXTERNAL_UPLOAD | UPLOAD, ATTACH | Exact payload/target permit. Existing publish credential upload paths still need reconciliation. |
| ADMINISTRATIVE_HIGH_RISK | Unknown consequential operations | Durable exact-action permit, no model or tool-description downgrade. Existing Operations dual control must remain. |

Classification is a conservative server floor, not a claim that every provider slug has been semantically certified. Missing classifications cannot become a permissive read route. The original 22 criteria and acceptance gate remain authoritative.
