-- One row per completed Stripe Checkout payment. Written only by the
-- stripe-webhook Edge Function (service role); users can read their own rows.
create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  email text,
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id text unique,
  stripe_customer_id text,
  amount_total integer not null,
  currency text not null,
  livemode boolean not null,
  paid_at timestamptz not null default now(),
  refunded_at timestamptz
);

create index purchases_user_id_idx on public.purchases (user_id);

alter table public.purchases enable row level security;

create policy "Users can read their own purchases"
  on public.purchases for select to authenticated
  using ((select auth.uid()) = user_id);

-- No insert/update/delete policies: only the service role writes.
revoke insert, update, delete, truncate on public.purchases from anon, authenticated;
