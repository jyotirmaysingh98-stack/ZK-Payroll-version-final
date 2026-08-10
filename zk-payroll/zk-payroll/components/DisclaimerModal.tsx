"use client";

import { useState } from "react";

interface DisclaimerModalProps {
  onAccept: () => void;
}

/**
 * Blocks all app interaction until the user affirmatively accepts.
 * IMPORTANT: this text is a starting point, not finished legal copy. Have
 * actual counsel review/replace it for your jurisdiction(s) before launch —
 * the wording of "not a money transmitter / not a fiduciary" only matters
 * if it accurately reflects what your specific deployment does.
 */
export default function DisclaimerModal({ onAccept }: DisclaimerModalProps) {
  const [checked, setChecked] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-neutral-900 p-6 text-neutral-100 shadow-2xl">
        <h2 className="text-lg font-semibold">Before you continue</h2>

        <div className="mt-4 space-y-3 text-sm leading-relaxed text-neutral-300">
          <p>
            This application is a <strong>non-custodial software interface</strong>. It
            does not hold, control, or take possession of your funds at any point.
            All token transfers are executed directly between wallet addresses via
            smart contract calls that you sign yourself.
          </p>
          <p>
            The operator of this software is <strong>not a money transmitter, payment
            processor, escrow agent, broker, or fiduciary</strong>, and does not provide
            legal, tax, or financial advice. You are solely responsible for
            determining your own tax, legal, and regulatory obligations in your
            jurisdiction, including employment classification and withholding.
          </p>
          <p>
            Fiat-to-token conversion figures shown are estimates from third-party
            price sources and may differ from the price at on-chain execution.
            Blockchain transactions are irreversible once confirmed.
          </p>
          <p>
            This placeholder text must be reviewed and finalized by qualified legal
            counsel for every jurisdiction you operate in before production use.
          </p>
        </div>

        <label className="mt-5 flex items-start gap-2 text-sm text-neutral-200">
          <input
            type="checkbox"
            className="mt-1"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          <span>
            I have read and agree to the above, and I understand this platform is a
            software provider only.
          </span>
        </label>

        <button
          type="button"
          disabled={!checked}
          onClick={() => {
            onAccept();
            setDismissed(true);
          }}
          className="mt-5 w-full rounded-lg bg-indigo-600 py-2.5 font-medium text-white transition disabled:cursor-not-allowed disabled:bg-neutral-700"
        >
          Accept &amp; Continue
        </button>
      </div>
    </div>
  );
}
