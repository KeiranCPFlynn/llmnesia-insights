/** Money stays in Stripe minor units, grouped by currency. Never sum currencies. */
export interface StripeCurrencyMetrics {
  currency: string;
  collected: number;
  refunded: number;
  collected_less_refunds: number;
  successful_payments: number;
  failed_payments: number;
  /** Current fixed-price subscription run rate, before discounts and tax. */
  mrr_before_discounts: number | null;
  arr_before_discounts: number | null;
}

export interface StripeTransaction {
  id: string;
  created: string;
  kind: 'payment' | 'refund';
  status: string;
  amount: number;
  currency: string;
  customer_id: string | null;
}

export interface StripeMetrics {
  status: 'available' | 'not_configured' | 'unavailable';
  detail?: string;
  mode?: 'live' | 'test';
  period: { start: string; end: string; time_zone: string };
  collected_at: string;
  /** Subscription state is observed now, even when payments cover a past period. */
  subscriptions_as_of?: string;
  currencies: StripeCurrencyMetrics[];
  new_customers: number | null;
  paying_customers: number | null;
  subscriptions?: {
    active: number;
    trialing: number;
    past_due: number;
    unpaid: number;
    scheduled_to_cancel: number;
    created_in_period: number;
    current_subscribers: number;
  };
  daily: Array<{ date: string; currency: string; collected: number; refunded: number; payments: number }>;
  transactions: StripeTransaction[];
  transaction_count: number;
  warnings: string[];
}
