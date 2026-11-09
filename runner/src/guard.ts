import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isIP } from "node:net";
import { subscriptionEnv } from "./providers/claude-code.ts";
import { RefusedError, type ProviderConfig } from "./providers/types.ts";

/**
 * Zero-spend guardrails, checked before every call. A refusal is never silently routed
 * around: the run log says which rule stopped it.
 */
export function assertAllowed(p: ProviderConfig, opts: { allowPaid: boolean }) {
  if (!p.enabled) throw new RefusedError(`${p.name} is switched off`);
  if (p.billing === "paid" && !opts.allowPaid) {
    throw new RefusedError(`${p.name} is a paid provider and paid models are off in settings`);
  }
  if (p.kind === "openai_compatible" && p.billing === "local" && !isLocalUrl(p.base_url!)) {
    throw new RefusedError(
      `${p.name} is labelled local but points at ${new URL(p.base_url!).host}. Mark it paid or fix the URL.`,
    );
  }
}

/** Loopback, private ranges, link-local, and *.local / *.lan / *.internal hostnames. */
export function isLocalUrl(raw: string) {
  let host: string;
  try {
    host = new URL(raw).hostname.replace(/^\[|\]$/g, "").toLowerCase();
  } catch {
    return false;
  }
  if (host === "localhost" || /\.(local|lan|internal|home\.arpa)$/.test(host)) return true;
  const v = isIP(host);
  if (v === 4) {
    const [a, b] = host.split(".").map(Number);
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
  }
  if (v === 6) return host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80");
  return false;
}

let subscriptionChecked: Promise<void> | undefined;

/** Confirms `claude` is signed in with a Claude plan, not an API key. Costs no usage. */
export function assertClaudeSubscription(bin = process.env.CLAUDE_BIN ?? "claude") {
  subscriptionChecked ??= (async () => {
    const { stdout } = await promisify(execFile)(bin, ["auth", "status"], { env: subscriptionEnv() });
    const status = JSON.parse(stdout) as { loggedIn?: boolean; authMethod?: string };
    if (!status.loggedIn) throw new RefusedError("Claude Code is not signed in. Run: claude auth login");
    if (status.authMethod !== "claude.ai") {
      throw new RefusedError(`Claude Code is signed in with ${status.authMethod}, not your Claude plan`);
    }
  })();
  return subscriptionChecked;
}
