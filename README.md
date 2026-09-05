# @meshgateway/x402-server

Charge for your API with x402 payments. Zero dependencies. Verification and on-chain settlement are delegated to the MeshGateway facilitator at `https://facilitator.meshgateway.co`, so your server never touches a private key.

The flow: a request without payment gets a 402 challenge listing what you accept. The client signs a payment and retries. This package sends the signature to the facilitator, which verifies it and settles it on chain, then your handler runs and the response carries a receipt header with the transaction hash.

## Supported networks

| Network | Token | Scheme |
| --- | --- | --- |
| Robinhood Chain (`eip155:4663`) | USDG | permit2 |
| Base (`eip155:8453`) | USDC | EIP-3009 |
| Base Sepolia (`eip155:84532`) | USDC | EIP-3009 |

## Install

```bash
npm install @meshgateway/x402-server
```

## Quick start (Next.js, Hono, Workers, Bun, Deno)

Anywhere `Request` and `Response` are native:

```ts
import { withPayment } from '@meshgateway/x402-server';

export const GET = withPayment(
  {
    payTo: '0xYourWalletAddress',
    price: 0.01, // dollars; or pass atomic units as a string, '10000'
    networks: ['robinhood', 'base'],
    description: 'Weather API',
  },
  async (request) => {
    return Response.json({ forecast: 'sunny' });
  },
);
```

That is the whole integration. Unpaid requests get the 402 challenge, paid requests run your handler, and the receipt lands in the `payment-response` header.

### Manual control

```ts
import { requirePayment } from '@meshgateway/x402-server';

export async function GET(request: Request) {
  const payment = await requirePayment(request, { payTo, price: 0.01 });
  if (!payment.paid) return payment.response;

  console.log(payment.payer, payment.transaction, payment.network);
  return payment.respond(Response.json({ forecast: 'sunny' }));
}
```

`requirePayment` settles before your code runs, so by the time you serve the resource the money has already moved.

## Express

```ts
import express from 'express';
import { x402Payment } from '@meshgateway/x402-server';

const app = express();

app.get('/forecast', x402Payment({ payTo, price: 0.01 }), (req, res) => {
  res.json({ forecast: 'sunny', tx: req.x402.transaction });
});
```

## Facilitator client

Talk to the facilitator directly if you want your own flow:

```ts
import { FacilitatorClient, paymentRequirements } from '@meshgateway/x402-server';

const facilitator = new FacilitatorClient();

await facilitator.supported();
await facilitator.verify(paymentPayload, requirements);
await facilitator.settle(paymentPayload, requirements);
```

`paymentRequirements({ network, payTo, price })` builds a correct accepts entry for any supported network, including the permit2 spender contract on Robinhood Chain and the USDC EIP-712 domain on Base.

## Notes

- Prices as numbers are dollars, converted at 6 decimals. Prices as strings are atomic token units.
- The facilitator rate limits verify and settle at 120 requests per minute per IP.
- Clients can pay with [@meshgateway/x402-client](https://github.com/meshgateway/x402-client) or any x402 v2 compatible client.

## License

MIT
