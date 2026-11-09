"use client";

import { useActionState } from "react";
import { checkProvider, type FormState } from "./actions";

export function CheckButton({ providerKey, name }: { providerKey: string; name: string }) {
  const [, action, pending] = useActionState<FormState, FormData>(checkProvider, {});
  return (
    <form action={action}>
      <input type="hidden" name="key" value={providerKey} />
      <button
        disabled={pending}
        aria-label={`Check ${name} now`}
        className="rounded-sm border border-rule px-3 py-1.5 text-sm hover:bg-sunk disabled:opacity-50"
      >
        {pending ? "Checking…" : "Check now"}
      </button>
    </form>
  );
}
