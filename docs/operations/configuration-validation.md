# Configuration validation

Configuration output is limited to `{ key, configured }`. Values, authorization headers, cookies, tokens, passwords, and API keys are forbidden from evidence and errors. Required production configuration failing validation blocks readiness; optional integrations remain `unknown` or `degraded` without failing unrelated workflows.
