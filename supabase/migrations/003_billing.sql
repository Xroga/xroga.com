-- Phase 5: Billing, subscriptions, invoices, free trial

-- Extend profiles for onboarding
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;

-- Extend user_actions for trial & subscription status
ALTER TABLE user_actions ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trial'
  CHECK (subscription_status IN ('trial', 'active', 'past_due', 'canceled', 'expired'));
ALTER TABLE user_actions ADD COLUMN IF NOT EXISTS trial_expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days';
ALTER TABLE user_actions ADD COLUMN IF NOT EXISTS is_trial BOOLEAN DEFAULT TRUE;
ALTER TABLE user_actions ADD COLUMN IF NOT EXISTS paddle_customer_id TEXT;
ALTER TABLE user_actions ADD COLUMN IF NOT EXISTS paddle_subscription_id TEXT;
ALTER TABLE user_actions ADD COLUMN IF NOT EXISTS renewal_date TIMESTAMPTZ;

-- Billing customers (Paddle / payment provider mapping)
CREATE TABLE IF NOT EXISTS billing_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  paddle_customer_id TEXT,
  coinbase_customer_id TEXT,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  paddle_subscription_id TEXT UNIQUE,
  plan_tier TEXT NOT NULL CHECK (plan_tier IN ('spark', 'pulse', 'nova', 'zenith', 'singularity')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled', 'paused', 'trialing')),
  region TEXT DEFAULT 'global' CHECK (region IN ('global', 'emerging')),
  currency TEXT DEFAULT 'USD',
  amount_cents INTEGER,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_paddle_id ON subscriptions(paddle_subscription_id);

-- Invoices / payment history
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  paddle_transaction_id TEXT,
  coinbase_charge_id TEXT,
  amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'pending', 'failed', 'refunded')),
  description TEXT,
  invoice_url TEXT,
  receipt_url TEXT,
  plan_tier TEXT,
  actions_purchased INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);

-- Webhook idempotency log
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB,
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(provider, event_id)
);

-- Update signup trigger: 50 free trial actions, 7-day expiry
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name, onboarding_completed)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), FALSE);

  INSERT INTO user_actions (
    user_id, plan_tier, total_actions, used_actions,
    subscription_status, is_trial, trial_expires_at, reset_date
  )
  VALUES (NEW.id, 'spark', 50, 0, 'trial', TRUE, NOW() + INTERVAL '7 days', NOW() + INTERVAL '7 days');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS for new tables
ALTER TABLE billing_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own billing_customers" ON billing_customers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users read own subscriptions" ON subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users read own invoices" ON invoices FOR SELECT USING (auth.uid() = user_id);
