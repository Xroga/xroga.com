-- The dated deployed catalog had RLS enabled with no browser policies for
-- these tables. Their original CREATE migrations omitted ENABLE RLS, leaving
-- a fresh installer exposed through Supabase's default browser grants.
-- Preserve the observed server-only boundary. Do not invent browser access,
-- tenant columns, permissive policies, orphan rewrites or new constraints.
alter table public.api_priority_config enable row level security;
alter table public.audio_tracks enable row level security;
alter table public.characters enable row level security;
alter table public.community_pool enable row level security;
alter table public.influencer_commissions enable row level security;
alter table public.influencer_profiles enable row level security;
alter table public.marketplace_listings enable row level security;
alter table public.marketplace_purchases enable row level security;
alter table public.orchestrator_config enable row level security;
alter table public.scripts enable row level security;
alter table public.series_projects enable row level security;
alter table public.token_distribution_log enable row level security;
alter table public.video_jobs enable row level security;
