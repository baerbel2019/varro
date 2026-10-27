import { describe, expect, it } from 'vitest';
import { projectOpenCodeUsageLimits } from './opencode-usage-limits';

const budget = {
  id: 'budget',
  limit: 10,
  spent: 9,
  resetsAt: 10000,
  coverage: 'models',
  per: 'model',
  scope: 'each',
  shared: false,
  models: [{ providerID: 'routed', modelID: 'chat', spent: 2 }],
};
const info = { workspace: { id: 'org', name: 'Team' }, budgets: [budget] };

describe('OpenCode Console limits projection', () => {
  it('uses selected-model spend instead of the largest per-model spend', () => {
    expect(projectOpenCodeUsageLimits(info, 'routed', 'chat', 1)).toMatchObject({
      status: 'available',
      windows: [{ remaining: 8, limit: 10, percent: 20, resetAt: 10000 }],
    });
  });
  it("treats omitted per-model spend as zero rather than another model's spend", () => {
    expect(
      projectOpenCodeUsageLimits(
        { ...info, budgets: [{ ...budget, models: [{ providerID: 'routed', modelID: 'chat' }] }] },
        'routed',
        'chat',
        1
      )
    ).toMatchObject({
      status: 'available',
      windows: [{ remaining: 10, percent: 0 }],
    });
  });
  it('does not charge Console-wide budgets against a Go allowance', () => {
    expect(
      projectOpenCodeUsageLimits(
        { ...info, budgets: [{ ...budget, per: 'set', coverage: 'all' }] },
        'opencode-go',
        'chat',
        1
      )
    ).toMatchObject({ status: 'unsupported' });
  });
  it.each([null, 'other'])('does not apply model budgets to %s', (model) => {
    expect(projectOpenCodeUsageLimits(info, 'routed', model, 1)).toMatchObject({
      status: 'unsupported',
    });
  });
  it('preserves shared workspace-wide budget totals and zero limits', () => {
    expect(
      projectOpenCodeUsageLimits(
        { ...info, budgets: [{ ...budget, per: 'set', coverage: 'all', shared: true, limit: 0 }] },
        'routed',
        null,
        1
      )
    ).toMatchObject({
      status: 'available',
      windows: [{ label: 'Shared monthly budget', remaining: 0, percent: 100 }],
    });
  });
  it.each([NaN, Infinity, -1])('rejects invalid budget amounts %s', (limit) => {
    expect(() =>
      projectOpenCodeUsageLimits({ ...info, budgets: [{ ...budget, limit }] }, 'routed', 'chat', 1)
    ).toThrow('budget');
  });
  it('honors a Go limited flag independently of the reported percentage', () => {
    const go = Object.fromEntries(
      ['rolling', 'weekly', 'monthly'].map((key) => [
        key,
        { percent: 25, limited: true, resetsAt: 10000 },
      ])
    );
    expect(
      projectOpenCodeUsageLimits({ ...info, budgets: [], go }, 'opencode-go', 'chat', 1)
    ).toMatchObject({
      status: 'available',
      windows: [
        { remaining: 0, percent: 100 },
        { remaining: 0, percent: 100 },
        { remaining: 0, percent: 100 },
      ],
    });
  });
});
