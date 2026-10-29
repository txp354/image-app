// Stripe webhook: records completed Payment Link purchases in public.purchases
// and marks them refunded when the charge is fully refunded. Deployed with
// verify_jwt = false because Stripe does not send a Supabase JWT; requests are
// authenticated by the Stripe-Signature header instead.
//
// Secrets: STRIPE_WEBHOOK_SECRET (the endpoint's whsec_... signing secret).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
import { createClient } from 'npm:@supabase/supabase-js@2';

// Only purchases made through these Payment Links grant access. Add the
// live-mode link here when going live.
const ALLOWED_PAYMENT_LINKS = new Set([
  'plink_1UW1pCQuQRTaVdNXIpm0O9Gr', // test mode, $9.99
]);
const SIGNATURE_TOLERANCE_SECONDS = 300;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set');
    return new Response('Not configured', { status: 500 });
  }

  const body = await req.text();
  if (!(await verifySignature(body, req.headers.get('stripe-signature') ?? '', webhookSecret))) {
    return new Response('Invalid signature', { status: 400 });
  }

  let event;
  try {
    event = JSON.parse(body);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        await recordPurchase(event.data.object);
        break;
      case 'charge.refunded':
        await recordRefund(event.data.object);
        break;
    }
  } catch (err) {
    // 500 makes Stripe retry the delivery.
    console.error(`[stripe-webhook] ${event.type} ${event.id} failed:`, err);
    return new Response('Handler error', { status: 500 });
  }
  return Response.json({ received: true });
});

// deno-lint-ignore no-explicit-any
async function recordPurchase(session: any) {
  if (session.payment_status !== 'paid') return; // async methods complete later
  if (!ALLOWED_PAYMENT_LINKS.has(session.payment_link)) {
    console.log(`[stripe-webhook] ignoring session ${session.id} from payment link ${session.payment_link}`);
    return;
  }
  const userId = UUID_RE.test(session.client_reference_id ?? '') ? session.client_reference_id : null;
  if (!userId) console.warn(`[stripe-webhook] session ${session.id} has no valid client_reference_id`);

  // ignoreDuplicates: retries and the async_payment_succeeded follow-up must not overwrite refunded_at.
  const { error } = await supabase.from('purchases').upsert(
    {
      user_id: userId,
      email: session.customer_details?.email ?? null,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: session.payment_intent ?? null,
      stripe_customer_id: session.customer ?? null,
      amount_total: session.amount_total ?? 0,
      currency: session.currency ?? 'usd',
      livemode: Boolean(session.livemode),
    },
    { onConflict: 'stripe_checkout_session_id', ignoreDuplicates: true },
  );
  if (error) throw error;
}

// deno-lint-ignore no-explicit-any
async function recordRefund(charge: any) {
  if (!charge.refunded || !charge.payment_intent) return; // partial refunds keep access
  const { error } = await supabase
    .from('purchases')
    .update({ refunded_at: new Date().toISOString() })
    .eq('stripe_payment_intent_id', charge.payment_intent)
    .is('refunded_at', null);
  if (error) throw error;
}

/** Verifies Stripe's `t=...,v1=...` HMAC-SHA256 signature over `${t}.${body}`. */
async function verifySignature(body: string, header: string, secret: string): Promise<boolean> {
  const parts = header.split(',').map((p) => p.split('='));
  const timestamp = parts.find(([k]) => k === 't')?.[1];
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!timestamp || !signatures.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${body}`)));
  const expected = Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('');
  return signatures.some((sig) => timingSafeEqual(sig, expected));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
