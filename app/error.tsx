"use client";

import { RecoverableError } from "@/components/RecoverableError";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RecoverableError error={error} reset={reset} />;
}
