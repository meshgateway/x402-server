import { X402_PERMIT2_PROXY, resolveNetwork } from './constants.js';
import type { PaymentRequirements } from './types.js';

/** Convert a dollar price to atomic units for a 6 decimal token. */
export function usdToAtomic(usd: number): string {
  if (!Number.isFinite(usd) || usd < 0) throw new Error(`Invalid price: ${usd}`);
  return String(Math.round(usd * 1_000_000));
}

export interface RequirementsOptions {
  /** Short id ("robinhood", "base", "base-sepolia") or CAIP-2 id. */
  network: string;
  /** Merchant receiving address. */
  payTo: string;
  /** Price in dollars (number) or atomic token units (decimal string). */
  price: number | string;
  maxTimeoutSeconds?: number;
}

/** Build one x402 v2 accepts entry for a network the facilitator supports. */
export function paymentRequirements(options: RequirementsOptions): PaymentRequirements {
  const network = resolveNetwork(options.network);
  if (!network) throw new Error(`Unknown network: ${options.network}`);

  const amount = typeof options.price === 'number' ? usdToAtomic(options.price) : options.price;
  if (!/^\d+$/.test(amount)) throw new Error(`Invalid atomic amount: ${amount}`);

  const base: PaymentRequirements = {
    scheme: 'exact',
    network: network.caip2,
    amount,
    asset: network.token,
    payTo: options.payTo,
    maxTimeoutSeconds: options.maxTimeoutSeconds ?? 300,
  };

  if (network.transferMethod === 'permit2') {
    base.extra = {
      assetTransferMethod: 'permit2',
      spender: X402_PERMIT2_PROXY,
      name: network.symbol,
    };
  } else if (network.eip712) {
    base.extra = { name: network.eip712.name, version: network.eip712.version };
  }

  return base;
}
