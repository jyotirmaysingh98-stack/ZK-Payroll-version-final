"use client";

import { useState } from "react";
import { BrowserProvider, Contract, parseUnits, encodeBytes32String, toUtf8Bytes, hexlify } from "ethers";
import TokenSelector from "./TokenSelector";
import {
  convertFiatToToken,
  priceToFiatCents,
  ConversionResult,
  ConversionError,
  SupportedFiat,
  SupportedToken,
} from "@/lib/conversion";
import { fetchOnboardingStatus } from "@/lib/compliance-types";
import PayrollRouterAbi from "@/lib/abi/PayrollRouter.json";

const PAYROLL_ROUTER_ADDRESS = process.env.NEXT_PUBLIC_PAYROLL_ROUTER_ADDRESS ?? "";

// TODO: replace with real deployed token contract addresses per network.
const TOKEN_ADDRESSES: Record<SupportedToken, string> = {
  ETH: "0x0000000000000000000000000000000000000000", // native, handled separately if you support raw ETH
  USDC: process.env.NEXT_PUBLIC_USDC_ADDRESS ?? "",
  USDT: process.env.NEXT_PUBLIC_USDT_ADDRESS ?? "",
};

const TOKEN_DECIMALS: Record<SupportedToken, number> = { ETH: 18, USDC: 6, USDT: 6 };

type Stage = "idle" | "quoting" | "checking_onboarding" | "ready" | "submitting" | "done" | "error";

export default function PayrollForm() {
  const [fiatAmount, setFiatAmount] = useState<string>("");
  const [fiatCurrency, setFiatCurrency] = useState<SupportedFiat>("USD");
  const [token, setToken] = useState<SupportedToken>("USDC");
  const [payeeAddress, setPayeeAddress] = useState<string>("");
  const [quote, setQuote] = useState<ConversionResult | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [message, setMessage] = useState<string>("");
  const [txHash, setTxHash] = useState<string | null>(null);

  async function handleGetQuote() {
    setMessage("");
    setQuote(null);
    const amount = Number(fiatAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setStage("error");
      setMessage("Enter a valid fiat amount greater than zero.");
      return;
    }

    setStage("quoting");
    try {
      const result = await convertFiatToToken(amount, fiatCurrency, token);
      setQuote(result);
      setStage("ready");
    } catch (err) {
      setStage("error");
      setMessage(err instanceof ConversionError ? err.message : "Failed to fetch live conversion rate.");
    }
  }

  async function handleSubmit() {
    if (!quote) {
      setMessage("Get a live quote before submitting.");
      return;
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(payeeAddress)) {
      setMessage("Enter a valid payee wallet address.");
      return;
    }
    if (!PAYROLL_ROUTER_ADDRESS) {
      setMessage("NEXT_PUBLIC_PAYROLL_ROUTER_ADDRESS is not configured.");
      return;
    }

    setStage("checking_onboarding");
    setMessage("Checking contractor onboarding / KYC status...");

    setStage("submitting");
    setMessage("Confirm the transaction in your wallet...");
    
    try {
      // 1. Connect to MetaMask
      if (!window.ethereum) throw new Error("No injected wallet found (e.g. MetaMask).");
      const provider = new BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();

      // 2. Define Contract and Token Variables
      const router = new Contract(PAYROLL_ROUTER_ADDRESS, PayrollRouterAbi, signer);
      const tokenAddress = TOKEN_ADDRESSES[token];
      const decimals = TOKEN_DECIMALS[token];

      // 3. Format the Math
      const tokenAmountWei = parseUnits(
        quote.tokenAmountWithSlippageBuffer.toFixed(decimals),
        decimals
      );

      // 4. ONLY approve if the token is NOT native ETH (the zero address)
      if (tokenAddress !== "0x0000000000000000000000000000000000000000") {
        const erc20 = new Contract(
          tokenAddress,
          ["function approve(address spender, uint256 amount) returns (bool)"],
          signer
        );
        const approveTx = await erc20.approve(PAYROLL_ROUTER_ADDRESS, tokenAmountWei);
        await approveTx.wait();
      }

      // 5. Prepare Payload Data
      const fiatAmountCents = Math.round(quote.fiatAmount * 100);
      const fmvAtExecution = priceToFiatCents(quote.quote.priceRaw);
      const invoiceRef = encodeBytes32String(`inv-${Date.now()}`.slice(0, 31));
      
      // Use ethers hexlify instead of Node.js Buffer to prevent browser crashes
      const fiatCurrencyBytes3 = hexlify(toUtf8Bytes(fiatCurrency));

      // 6. Attach the ETH value to the transaction if native ETH is selected
      const txOptions = tokenAddress === "0x0000000000000000000000000000000000000000" 
        ? { value: tokenAmountWei } 
        : {};

      // 7. Execute!
      const tx = await router.executePayroll(
        payeeAddress,
        tokenAddress,
        tokenAmountWei,
        fiatAmountCents,
        fiatCurrencyBytes3,
        fmvAtExecution,
        invoiceRef,
        txOptions
      );
      
      const receipt = await tx.wait();
      setTxHash(receipt.hash);
      setStage("done");
      setMessage("Payroll executed and recorded on-chain.");
      
    } catch (err) {
      setStage("error");
      setMessage((err as Error).message ?? "Transaction failed.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-4 rounded-xl border border-neutral-800 bg-neutral-950 p-6">
      <h2 className="text-base font-semibold text-neutral-100">Send Payroll</h2>

      <div className="space-y-1">
        <label className="text-xs text-neutral-400">Payee wallet address</label>
        <input
          value={payeeAddress}
          onChange={(e) => setPayeeAddress(e.target.value)}
          placeholder="0x..."
          className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-neutral-400">Fiat amount</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={fiatAmount}
            onChange={(e) => setFiatAmount(e.target.value)}
            placeholder="1000.00"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-neutral-400">Fiat currency</label>
          <select
            value={fiatCurrency}
            onChange={(e) => setFiatCurrency(e.target.value as SupportedFiat)}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
          >
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="INR">INR</option>
            <option value="GBP">GBP</option>
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-neutral-400">Payout token</label>
        <TokenSelector value={token} onChange={setToken} disabled={stage === "submitting"} />
      </div>

      <button
        type="button"
        onClick={handleGetQuote}
        disabled={stage === "quoting" || stage === "submitting"}
        className="w-full rounded-lg border border-neutral-700 py-2 text-sm font-medium text-neutral-100 hover:bg-neutral-900 disabled:opacity-50"
      >
        {stage === "quoting" ? "Fetching live rate..." : "Get live quote"}
      </button>

      {quote && (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-sm text-neutral-300">
          <p>
            <strong>{quote.tokenAmountExact.toFixed(6)}</strong> {token} at current rate
          </p>
          <p className="mt-1 text-neutral-400">
            Sending <strong>{quote.tokenAmountWithSlippageBuffer.toFixed(6)}</strong> {token} (incl. 0.5% slippage buffer)
          </p>
          <p className="mt-2 text-xs text-amber-400">{quote.warning}</p>
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!quote || stage === "submitting" || stage === "checking_onboarding"}
        className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-neutral-700"
      >
        {stage === "submitting" ? "Submitting..." : "Execute my Payroll"}
      </button>

      {message && (
        <p className={`text-sm ${stage === "error" ? "text-red-400" : "text-neutral-300"}`}>{message}</p>
      )}
      {txHash && (
        <p className="break-all text-xs text-neutral-500">Tx hash: {txHash}</p>
      )}
    </div>
  );
}

declare global {
  interface Window {
    ethereum?: any;
  }
}
