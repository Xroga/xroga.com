export class InsufficientTokensError extends Error {
  readonly code = 'OUT_OF_TOKENS';
  readonly statusCode = 402;
  readonly required: number;
  readonly remaining: number;
  readonly paymentLink: string;

  constructor(required: number, remaining: number) {
    const paymentLink =
      process.env.STRIPE_PAYMENT_LINK ?? `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/pricing`;
    super(
      `Insufficient tokens. Need ~${required.toLocaleString()} tokens, ${remaining.toLocaleString()} remaining. Upgrade or wait for monthly reset.`
    );
    this.name = 'InsufficientTokensError';
    this.required = required;
    this.remaining = remaining;
    this.paymentLink = paymentLink;
  }

  toJSON(): Record<string, unknown> {
    const frontend = process.env.FRONTEND_URL ?? 'https://xroga.com';
    return {
      error: this.message,
      code: this.code,
      required: this.required,
      remaining: this.remaining,
      paymentLink: this.paymentLink,
      redirect_url: `${frontend}/pricing`,
    };
  }
}
