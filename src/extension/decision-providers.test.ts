/* oxlint-disable anti-slop/no-module-mocking -- VS Code settings and native catalogs are substituted without changing user settings or credentials. */
import { describe, expect, it, vi } from 'vitest';
import { DecisionProviders } from './decision-providers';

const update = vi.hoisted(() => vi.fn());
const debugEnabled = vi.hoisted(() => ({ value: false }));
vi.mock('vscode', () => ({
  ConfigurationTarget: { Global: 1 },
  workspace: {
    getConfiguration: () => ({
      get: (key: string, fallback: string | boolean) =>
        key === 'debug.showNativeDecisionModels' ? debugEnabled.value : fallback,
      update,
    }),
  },
}));
vi.mock('./logger', () => ({ logger: { warn: vi.fn() } }));
const model = { providerID: 'typesafe-ai', modelID: 'jev', name: 'Jev' };
describe('native decision model settings', () => {
  it.each([false, true])(
    'shows the native section only with debug opt-in %s without disabling the selected reviewer',
    async (visible) => {
      debugEnabled.value = visible;
      try {
        const providers = new DecisionProviders(undefined, undefined, {
          status: async () => ({ supported: true, model, models: [model] }),
        });
        expect((await providers.status()).native).toMatchObject({
          visible,
          model,
          models: [model],
        });
      } finally {
        debugEnabled.value = false;
      }
    }
  );
  it('accepts only an advertised native decision model', async () => {
    const providers = new DecisionProviders(undefined, undefined, {
      status: async () => ({ supported: true, model: null, models: [model] }),
    });
    await providers.handle({ action: 'native', model: 'typesafe-ai/jev' });
    expect(update).toHaveBeenCalledWith('chat.autoApproveDecisionModel', 'typesafe-ai/jev', 1);
    update.mockClear();
    await expect(
      providers.handle({ action: 'native', model: 'chat/not-a-decision' })
    ).rejects.toThrow('available');
    expect(update).not.toHaveBeenCalled();
  });
  it('allows clearing an unavailable native model without reconnecting or migrating Jev', async () => {
    const providers = new DecisionProviders(undefined);
    await providers.handle({ action: 'native', model: '' });
    expect(update).toHaveBeenCalledWith('chat.autoApproveDecisionModel', '', 1);
  });
});
