# ZK Payroll

A Next.js and Solidity proof-of-concept for **fiat-denominated, wallet-signed token payroll**. The interface lets an operator enter a contractor wallet address and a fiat amount, request a token conversion quote, and—once the required integrations and contracts are configured—submit an on-chain payroll transaction through a connected wallet.

> **Project status: prototype / integration-incomplete. Do not use for real payroll or production funds.** The UI and smart-contract code are a starting point, not a fully production-ready payroll service. The compliance-provider functions are intentionally stubbed, the contract has not been independently audited, and live deployment/network configuration has not been verified. The legal disclaimer is placeholder copy and requires jurisdiction-specific counsel review.

## At a glance

- **Frontend:** Next.js 15, React 19, TypeScript, Tailwind CSS
- **Smart contracts:** Solidity `^0.8.24`, Hardhat, OpenZeppelin contracts
- **Wallet / chain interaction:** ethers.js v6, injected browser wallet (for example, MetaMask)
- **Price quotes:** CoinGecko public Simple Price API
- **Supported quote assets:** ETH, USDC, USDT
- **Supported quote currencies:** USD, EUR, INR, GBP
- **License:** MIT (see the SPDX identifier in the contract; add a repository-level `LICENSE` file before distribution if the project is intended to be MIT-licensed)

## What the project does

ZK Payroll explores a payroll workflow where a payer enters an amount in a familiar fiat currency, receives an estimated token amount, and signs any transfer from their own wallet. The Solidity router is designed to execute standard payroll transfers atomically and emit an on-chain record for reconciliation.

The name references the project's intended privacy/compliance direction; **this repository does not currently implement an end-to-end zero-knowledge proof flow**. The Anon Aadhaar integration is a stub, not a working proof verifier.

## Features implemented in this repository

### Web application

- **Terms/disclaimer gate:** blocks interaction until the user checks the acknowledgement box and accepts.
- **Payroll form:** accepts a payee wallet address, fiat amount, fiat currency, and token selection.
- **Live conversion quote:** requests the selected asset's price from CoinGecko and calculates a token estimate.
- **Slippage allowance display:** calculates a 0.5% buffer and displays a warning about quote freshness.
- **Input validation and visible errors:** rejects invalid/non-positive amounts, malformed payee addresses, missing router configuration, and unavailable wallet/provider conditions.
- **Wallet transaction flow:** contains the approval and payroll transaction flow for a configured ERC-20 token and deployed router.
- **Transaction feedback:** displays progress/error messages and the transaction hash after a successful receipt.

### Solidity contract (`contracts/PayrollRouter.sol`)

- **Role-based access:** separates default administration, payroll administration, and compliance-oracle permissions.
- **Payee onboarding gate:** payroll execution requires the payee to be marked onboarded by an address with the compliance-oracle role.
- **Atomic ERC-20 payroll routing:** pulls tokens from the payer and forwards them to the payee in the same transaction; the operation reverts if forwarding fails.
- **Payroll event and records:** stores a record containing payer, payee, token, token amount, fiat amount/currency, fair-market-value input, timestamp, and invoice reference.
- **Vesting grants:** includes cliff and linear vesting calculations, beneficiary claims, and revocation for revocable grants.
- **Emergency controls:** payroll execution can be paused/unpaused by a payroll admin; an admin-only rescue function handles mistaken token transfers.
- **Reentrancy protection:** guarded functions use OpenZeppelin's reentrancy guard.

**Important nuance:** the contract is not purely pass-through for all operations. Vesting grants explicitly retain tokens in the contract until claimed or otherwise handled. Do not describe the entire contract as never holding funds; the net-zero-balance invariant applies to `executePayroll`, while vesting is a separate lock-up workflow.

## What's integrated versus what's still a stub

| Area | Current repository state |
|---|---|
| Next.js UI and form states | Implemented in source; runtime build not verified in this review |
| CoinGecko conversion quote | Implemented against the public endpoint; depends on network/API availability and rate limits |
| PayrollRouter contract | Source present; compilation/deployment not verified in this review |
| Automated contract tests | Tests are present under `test/`; test suite was not executed successfully in this review environment |
| Payee KYC/onboarding provider | **Stub** in `lib/compliance-types.ts`; must be implemented before payroll can proceed |
| Withholding calculations | **Stub**; no tax calculation is currently performed |
| Vesting provider sync | **Stub**; on-chain vesting logic exists, external provider sync does not |
| Invoice/finance provider | **Stub**; no live invoice integration |
| Anon Aadhaar / ZK verification | **Stub**; no proof verification is performed |
| Production price verification | Single off-chain quote source; no on-chain oracle sanity check is wired in |
| Production readiness | Not established; requires fixes, integration, security review, and legal review |

The stubs are in `lib/compliance-types.ts`. They are deliberately surfaced as errors rather than pretending third-party integrations are live.

## Repository structure

```text
zk-payroll/
├── app/                    # Next.js app entry point, layout, and global styles
├── components/             # Disclaimer modal, payroll form, token selector
├── contracts/              # PayrollRouter and mock ERC-20 contract
├── lib/
│   ├── abi/                 # Frontend ABI artifact
│   ├── compliance-types.ts  # Integration interfaces/stubs
│   └── conversion.ts        # Fiat/token quote and slippage-buffer logic
├── scripts/deploy.ts        # Hardhat deployment script
├── test/                    # PayrollRouter contract tests
├── hardhat.config.ts
├── package.json
└── .env.example
```

## Requirements

- Node.js compatible with the pinned Next.js/Hardhat dependencies (Node.js 20 LTS is a sensible starting point)
- npm
- A browser wallet such as MetaMask for wallet-flow testing
- An Ethereum RPC endpoint and testnet funds for deployment tests
- A deployed `PayrollRouter` address and correct ERC-20 token addresses for the chosen network

## Local setup

1. Clone the repository and enter the project directory.

   ```bash
   git clone <YOUR_GITHUB_REPOSITORY_URL>
   cd zk-payroll
   ```

2. Install dependencies.

   ```bash
   npm ci
   ```

   If the repository does not yet contain a committed `package-lock.json`, run `npm install` once and commit the generated lockfile; use `npm ci` in repeatable CI builds thereafter.

3. Create a local environment file.

   ```bash
   cp .env.example .env.local
   ```

   Fill in the relevant values. Never commit `.env.local`, a private key, API secrets, or seed phrases.

4. Start the web application.

   ```bash
   npm run dev
   ```

   Open `http://localhost:3000`.

## Environment variables

| Variable | Used for | Required when |
|---|---|---|
| `DEPLOYER_PRIVATE_KEY` | Hardhat deployer account | Deploying to Sepolia; use a test-only wallet |
| `SEPOLIA_RPC_URL` | Sepolia JSON-RPC endpoint | Deploying/testing against Sepolia |
| `ETHERSCAN_API_KEY` | Explorer verification configuration | Contract verification, if enabled/configured |
| `NEXT_PUBLIC_PAYROLL_ROUTER_ADDRESS` | Deployed router address | Submitting a payroll transaction from the UI |
| `NEXT_PUBLIC_USDC_ADDRESS` | USDC-compatible ERC-20 address for selected network | USDC transfer flow |
| `NEXT_PUBLIC_USDT_ADDRESS` | USDT-compatible ERC-20 address for selected network | USDT transfer flow |
| `RISEWORKS_API_KEY` | Planned onboarding integration | Only after the integration is implemented |
| `TOKU_API_KEY` | Planned withholding integration | Only after the integration is implemented |
| `LIQUIFI_API_KEY` | Planned vesting sync integration | Only after the integration is implemented |
| `REQUEST_FINANCE_API_KEY` | Planned invoice integration | Only after the integration is implemented |

`NEXT_PUBLIC_*` values are bundled into browser code and **must not contain secrets**. Contract addresses must match the active wallet network. The current form includes ETH in the selector, but the transaction implementation uses an ERC-20 `approve` flow and a zero-address placeholder for ETH; treat ETH payroll execution as unsupported until native-asset handling is implemented and tested.

## Smart-contract workflow

Compile the contracts:

```bash
npm run compile
```

Run the automated contract tests:

```bash
npm run test:contracts
```

Deploy to Sepolia only after configuring the RPC URL and a dedicated test-wallet private key:

```bash
npm run deploy:sepolia
```

The script prints the router address. Configure that address in `NEXT_PUBLIC_PAYROLL_ROUTER_ADDRESS` and configure valid token addresses for the same network.

### Roles and onboarding

The deploying address receives `DEFAULT_ADMIN_ROLE` and `PAYROLL_ADMIN_ROLE`. An administrator must grant `COMPLIANCE_ORACLE_ROLE` to the trusted onboarding/attestation service address. That service can then call `setOnboardingStatus(payee, true, attestationHash)` for approved payees. The repository does not yet supply a production-ready oracle service, and the current frontend onboarding function is a stub; therefore the UI payroll flow will stop at that check until the integration is implemented.

## Deployment

The repository includes `vercel.json` for a Next.js deployment path. Before deploying:

1. Resolve all compile/build errors and run the checks below in CI.
2. Configure only public contract addresses as `NEXT_PUBLIC_*` values.
3. Confirm the build does not rely on ignored TypeScript/lint failures; remove or justify any build-error suppression in `next.config.ts`.
4. Configure the correct chain and token contracts, wallet-network checks, and production-grade error handling.
5. Complete and test the provider integrations, price-source validation, monitoring, and incident response procedures.
6. Obtain independent smart-contract/security review and legal review before handling real funds or employee data.

## Security, privacy, and compliance notes

- This project is not audited and is not a substitute for professional legal, tax, or compliance advice.
- Blockchain transfers are generally irreversible. Use a test network and disposable test accounts while developing.
- Never place personally identifiable information (PII), API credentials, private keys, or seed phrases on-chain or in public repository files.
- The contract stores an attestation hash and onboarding boolean, not the underlying identity documents; however, addresses and transaction data remain publicly observable on a public chain.
- The current design has a single price-source dependency and the quote is off-chain. Add independent validation, stale-quote enforcement, chain/token allowlists, and careful decimals/rounding review before production.
- The current disclaimer is placeholder copy. Its legal statements must be reviewed and tailored by qualified counsel; wording alone does not determine regulatory status.
- Audit vesting lifecycle edge cases, token compatibility, role management, pausing, rescue behavior, and all privileged operations before deployment.

## Verification status for this package

The supplied archive was inspected. A dependency installation was attempted, but `npm install` did not complete in the execution environment before the command timeout. As a result, the Next.js app was **not launched**, and the Hardhat compile/test commands were **not run**. No live UI behavior or wallet transaction is claimed as verified. The existing source-level test cases are not evidence that the suite currently passes.

Before publishing, capture real browser screenshots after successfully starting the app and testing each available state: disclaimer gate, accepted/ready form, invalid amount validation, live quote success/error, invalid payee address, missing router configuration, onboarding-provider stub error, wallet missing/rejected transaction, and success/transaction hash on a local or testnet deployment. Do not publish fabricated screenshots or screenshots containing real secrets, wallet balances, or personal information.

## Contributing

Issues and pull requests are welcome. For a useful contribution, include a concise problem statement, reproduction steps, tests or a reason tests cannot be added, and screenshots for UI changes. Keep integration credentials in environment variables and update this README when behavior or configuration changes.

## License

The Solidity source declares `SPDX-License-Identifier: MIT`. Confirm the intended repository license and add a root-level `LICENSE` file with the appropriate copyright holder and year before redistributing the complete project under MIT.
