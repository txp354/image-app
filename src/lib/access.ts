import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

// Stripe Payment Link for the one-time purchase. Public by design (anyone can
// open a payment link); access is granted only by the stripe-webhook Edge Function.
const PAYMENT_LINK_URL = import.meta.env.VITE_STRIPE_PAYMENT_LINK_URL?.trim() || '';

/**
 * True if the signed-in user has an unrefunded purchase. RLS limits the query
 * to the user's own rows. Throws a user-readable Error if the lookup fails.
 */
export async function hasPaidAccess(): Promise<boolean> {
  const { data, error } = await supabase.from('purchases').select('id').is('refunded_at', null).limit(1);
  if (error) throw new Error('Could not check your purchase. Please refresh the page.');
  return data.length > 0;
}

/**
 * The payment link for this user, or null if it isn't configured. client_reference_id
 * lets the webhook attribute the payment to the account; prefilled_email saves typing.
 */
export function paymentLinkFor(session: Session): string | null {
  if (!PAYMENT_LINK_URL.startsWith('https://')) return null;
  const url = new URL(PAYMENT_LINK_URL);
  url.searchParams.set('client_reference_id', session.user.id);
  if (session.user.email) url.searchParams.set('prefilled_email', session.user.email);
  return url.toString();
}
