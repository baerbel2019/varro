import { expect, test } from '@playwright/test';
import type { ExtensionMessage } from '../../src/shared/protocol';

for (const phase of ['connecting', 'workspace'] as const) {
  test(`keeps ${phase} loading dots square at different font and window sizes`, async ({
    page,
  }) => {
    await page.addInitScript((loadingPhase) => {
      window.addEventListener('message', (event: MessageEvent<ExtensionMessage>) => {
        // Hold only the isolated harness's startup phase for geometry checks.
        if (
          (loadingPhase === 'connecting' &&
            event.data?.type === 'server/status' &&
            event.data.payload.state === 'running') ||
          (loadingPhase === 'workspace' && event.data?.type === 'api/response')
        ) {
          event.stopImmediatePropagation();
        }
      });
    }, phase);
    await page.goto(
      `/e2e/harness/index.html?scenario=${phase === 'connecting' ? 'dispose-during-start' : 'blank'}`
    );
    const dots = page.locator('.server-status-surface .loading-dot');
    await expect(dots).toHaveCount(3);
    for (const fontSize of [10, 13, 16]) {
      await page.evaluate((size) => {
        document.documentElement.style.fontSize = `${size}px`;
      }, fontSize);
      for (const viewport of [
        { width: 320, height: 120 },
        { width: 1280, height: 900 },
      ]) {
        await page.setViewportSize(viewport);
        for (const dot of await dots.all()) {
          await expect(dot).toHaveCSS('width', '8px');
          await expect(dot).toHaveCSS('height', '8px');
          await expect(dot).toHaveCSS('flex-shrink', '0');
          await expect(dot).toHaveCSS('animation-name', 'pulse-soft');
          const bounds = await dot.boundingBox();
          expect(bounds?.width).toBe(8);
          expect(bounds?.height).toBe(8);
        }
      }
    }
  });
}
