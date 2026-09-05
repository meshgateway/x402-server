import { requirePayment, type PaymentConfig } from './middleware.js';

interface NodeRequestLike {
  method?: string;
  url?: string;
  originalUrl?: string;
  protocol?: string;
  headers: Record<string, string | string[] | undefined>;
  get?: (name: string) => string | undefined;
}

interface NodeResponseLike {
  status: (code: number) => NodeResponseLike;
  set: (name: string, value: string) => NodeResponseLike;
  json: (body: unknown) => unknown;
}

function toFetchRequest(req: NodeRequestLike): Request {
  const host = req.get?.('host') ?? (req.headers.host as string | undefined) ?? 'localhost';
  const protocol = req.protocol ?? 'https';
  const url = `${protocol}://${host}${req.originalUrl ?? req.url ?? '/'}`;
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(name, value);
    else if (Array.isArray(value)) headers.set(name, value.join(', '));
  }
  return new Request(url, { method: req.method ?? 'GET', headers });
}

/**
 * Express and Connect style middleware. Responds 402 until a valid payment
 * arrives, then settles it through the facilitator and calls next(). The
 * settlement lands on `req.x402` and the receipt header is already set.
 *
 * ```ts
 * app.get('/paid', x402Payment({ payTo, price: 0.01 }), (req, res) => {
 *   res.json({ ok: true, tx: req.x402.transaction });
 * });
 * ```
 */
export function x402Payment(config: PaymentConfig) {
  return async (req: NodeRequestLike, res: NodeResponseLike, next: (err?: unknown) => void) => {
    try {
      const result = await requirePayment(toFetchRequest(req), config);
      if (!result.paid) {
        const body = await result.response.json();
        result.response.headers.forEach((value, name) => {
          if (name !== 'content-length') res.set(name, value);
        });
        res.status(result.response.status).json(body);
        return;
      }
      const receipt = result.respond(new Response(null)).headers.get('payment-response');
      if (receipt) res.set('payment-response', receipt);
      (req as NodeRequestLike & { x402?: unknown }).x402 = {
        payer: result.payer,
        transaction: result.transaction,
        network: result.network,
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}
