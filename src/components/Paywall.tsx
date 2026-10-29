import { ArrowRight, Loader2 } from 'lucide-react';

interface Props {
  paymentUrl: string | null;
  /** 'confirming' while waiting for Stripe's webhook after checkout; 'pending' if it timed out. */
  checkout: 'idle' | 'confirming' | 'pending';
  error: string | null;
}

export default function Paywall({ paymentUrl, checkout, error }: Props) {
  return (
    <div className="mx-auto max-w-md border border-ink">
      <div className="bg-well px-6 py-10 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Full access</p>
        <p className="mt-3 text-5xl font-medium">$9.99</p>
        <p className="mt-2 text-xs uppercase tracking-[0.14em] text-muted">One-time payment</p>
      </div>
      <div className="space-y-5 border-t border-ink p-6">
        <ul className="space-y-2 text-sm">
          <li>Unlimited virtual try-ons</li>
          <li>No subscription, pay once</li>
          <li>Secure checkout by Stripe</li>
        </ul>

        {checkout === 'confirming' ? (
          <p role="status" className="flex items-center gap-3 border border-ink bg-well p-3 text-sm">
            <Loader2 size={16} className="shrink-0 animate-spin" /> Confirming your payment…
          </p>
        ) : (
          <>
            {checkout === 'pending' && (
              <p role="status" className="border border-ink bg-well p-3 text-sm">
                Your payment is still being processed. Refresh this page in a minute. If you weren't
                charged, you can try again below.
              </p>
            )}
            {error && (
              <p role="alert" className="border border-red-700 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}
            {paymentUrl ? (
              <a
                href={paymentUrl}
                className="flex w-full items-center justify-between bg-ink px-6 py-5 text-sm font-medium uppercase tracking-[0.14em] text-white transition hover:bg-black/80"
              >
                <span>Pay $9.99</span>
                <ArrowRight size={18} />
              </a>
            ) : (
              <p role="alert" className="border border-red-700 bg-red-50 p-3 text-sm text-red-700">
                Payments are not configured yet. Please check back soon.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
