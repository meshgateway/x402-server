/** x402 v2 wire types as spoken by the MeshGateway facilitator. */

export interface PaymentRequirements {
  scheme: 'exact';
  /** CAIP-2 network id, for example "eip155:4663". */
  network: string;
  /** Amount in atomic token units, as a decimal string. */
  amount: string;
  /** ERC-20 token address. */
  asset: string;
  /** Merchant receiving address. */
  payTo: string;
  maxTimeoutSeconds?: number;
  extra?: {
    assetTransferMethod?: string;
    spender?: string;
    name?: string;
    version?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface PaymentChallenge {
  x402Version: number;
  error?: string;
  accepts: PaymentRequirements[];
  resource?: { url: string };
  extensions?: Record<string, unknown>;
}

export interface PaymentPayload {
  x402Version: number;
  accepted: PaymentRequirements;
  payload: Record<string, unknown>;
  resource?: { url: string };
  extensions?: Record<string, unknown>;
}

export interface VerifyResponse {
  isValid: boolean;
  invalidReason?: string;
  invalidMessage?: string;
  payer?: string;
  extensions?: Record<string, unknown>;
  extra?: Record<string, unknown>;
}

export interface SettleResponse {
  success: boolean;
  errorReason?: string;
  errorMessage?: string;
  payer?: string;
  transaction: string;
  network: string;
  amount?: string;
  extensions?: Record<string, unknown>;
  extra?: Record<string, unknown>;
}

export interface SupportedKind {
  x402Version: number;
  scheme: string;
  network: string;
  extra?: Record<string, unknown>;
}

export interface SupportedResponse {
  kinds: SupportedKind[];
  extensions: string[];
  signers: Record<string, string[]>;
}

export interface SettlementInfo {
  success: boolean;
  transaction: string;
  network: string;
  payer?: string;
}
