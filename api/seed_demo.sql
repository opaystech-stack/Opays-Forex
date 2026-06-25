-- Seed data for demo agency

-- Set demo agency
DO $$
DECLARE
  demo_agency_id UUID;
  demo_user_id UUID;
BEGIN
  SELECT id INTO demo_agency_id FROM agencies WHERE slug = 'opays-fox-demo' LIMIT 1;
  SELECT id INTO demo_user_id FROM users WHERE email = 'demo@opays.io' LIMIT 1;

  IF demo_agency_id IS NULL OR demo_user_id IS NULL THEN
    RAISE NOTICE 'Demo agency or user not found';
    RETURN;
  END IF;

  -- Employees
  INSERT INTO employees (agency_id, first_name, last_name, phone, email, role, is_active)
  VALUES
    (demo_agency_id, 'Marie', 'Kabuya', '+243999000111', 'marie@demo.opays.io', 'cashier', true),
    (demo_agency_id, 'Peter', 'Mugisha', '+256777888999', 'peter@demo.opays.io', 'agent', true),
    (demo_agency_id, 'Claire', 'Uwase', '+250788123456', 'claire@demo.opays.io', 'supervisor', true)
  ON CONFLICT DO NOTHING;

  -- Transfers (completed internal)
  INSERT INTO transfers (agency_id, source_wallet_id, dest_agency_id, dest_wallet_id, amount, currency_code, fee, reference, note, status, initiated_by, completed_by)
  SELECT
    demo_agency_id,
    w1.id,
    demo_agency_id,
    w2.id,
    500.00,
    w1.currency_code,
    0,
    'INT-001',
    'Transfert interne test',
    'completed',
    demo_user_id,
    demo_user_id
  FROM wallets w1, wallets w2
  WHERE w1.agency_id = demo_agency_id AND w2.agency_id = demo_agency_id
    AND w1.currency_code = 'USD' AND w2.currency_code = 'UGX'
  LIMIT 1;

  -- Subscriptions
  INSERT INTO subscriptions (agency_id, plan_name, amount, currency_code, frequency, next_billing_date, created_by)
  VALUES
    (demo_agency_id, 'Pack Change Mensuel', 45.00, 'USD', 'monthly', '2026-07-25', demo_user_id),
    (demo_agency_id, 'Alertes SMS Premium', 10.00, 'USD', 'monthly', '2026-07-01', demo_user_id);

  -- Tickets
  INSERT INTO tickets (agency_id, created_by, title, description, priority, status)
  VALUES
    (demo_agency_id, demo_user_id, 'Problème de connexion API', 'Le webhook M-Pesa ne répond pas depuis ce matin.', 'high', 'open'),
    (demo_agency_id, demo_user_id, 'Demande de nouveau wallet', 'Client demande un wallet RWF supplémentaire.', 'medium', 'in_progress');

  -- Remote orders
  INSERT INTO remote_orders (agency_id, customer_phone, customer_name, type, source_currency_code, dest_currency_code, source_amount, dest_amount, source, status)
  VALUES
    (demo_agency_id, '+250788000111', 'Innocent R.', 'exchange', 'RWF', 'USD', 138000, 100, 'whatsapp', 'pending'),
    (demo_agency_id, '+256777222333', 'Sarah N.', 'exchange', 'UGX', 'USD', 3750000, 1000, 'telegram', 'pending');
END $$;
