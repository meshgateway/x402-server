import { FACILITATOR_URL } from './constants.js';
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  SupportedResponse,
  VerifyResponse,
} from './types.js';

export interface FacilitatorOptions {
  /** Facilitator base URL. Defaults to https://facilitator.meshgateway.co. */
  baseUrl?: string;
  /** Custom fetch implementation. Defaults to globalThis.fetch. */
  fetch?: typeof fetch;
  /** Request timeout in milliseconds. Defaults to 30000. */
  timeoutMs?: number;
}

/** Thin HTTP client for the MeshGateway x402 facilitator. */
export class FacilitatorClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: FacilitatorOptions = {}) {
    this.baseUrl = (options.baseUrl ?? FACILITATOR_URL).replace(/\/$/, '');
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    return (await res.json()) as T;
  }

  /** Check a payment signature without moving funds. */
  verify(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    return this.post<VerifyResponse>('/verify', {
      x402Version: 2,
      paymentPayload,
      paymentRequirements,
    });
  }

  /** Execute the payment on chain and return the transaction hash. */
  settle(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    return this.post<SettleResponse>('/settle', {
      x402Version: 2,
      paymentPayload,
      paymentRequirements,
    });
  }

  /** List the schemes and networks the facilitator supports. */
  async supported(): Promise<SupportedResponse> {
    const res = await this.fetchImpl(`${this.baseUrl}/supported`, {
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`Facilitator /supported failed with status ${res.status}`);
    return (await res.json()) as SupportedResponse;
  }
}
