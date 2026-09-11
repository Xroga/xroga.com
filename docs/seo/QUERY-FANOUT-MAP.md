# Query fan-out map

This map groups user decisions; it is not a directive to publish a page for every query variation. Google explicitly warns that scaled pages created mainly to capture fan-out variants can violate spam policy.

| Decision | Core question | Supporting questions | Best current destination |
|---|---|---|---|
| Choose a product | Which AI builder fits an existing repository? | browser vs IDE vs repository; code ownership; validation; deployment evidence | `/compare`, `/alternatives` |
| Build a product | Can AI build the application type I need? | authentication; APIs; data; responsive UI; testing; deployment | `/build`, `/ai-app-builder` |
| Work in a stack | Will the agent respect my technology? | project detection; conventions; checks; runtime boundaries | `/stack` |
| Move an existing project | How do I leave a hosted builder safely? | Git export; secrets; data; hosting; rollback | `/migrate` |
| Connect providers | How does source, data, or hosting ownership work? | credentials; permissions; evidence; failure state | `/build-with`, `/integrations` |
| Prepare a release | What proof is missing before production? | security; accessibility; tests; operations; rollback | `/tools/production-readiness-checker`, `/learn/production-readiness-checklist` |
| Verify trust | What does Xroga claim and what does it not claim? | pricing; security; provider limits; founder/entity identity | `/pricing`, `/security`, `/about`, `/docs` |

Expansion rule: create a new page only when it has a distinct decision, original first-party evidence or primary sources, and enough substance that combining it with an existing page would make that page less useful.
