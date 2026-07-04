-- Private bucket for GitHub OAuth tokens when github_integrations table is unavailable

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('xroga-github-tokens', 'xroga-github-tokens', false, 8192)
ON CONFLICT (id) DO NOTHING;

-- Service role manages tokens; no user-facing storage policies required
