/* oxlint-disable anti-slop/no-unknown-parameters -- This parser owns validation of the untrusted server usage-limits payload before projecting quota values. */
import type { ProviderLimitStatus, ProviderLimitWindow } from '../shared/protocol';
import { asRecord, isBoolean, isNumber, isString } from '../shared/type-utils';

/** Decode the server-owned Console account without reading credentials on this host. */
export function projectOpenCodeUsageLimits(
  value: unknown,
  providerID: string,
  modelID: string | null,
  checkedAt: number
): ProviderLimitStatus {
  const info = asRecord(value);
  const workspace = asRecord(info?.workspace);
  if (!info || !isString(workspace?.id) || !Array.isArray(info.budgets))
    throw new Error('Invalid OpenCode usage limits response');
  const windows: ProviderLimitWindow[] = [];
  const go = asRecord(info.go);
  if (providerID === 'opencode-go' && info.go !== undefined && !go)
    throw new Error('Invalid OpenCode Go allowance');
  if (go && providerID === 'opencode-go') {
    for (const [key, id, label] of [
      ['rolling', 'five_hour', '5 hour'],
      ['weekly', 'weekly', 'Weekly'],
      ['monthly', 'monthly', 'Monthly'],
    ] as const) {
      const meter = asRecord(go[key]);
      if (
        !isNumber(meter?.percent) ||
        !Number.isFinite(meter.percent) ||
        meter.percent < 0 ||
        meter.percent > 100 ||
        !isNumber(meter.resetsAt) ||
        !Number.isFinite(meter.resetsAt) ||
        !isBoolean(meter.limited)
      )
        throw new Error('Invalid OpenCode Go allowance');
      windows.push({
        id,
        label,
        unit: 'unknown',
        remaining: meter.limited ? 0 : 100 - meter.percent,
        limit: 100,
        resetAt: meter.resetsAt,
        percent: meter.limited ? 100 : meter.percent,
      });
    }
  }
  for (const entry of info.budgets) {
    const budget = asRecord(entry);
    if (
      !budget ||
      !isString(budget.id) ||
      !isNumber(budget.limit) ||
      !Number.isFinite(budget.limit) ||
      budget.limit < 0 ||
      !isNumber(budget.spent) ||
      !Number.isFinite(budget.spent) ||
      budget.spent < 0 ||
      !isNumber(budget.resetsAt) ||
      !Number.isFinite(budget.resetsAt) ||
      !Array.isArray(budget.models) ||
      !['all', 'models'].includes(String(budget.coverage)) ||
      !['model', 'set'].includes(String(budget.per))
    )
      throw new Error('Invalid OpenCode Console budget');
    const model = budget.models
      .map(asRecord)
      .find((item) => item?.providerID === providerID && item.modelID === modelID);
    // Go bills its own allowance, not the Console-wide paid-model budget.
    if (budget.coverage === 'all' && providerID === 'opencode-go') continue;
    // A per-model budget needs the selected model's spend, never the largest spend of another model.
    if (budget.coverage !== 'all' && !model) continue;
    if (budget.per === 'model' && !model) continue;
    if (
      model?.spent !== undefined &&
      (!isNumber(model.spent) || !Number.isFinite(model.spent) || model.spent < 0)
    )
      throw new Error('Invalid OpenCode model budget spend');
    const spent =
      budget.per === 'model' ? (model && isNumber(model.spent) ? model.spent : 0) : budget.spent;
    windows.push({
      id: `budget:${budget.id}`,
      label: budget.shared ? 'Shared monthly budget' : 'Monthly budget',
      unit: 'usd',
      remaining: Math.max(0, budget.limit - spent),
      limit: budget.limit,
      percent: budget.limit > 0 ? Math.min(100, (spent / budget.limit) * 100) : 100,
      resetAt: budget.resetsAt,
    });
  }
  if (!windows.length)
    return {
      providerID,
      modelID,
      checkedAt,
      source: 'opencode',
      status: 'unsupported',
      note: 'The connected Console workspace has no applicable allowance or budget.',
    };
  return {
    providerID,
    modelID,
    checkedAt,
    source: 'opencode',
    status: 'available',
    windows,
    planName: go && providerID === 'opencode-go' ? 'Go' : undefined,
    note: isString(workspace.name)
      ? `OpenCode Console workspace: ${workspace.name}`
      : 'OpenCode Console workspace limits',
  };
}
