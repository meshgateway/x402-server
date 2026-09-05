import {
  PAYMENT_HEADER,
  PAYMENT_REQUIRED_HEADER,
  PAYMENT_RESPONSE_HEADER,
  PAYMENT_SIGNATURE_HEADER,
} from './constants.js';
import { decodeBase64Json, encodeBase64Json } from './encoding.js';
import { FacilitatorClient } from './facilitator.js';
import { paymentRequirements, type RequirementsOptions } from './requirements.js';
import type {
  PaymentChallenge,
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  SettlementInfo,
} from './types.js';

export interface PaymentConfig {
  /** Merchant receiving address. */
  payTo: string;
  /** Price in dollars (number) or atomic token units (decimal string). */
  price: number | string;
  /**
   * Networks to accept, in the order they appear in the challenge.
   * Defaults to ['robinhood', 'base'].
   */
  networks?: string[];
  /** Human readable line shown in the 402 error message. */
  description?: string;
  /** Canonical URL of the paid resource. Defaults to the request URL. */
  resourceUrl?: string;
  maxTimeoutSeconds?: number;
  /** Facilitator to verify and settle against. Defaults to MeshGateway. */
  facilitator?: FacilitatorClient;
}

export type PaymentResult =
  | { paid: false; response: Response }
  | {
      paid: true;
      payer?: string;
      transaction: string;
      network: string;
      settlement: SettleResponse;
      /** Attach the payment-response receipt header to your response. */
      respond: (response: Response) => Response;
    };

function buildAccepts(config: PaymentConfig): PaymentRequirements[] {
  const networks = config.networks ?? ['robinhood', 'base'];
  return networks.map((network) =>
    paymentRequirements({
      network,
      payTo: config.payTo,
      price: config.price,
      maxTimeoutSeconds: config.maxTimeoutSeconds,
    } satisfies RequirementsOptions),
  );
}

function challengeBody(
  config: PaymentConfig,
  resourceUrl: string,
  error?: string,
): PaymentChallenge {
  return {
    x402Version: 2,
    error: error ?? `Payment is required${config.description ? ` (${config.description})` : ''}.`,
    accepts: buildAccepts(config),
    resource: { url: resourceUrl },
  };
}

/** Build a 402 Response carrying the challenge in both body and header. */
export function challengeResponse(
  config: PaymentConfig,
  resourceUrl: string,
  error?: string,
): Response {
  const body = challengeBody(config, resourceUrl, error);
  return new Response(JSON.stringify(body), {
    status: 402,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      [PAYMENT_REQUIRED_HEADER]: encodeBase64Json(body),
    },
  });
}

/** Encode the receipt header value for a successful settlement. */
export function settlementHeader(settlement: SettleResponse): string {
  const info: SettlementInfo = {
    success: true,
    transaction: settlement.transaction,
    network: settlement.network,
    payer: settlement.payer,
  };
  return encodeBase64Json(info);
}

export function readPaymentHeader(headers: Headers): string | null {
  return headers.get(PAYMENT_SIGNATURE_HEADER) ?? headers.get(PAYMENT_HEADER);
}

/**
 * Gate a fetch-style Request behind an x402 payment.
 *
 * Returns `{ paid: false, response }` with a ready 402 Response when payment
 * is missing or rejected. Returns `{ paid: true, ... }` after the facilitator
 * has verified and settled the payment on chain; serve the resource and pass
 * your Response through `result.respond()` to attach the receipt header.
 */
export async function requirePayment(
  request: Request,
  config: PaymentConfig,
): Promise<PaymentResult> {
  const resourceUrl = config.resourceUrl ?? request.url;
  const header = readPaymentHeader(request.headers);
  if (!header) {
    return { paid: false, response: challengeResponse(config, resourceUrl) };
  }

  let payload: PaymentPayload;
  try {
    payload = decodeBase64Json<PaymentPayload>(header);
  } catch {
    return {
      paid: false,
      response: challengeResponse(config, resourceUrl, 'Malformed payment header.'),
    };
  }

  const accepts = buildAccepts(config);
  const requirements = accepts.find((entry) => entry.network === payload?.accepted?.network);
  if (!requirements) {
    return {
      paid: false,
      response: challengeResponse(config, resourceUrl, 'Payment network not accepted.'),
    };
  }

  const facilitator = config.facilitator ?? new FacilitatorClient();

  const verification = await facilitator.verify(payload, requirements);
  if (!verification.isValid) {
    return {
      paid: false,
      response: challengeResponse(
        config,
        resourceUrl,
        `Payment verification failed: ${verification.invalidReason ?? 'unknown'}.`,
      ),
    };
  }

  const settlement = await facilitator.settle(payload, requirements);
  if (!settlement.success) {
    return {
      paid: false,
      response: challengeResponse(
        config,
        resourceUrl,
        `Payment settlement failed: ${settlement.errorReason ?? 'unknown'}.`,
      ),
    };
  }

  const receipt = settlementHeader(settlement);
  return {
    paid: true,
    payer: settlement.payer,
    transaction: settlement.transaction,
    network: settlement.network,
    settlement,
    respond: (response: Response) => {
      const headers = new Headers(response.headers);
      headers.set(PAYMENT_RESPONSE_HEADER, receipt);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    },
  };
}

/**
 * Wrap a fetch-style handler so it only runs after payment. Works anywhere
 * Request and Response are native: Next.js route handlers, Hono, Cloudflare
 * Workers, Bun, Deno.
 */
export function withPayment<Args extends unknown[]>(
  config: PaymentConfig,
  handler: (request: Request, ...args: Args) => Response | Promise<Response>,
): (request: Request, ...args: Args) => Promise<Response> {
  return async (request: Request, ...args: Args) => {
    const result = await requirePayment(request, config);
    if (!result.paid) return result.response;
    const response = await handler(request, ...args);
    return result.respond(response);
  };
}
