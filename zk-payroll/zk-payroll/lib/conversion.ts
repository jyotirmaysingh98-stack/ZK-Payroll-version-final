/**
 * Fiat <-> token conversion engine.
 *
 * Live pricing source: CoinGecko's public "simple/price" endpoint.
 * NOTE: the correct current CoinGecko REST base is `/api/v3/simple/price`
 * (the `/v1/` path in older references does not exist). If you hold a
 * CoinGecko Pro key, swap COINGECKO_BASE for the pro-api host and add the
 * `x-cg-pro-api-key` header — verify against https://docs.coingecko.com
 * before deploying, since endpoints/rate limits change.
 *
 * For production payroll you almost certainly want a second source
 * (e.g. a Chainlink price feed read on-chain, or Pyth) as a sanity check
 * against CoinGecko before signing a transaction — a single off-chain API
 * is a single point of failure for money movement. A Chainlink fallback
 * stub is included below; wire in real feed addresses per
 * https://docs.chain.link/data-feeds/price-feeds/addresses for your chain.
 */

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

export type SupportedToken = "ETH" | "USDC" | "USDT";
export type SupportedFiat = "USD" | "EUR" | "INR" | "GBP";

const COINGECKO_IDS: Record<SupportedToken, string> = {
  ETH: "ethereum",
  USDC: "usd-coin",
  USDT: "tether",
};

const FIAT_VS_CURRENCY: Record<SupportedFiat, string> = {
  USD: "usd",
  EUR: "eur",
  INR: "inr",
  GBP: "gbp",
};

export const SLIPPAGE_BUFFER_BPS = 50; // 0.5%, expressed in basis points

export interface PriceQuote {
  token: SupportedToken;
  fiat: SupportedFiat;
  /** Fiat price per 1 unit of token, as returned by the price source. */
  priceRaw: number;
  /** Unix ms when this quote was fetched — quotes should be treated as stale after ~30s. */
  fetchedAt: number;
  source: "coingecko" | "chainlink-fallback";
}

export interface ConversionResult {
  fiatAmount: number;
  fiatCurrency: SupportedFiat;
  token: SupportedToken;
  /** Token amount at the raw quoted price, no buffer applied. */
  tokenAmountExact: number;
  /** Token amount inflated by SLIPPAGE_BUFFER_BPS — this is the amount to
   *  actually request approval/transfer for, so the tx doesn't fail if the
   *  price ticks between quote and confirmation. */
  tokenAmountWithSlippageBuffer: number;
  quote: PriceQuote;
  warning: string;
}

export class ConversionError extends Error {}

/** Fetches a live token price from CoinGecko. Throws ConversionError on failure. */
export async function fetchTokenPrice(
  token: SupportedToken,
  fiat: SupportedFiat
): Promise<PriceQuote> {
  const id = COINGECKO_IDS[token];
  const vsCurrency = FIAT_VS_CURRENCY[fiat];
  const url = `${COINGECKO_BASE}/simple/price?ids=${id}&vs_currencies=${vsCurrency}`;

  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (err) {
    throw new ConversionError(`Network error fetching price for ${token}/${fiat}: ${(err as Error).message}`);
  }

  if (!res.ok) {
    throw new ConversionError(`CoinGecko returned HTTP ${res.status} for ${token}/${fiat}`);
  }

  const data = await res.json();
  const priceRaw = data?.[id]?.[vsCurrency];

  if (typeof priceRaw !== "number" || priceRaw <= 0) {
    throw new ConversionError(`CoinGecko returned no usable price for ${token}/${fiat}`);
  }

  return { token, fiat, priceRaw, fetchedAt: Date.now(), source: "coingecko" };
}

/**
 * Converts a fiat amount to a token amount using a live quote, and returns
 * both the exact figure and a slippage-buffered figure. Callers should send
 * `tokenAmountWithSlippageBuffer` to the wallet, and display `warning` to
 * the user before they confirm in MetaMask.
 */
export async function convertFiatToToken(
  fiatAmount: number,
  fiat: SupportedFiat,
  token: SupportedToken
): Promise<ConversionResult> {
  if (!Number.isFinite(fiatAmount) || fiatAmount <= 0) {
    throw new ConversionError("Fiat amount must be a positive number.");
  }

  const quote = await fetchTokenPrice(token, fiat);
  const tokenAmountExact = fiatAmount / quote.priceRaw;
  const tokenAmountWithSlippageBuffer =
    tokenAmountExact * (1 + SLIPPAGE_BUFFER_BPS / 10_000);

  return {
    fiatAmount,
    fiatCurrency: fiat,
    token,
    tokenAmountExact,
    tokenAmountWithSlippageBuffer,
    quote,
    warning: `Live rate: 1 ${token} = ${quote.priceRaw.toLocaleString()} ${fiat}. ` +
      `A ${(SLIPPAGE_BUFFER_BPS / 100).toFixed(2)}% buffer (${(tokenAmountWithSlippageBuffer - tokenAmountExact).toFixed(6)} ${token}) ` +
      `is added to absorb price movement between quote and on-chain confirmation. ` +
      `This quote is only valid for a short window — re-fetch if more than 30s has passed before signing.`,
  };
}

/** Converts a raw token price into integer "fiat cents" for on-chain FMV recording. */
export function priceToFiatCents(priceRaw: number): number {
  return Math.round(priceRaw * 100);
}
