# Environment model

`development`, `preview`, `staging`, and `production` are distinct release targets. A release manifest records its environment. Configuration compilation exposes only key presence. Production promotion requires a successful build, evidence for every required check, and a release-manager approval. No implicit environment fallback is allowed.
