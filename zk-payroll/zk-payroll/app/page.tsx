"use client";

import { useState } from "react";
import DisclaimerModal from "@/components/DisclaimerModal";
import PayrollForm from "@/components/PayrollForm";

export default function HomePage() {
  const [accepted, setAccepted] = useState(false);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-4 py-16">
      {!accepted && <DisclaimerModal onAccept={() => setAccepted(true)} />}

      <div className="text-center">
        <h1 className="text-2xl font-semibold">ZK Payroll</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Non-custodial fiat-denominated token payroll, gated by onboarding status.
        </p>
      </div>

      {accepted ? (
        <PayrollForm />
      ) : (
        <p className="text-sm text-neutral-500">Accept the terms above to continue.</p>
      )}
    </main>
  );
}
