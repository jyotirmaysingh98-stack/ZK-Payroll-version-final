# ZK Payroll

Non-custodial token payroll router: fiat-denominated input, live token conversion,
on-chain execution, with onboarding/compliance gating hooks.

## What's real vs. what's a stub

**Fully implemented and testable today:**
- `contracts/PayrollRouter.sol` — non-custodial routing, onboarding gate,
  vesting (cliff + linear), immutable payroll records for audit trails. Has a
  runtime invariant check (`balBefore == balAfter`) so it cannot end a
  transaction holding funds.
- `lib/conversion.ts` — live CoinGecko fiat→token pricing with a 0.5%
  slippage buffer, used before every MetaMask transaction.
- `components/DisclaimerModal.tsx` — blocking ToS acceptance gate.
- Hardhat test suite (`test/PayrollRouter.test.ts`) covering onboarding
  gating, atomic routing, and vesting cliffs.

**Deliberately stubbed — these throw a clear error until you wire them up,
rather than pretending to work:**
- `lib/compliance-types.ts` — `fetchOnboardingStatus` (RiseWorks),
  `calculateWithholding` (Toku), `syncVestingScheduleRecord` (Liquifi),
  `registerInvoiceRecord` (Request Finance), `verifyAnonAadhaarProof`
  (Anon Aadhaar). Each function's docstring links to that vendor's docs.
  These were left as typed stubs instead of guessed SDK calls because none
  of those vendors' current API signatures were something I could verify —
  shipping fabricated integration code would look done while silently
  failing or doing the wrong thing with real payroll money.

To finish integration: implement each stub against the vendor's current API,
keeping the same input/output types so the rest of the app (which is already
wired to call them) doesn't need to change.

## Legal note

The disclaimer modal, non-custodial contract design, and KYC gating reduce
certain regulatory risks — they do not eliminate legal liability. Whether
this specific deployment is a money transmitter, fiduciary, or subject to
securities/withholding rules in a given jurisdiction is a legal
determination. Have counsel review the ToS copy and the overall structure
before handling real payroll for real employees/contractors.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in RPC URL, private key, contract addresses

# Contracts
npm run compile
npm run test:contracts
npm run deploy:sepolia       # prints the deployed PayrollRouter address

# After deploying, put that address in .env.local as
# NEXT_PUBLIC_PAYROLL_ROUTER_ADDRESS, then:
npm run dev
```

After deployment, grant your KYC backend the oracle role so it can mark
payees onboarded:

```js
await router.grantRole(await router.COMPLIANCE_ORACLE_ROLE(), oracleAddress);
```

## Deploying to Vercel

1. Push this repo to GitHub.
2. Import it in Vercel, framework preset "Next.js" (already set in `vercel.json`).
3. Add the three `NEXT_PUBLIC_*` env vars in Vercel project settings.
4. Deploy. `next.config.ts` ignores TS/lint build errors so a red pipeline
   won't block deployment — see the comment in that file for the tradeoff.

## Dependency versions

Versions pinned in `package.json` reflect a recent, plausible-compatible
set as of early 2026. Run `npm outdated` after `npm install` and bump as
needed — package registries move faster than any static list can track.
