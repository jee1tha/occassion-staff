import type { RoiRow } from "./queries";

export type RoiSummary = RoiRow & {
  net_sgd: number;
  /** value created per S$1 of your review time; null when no review time logged */
  return_multiple: number | null;
};

/**
 * Agents run on a Claude subscription, so the marginal cash cost per run is S$0.
 * The real cost is your time reviewing and fixing their output.
 * API-equivalent spend is kept for reference (what the same runs would cost on the API).
 */
export function summarise(row: RoiRow): RoiSummary {
  return {
    ...row,
    net_sgd: row.value_sgd - row.human_cost_sgd,
    return_multiple: row.human_cost_sgd > 0 ? row.value_sgd / row.human_cost_sgd : null,
  };
}

export function totals(rows: RoiSummary[]) {
  const value = rows.reduce((s, r) => s + r.value_sgd, 0);
  const human = rows.reduce((s, r) => s + r.human_cost_sgd, 0);
  const api = rows.reduce((s, r) => s + r.api_equiv_sgd, 0);
  const minutes = rows.reduce((s, r) => s + r.human_minutes, 0);
  return { value, human, api, minutes, net: value - human, multiple: human > 0 ? value / human : null };
}
