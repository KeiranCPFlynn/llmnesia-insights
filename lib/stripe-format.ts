/** Stripe charges ISK and UGX in hundredths for API compatibility. */
export function stripeMoney(amount: number | null, currency: string): string {
  if (amount === null) return 'Unavailable';
  const code = currency.toUpperCase();
  const format = new Intl.NumberFormat('en-US', { style: 'currency', currency: code, currencyDisplay: 'code' });
  const digits = ['ISK', 'UGX'].includes(code) ? 2 : format.resolvedOptions().maximumFractionDigits!;
  return format.format(amount / 10 ** digits);
}
