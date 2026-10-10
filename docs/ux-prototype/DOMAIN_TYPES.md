# Command 1 domain contracts

`frontend/src/lib/osPreview.ts` exports `PreviewOutcomeContract`, `PreviewDeliverable`, `PreviewTaskNode`, `PreviewRunEvent`, `PreviewApproval`, `PreviewEvidence`, `PreviewArtifact`, `PreviewUserFacingStatus` and `PreviewFeatureAvailability`. Static `PREVIEW_FIXTURES` covers clinic, code repair and CRM/browser operations. `previewAdapter` owns the deterministic client-only transition and receipt creation. It never calls `fetch`, a provider or the existing TerminalChatContext.

The clinic contract is the complete slice. A run progresses `draft → queued → working → validating → verified` by default, with controlled `needs-approval`, `partially-complete` and `unable-to-complete` endings. All receipt evidence remains `not-executed`; actual external changes are always zero. Editable goal/constraints are labelled as local annotations: they do not imply a model regenerated the fixed fixture plan.

`frontend/src/lib/osFounderAccess.ts` has a pure, mockable authorization policy. `frontend/src/lib/osFounderAdapters.ts` defines future sanitized diagnostic records and a read-only adapter interface; Command 1 instantiates none.
