-- Widens the bounds on the shared model gate so an operator can provision capacity for many users at once.
-- The gate still paces every provider call; these checks only stopped an operator from configuring more than 16 requests in flight
-- per key or 4 per user. Apply to STAGING first. Production needs the normal approval and the provider's confirmed requests-per-minute
-- for the exact key (the gate must never be set above what the provider allows, or users get 429s from the provider itself).
ALTER TABLE public.xroga_model_request_capacity DROP CONSTRAINT IF EXISTS xroga_model_request_capacity_max_in_flight_check;
ALTER TABLE public.xroga_model_request_capacity ADD CONSTRAINT xroga_model_request_capacity_max_in_flight_check CHECK (max_in_flight >= 1 AND max_in_flight <= 512);
ALTER TABLE public.xroga_model_request_capacity DROP CONSTRAINT IF EXISTS xroga_model_request_capacity_max_per_user_check;
ALTER TABLE public.xroga_model_request_capacity ADD CONSTRAINT xroga_model_request_capacity_max_per_user_check CHECK (max_per_user >= 1 AND max_per_user <= 64);
