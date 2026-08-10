/**
 * COMPLIANCE INTEGRATION POINTS
 * =============================
 * This file defines the exact data shapes this app needs from each
 * third-party compliance service. It intentionally does NOT import any
 * RiseWorks / Toku / Liquifi / Request Finance / Anon Aadhaar SDK, because
 * their real package names, auth flows, and method signatures are
 * versioned and change — importing a guessed SDK call would fail at build
 * time or silently do the wrong thing. Wire each `TODO(<service>)` function
 * body to the vendor's *current* docs before going to production:
 *
 *   - RiseWorks:       https://docs.rise.works
 *   - Toku:            https://www.toku.com  (request API docs via their team)
 *   - Liquifi:         https://www.liquifi.finance (vesting API — confirm via their docs)
 *   - Request Finance:  https://docs.request.finance
 *   - Anon Aadhaar:     https://documentation.anon-aadhaar.pse.dev
 *
 * Everything below is the *interface contract* your UI and contract calls
 * are built against — swap the implementation, not the shape, and the rest
 * of the app keeps working.
 */

// ---------------------------------------------------------------------
// RiseWorks — contractor onboarding / KYC / W-8 / W-9
// ---------------------------------------------------------------------
export type TaxFormType = "W-8BEN" | "W-8BEN-E" | "W-9";

export interface OnboardingStatus {
  walletAddress: string;
  kycStatus: "not_started" | "pending" | "approved" | "rejected";
  taxFormType: TaxFormType | null;
  taxFormSubmittedAt: string | null; // ISO timestamp
  countryOfResidence: string | null; // ISO 3166-1 alpha-2
  /** Hash of the underlying documents/attestation — never raw PII. This is
   *  the value written on-chain via PayrollRouter.setOnboardingStatus. */
  attestationHash: `0x${string}` | null;
}

/** TODO(RiseWorks): replace with a real call to RiseWorks' onboarding/KYC API. */
export async function fetchOnboardingStatus(_walletAddress: string): Promise<OnboardingStatus> {
  throw new Error(
    "fetchOnboardingStatus() is a stub. Wire this to RiseWorks' KYC API per https://docs.rise.works before use."
  );
}

// ---------------------------------------------------------------------
// Toku — FMV at execution + multi-jurisdictional withholding
// ---------------------------------------------------------------------
export interface FairMarketValueSnapshot {
  token: string; // e.g. "ETH"
  fiatCurrency: string; // e.g. "USD"
  fmvPerToken: number; // fiat units per 1 token, at snapshot time
  snapshotAt: string; // ISO timestamp — must match on-chain executedAt closely
}

export interface WithholdingCalculation {
  grossFiatAmount: number;
  jurisdiction: string; // ISO 3166-1 alpha-2 of the payee
  withholdingRatePct: number;
  withheldFiatAmount: number;
  netFiatAmount: number;
  netTokenAmount: number;
}

/** TODO(Toku): replace with a real call to Toku's FMV/withholding calculation API. */
export async function calculateWithholding(
  _grossFiatAmount: number,
  _jurisdiction: string,
  _fmv: FairMarketValueSnapshot
): Promise<WithholdingCalculation> {
  throw new Error(
    "calculateWithholding() is a stub. Wire this to Toku's tax/withholding API before use — do not guess withholding rates in code."
  );
}

// ---------------------------------------------------------------------
// Liquifi — vesting schedule compliance metadata (mirrors on-chain grant)
// ---------------------------------------------------------------------
export interface VestingScheduleMeta {
  grantId: `0x${string}`;
  beneficiaryWallet: string;
  cliffMonths: number;
  vestingMonths: number;
  lockupType: "standard" | "custom";
  jurisdictionNotes: string | null;
}

/** TODO(Liquifi): replace with a real call to Liquifi's vesting schedule API,
 *  used to keep off-chain compliance records in sync with the on-chain
 *  VestingGrant created in PayrollRouter.sol. */
export async function syncVestingScheduleRecord(_meta: VestingScheduleMeta): Promise<void> {
  throw new Error("syncVestingScheduleRecord() is a stub. Wire this to Liquifi's API before use.");
}

// ---------------------------------------------------------------------
// Request Finance — invoice hash + batch accounting export
// ---------------------------------------------------------------------
export interface InvoiceRecord {
  invoiceRef: `0x${string}`; // matches PayrollRecord.invoiceRef on-chain
  txHash: `0x${string}`;
  payerWallet: string;
  payeeWallet: string;
  fiatAmount: number;
  fiatCurrency: string;
  tokenAmount: string; // string to preserve full precision
  token: string;
  executedAt: string; // ISO timestamp
}

/** TODO(Request Finance): replace with a real call to Request Finance's
 *  invoicing API to register this on-chain payment for accounting export. */
export async function registerInvoiceRecord(_record: InvoiceRecord): Promise<void> {
  throw new Error("registerInvoiceRecord() is a stub. Wire this to Request Finance's API before use.");
}

// ---------------------------------------------------------------------
// Anon Aadhaar — ZK proof of identity/employment status, no PII on-chain
// ---------------------------------------------------------------------
export interface AnonAadhaarProofBundle {
  /** The proof object produced client-side by the Anon Aadhaar SDK. Its
   *  exact shape is defined by that library's circuit version — treat this
   *  as opaque and pass it straight to their verifier, don't reshape it. */
  proof: unknown;
  nullifierSeed: string;
  signalHash: `0x${string}`;
}

export interface AnonAadhaarVerificationResult {
  verified: boolean;
  /** True only if the proof also asserts age >= 18, without revealing DOB. */
  ageAbove18: boolean | null;
}

/** TODO(Anon Aadhaar): replace with a real call to the Anon Aadhaar verifier
 *  per https://documentation.anon-aadhaar.pse.dev — verification typically
 *  happens both client-side (fast UX check) and on a trusted verifier
 *  contract/service before setOnboardingStatus is called. */
export async function verifyAnonAadhaarProof(
  _bundle: AnonAadhaarProofBundle
): Promise<AnonAadhaarVerificationResult> {
  throw new Error("verifyAnonAadhaarProof() is a stub. Wire this to the Anon Aadhaar SDK/verifier before use.");
}
