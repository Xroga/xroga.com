--
-- PostgreSQL database dump
--

\restrict 2x9vBAUkSsvXKG1hLap7SIKuGOD3cIz5Goo1uDlyFtgfLVshOw6k1JFmhBTgpzn

-- Dumped from database version 17.11
-- Dumped by pg_dump version 17.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: users; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.users (
    instance_id uuid,
    id uuid NOT NULL,
    aud character varying(255),
    role character varying(255),
    email character varying(255),
    encrypted_password character varying(255),
    email_confirmed_at timestamp with time zone,
    invited_at timestamp with time zone,
    confirmation_token character varying(255),
    confirmation_sent_at timestamp with time zone,
    recovery_token character varying(255),
    recovery_sent_at timestamp with time zone,
    email_change_token_new character varying(255),
    email_change character varying(255),
    email_change_sent_at timestamp with time zone,
    last_sign_in_at timestamp with time zone,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    is_super_admin boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    phone text DEFAULT NULL::character varying,
    phone_confirmed_at timestamp with time zone,
    phone_change text DEFAULT ''::character varying,
    phone_change_token character varying(255) DEFAULT ''::character varying,
    phone_change_sent_at timestamp with time zone,
    confirmed_at timestamp with time zone GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED,
    email_change_token_current character varying(255) DEFAULT ''::character varying,
    email_change_confirm_status smallint DEFAULT 0,
    banned_until timestamp with time zone,
    reauthentication_token character varying(255) DEFAULT ''::character varying,
    reauthentication_sent_at timestamp with time zone,
    is_sso_user boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    is_anonymous boolean DEFAULT false NOT NULL,
    CONSTRAINT users_email_change_confirm_status_check CHECK (((email_change_confirm_status >= 0) AND (email_change_confirm_status <= 2)))
);


--
-- Name: google_canonical_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.google_canonical_deliveries (
    id uuid NOT NULL,
    run_id uuid NOT NULL,
    user_id uuid NOT NULL,
    input_payload jsonb NOT NULL,
    source_sha text NOT NULL,
    fresh_start boolean DEFAULT false NOT NULL,
    state text DEFAULT 'pending'::text NOT NULL,
    launch_token uuid,
    launch_lease_until timestamp with time zone,
    launch_attempts integer DEFAULT 0 NOT NULL,
    operation_name text,
    worker_id text,
    lease_generation uuid,
    result_success boolean,
    result_follow_ups jsonb,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT google_canonical_deliveries_input_payload_check CHECK (((jsonb_typeof(input_payload) = 'object'::text) AND (octet_length((input_payload)::text) <= 524288))),
    CONSTRAINT google_canonical_deliveries_launch_attempts_check CHECK (((launch_attempts >= 0) AND (launch_attempts <= 5))),
    CONSTRAINT google_canonical_deliveries_source_sha_check CHECK ((source_sha ~ '^[a-f0-9]{40}$'::text)),
    CONSTRAINT google_canonical_deliveries_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'launching'::text, 'running'::text, 'superseded'::text])))
);


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    status text DEFAULT 'in_progress'::text,
    actions_used integer DEFAULT 0,
    github_repo_url text,
    github_repo_name text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT projects_status_check CHECK ((status = ANY (ARRAY['in_progress'::text, 'completed'::text, 'archived'::text]))),
    CONSTRAINT projects_type_check CHECK ((type = ANY (ARRAY['app'::text, 'website'::text, 'video'::text, 'game'::text, 'research'::text, 'automation'::text])))
);


--
-- Name: swarm_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.swarm_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    project_id uuid,
    prompt text NOT NULL,
    status text DEFAULT 'pending'::text,
    current_agent text,
    iteration_count integer DEFAULT 0,
    defects_found integer DEFAULT 0,
    output jsonb,
    error text,
    created_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    messages jsonb,
    feature_category text,
    token_usage jsonb,
    events jsonb DEFAULT '[]'::jsonb NOT NULL,
    last_sequence bigint DEFAULT 0 NOT NULL,
    worker_id text,
    heartbeat_at timestamp with time zone,
    lease_generation uuid,
    CONSTRAINT swarm_runs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'planning'::text, 'building'::text, 'reviewing'::text, 'testing'::text, 'verifying'::text, 'completed'::text, 'failed'::text, 'running'::text, 'complete'::text, 'error'::text, 'cancelled'::text])))
);


--
-- PostgreSQL database dump complete
--

\unrestrict 2x9vBAUkSsvXKG1hLap7SIKuGOD3cIz5Goo1uDlyFtgfLVshOw6k1JFmhBTgpzn

