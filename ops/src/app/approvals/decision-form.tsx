"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { decide, type DecisionState } from "./actions";

export function DecisionForm({ id, body, canApprove }: { id: number; body: string; canApprove: boolean }) {
  const [state, action, pending] = useActionState<DecisionState, FormData>(decide, {});
  const [text, setText] = useState(body);
  const [rejecting, setRejecting] = useState(false);
  const opened = useRef(0);
  const seconds = useRef<HTMLInputElement>(null);

  useEffect(() => {
    opened.current = Date.now();
  }, [id]);

  const edited = text.trim() !== body.trim();

  return (
    <form
      action={action}
      onSubmit={() => {
        if (seconds.current) seconds.current.value = String(Math.round((Date.now() - opened.current) / 1000));
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="original" value={body} />
      <input type="hidden" name="seconds" ref={seconds} defaultValue={0} />
      <label htmlFor="body" className="mb-1.5 block text-sm font-medium">
        Draft {edited && <span className="font-normal text-ink-3">(edited)</span>}
      </label>
      <textarea
        id="body"
        name="body"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={16}
        className="min-h-64 w-full resize-y rounded-sm [field-sizing:content] border border-rule bg-paper p-3 text-[15px] leading-relaxed outline-none focus:border-signal"
      />

      {rejecting && (
        <div className="mt-3">
          <label htmlFor="note" className="mb-1.5 block text-sm font-medium">
            Why reject it?
          </label>
          <input
            id="note"
            name="note"
            autoFocus
            placeholder="e.g. Vendor is a venue, not in scope"
            className="w-full rounded-sm border border-rule bg-paper px-3 py-2 text-sm outline-none focus:border-signal"
          />
        </div>
      )}

      {state.error && (
        <p role="alert" className="mt-3 rounded-sm bg-bad-soft px-3 py-2 text-sm text-bad">
          {state.error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!rejecting ? (
          <>
            <button
              type="submit"
              name="decision"
              value="approve"
              disabled={pending || (!canApprove && !edited)}
              className="inline-flex items-center gap-1.5 rounded-sm bg-signal px-4 py-2 text-sm font-semibold text-signal-ink disabled:opacity-50"
            >
              <Check aria-hidden className="size-4" />
              {edited ? "Approve with my edits" : "Approve"}
            </button>
            <button
              type="button"
              onClick={() => setRejecting(true)}
              className="inline-flex items-center gap-1.5 rounded-sm border border-rule px-4 py-2 text-sm font-medium hover:bg-sunk"
            >
              <X aria-hidden className="size-4" />
              Reject
            </button>
            {edited && (
              <button type="button" onClick={() => setText(body)} className="px-2 py-2 text-sm text-ink-2 underline">
                Undo edits
              </button>
            )}
          </>
        ) : (
          <>
            <button
              type="submit"
              name="decision"
              value="reject"
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-sm bg-bad px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              <X aria-hidden className="size-4" />
              Reject draft
            </button>
            <button type="button" onClick={() => setRejecting(false)} className="px-2 py-2 text-sm text-ink-2 underline">
              Cancel
            </button>
          </>
        )}
      </div>
      {!canApprove && !edited && !rejecting && (
        <p className="mt-2 text-sm text-bad">
          A check failed, so this draft can’t go out as written. Edit it to fix the problem, then approve your version,
          or reject it.
        </p>
      )}
    </form>
  );
}
