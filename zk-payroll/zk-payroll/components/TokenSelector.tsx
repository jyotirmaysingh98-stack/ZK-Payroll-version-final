"use client";

import { SupportedToken } from "@/lib/conversion";

const TOKENS: { value: SupportedToken; label: string }[] = [
  { value: "ETH", label: "ETH — Ether" },
  { value: "USDC", label: "USDC — USD Coin" },
  { value: "USDT", label: "USDT — Tether" },
];

interface TokenSelectorProps {
  value: SupportedToken;
  onChange: (token: SupportedToken) => void;
  disabled?: boolean;
}

export default function TokenSelector({ value, onChange, disabled }: TokenSelectorProps) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as SupportedToken)}
      className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 disabled:opacity-50"
    >
      {TOKENS.map((t) => (
        <option key={t.value} value={t.value}>
          {t.label}
        </option>
      ))}
    </select>
  );
}
