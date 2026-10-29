import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { EditorContext, ExtensionMessage } from '../../src/shared/protocol';
import { waitForHarnessStartup } from './helpers';

interface PinHarnessWindow extends Window {
  __varroE2E?: {
    requests: Array<{ method: string; path: string; body?: unknown }>;
  };
}

async function updateEditorContext(
  page: Page,
  filename: string,
  selection: EditorContext['selection'] = null
) {
  await page.evaluate(
    (context) => {
      window.postMessage(
        {
          type: 'context/update',
          payload: {
            workspacePath: '/workspace/varro',
            activeFile: {
              path: `/workspace/varro/src/${context.filename}`,
              relativePath: `src/${context.filename}`,
              language: 'typescript',
            },
            selection: context.selection,
            diagnostics: [],
          },
        } satisfies ExtensionMessage,
        '*'
      );
    },
    { filename, selection }
  );
}

for (const selected of [false, true]) {
  for (const switchEditors of [false, true]) {
    test(`pin retains ${selected ? 'selected lines' : 'the whole file'} when sending ${switchEditors ? 'after editor switches' : 'from the same editor'}`, async ({
      page,
    }) => {
      await page.goto('/e2e/harness/index.html?scenario=plan-ready');
      await waitForHarnessStartup(page);
      await updateEditorContext(
        page,
        'pinned.ts',
        selected ? { startLine: 101, endLine: 108 } : null
      );
      const chips = page.locator('.chat-attachments-container .chat-attachment-chip');
      const pinned = chips.filter({ hasText: 'pinned.ts' });
      const pin = pinned.getByRole('button', { name: 'Keep pinned.ts attached', exact: true });
      await expect(pinned).toHaveAttribute('aria-pressed', 'true');
      if (selected) {
        await expect(pinned.locator('.chip-detail')).toHaveText('L101-108');
        await pinned.locator('.chip-label').click();
        await expect(pinned).toHaveAttribute('aria-pressed', 'false');
        await expect(pinned.locator('.chip-label')).toHaveCSS(
          'text-decoration-line',
          'line-through'
        );
        await expect(pinned.locator('.chip-detail')).toHaveCSS(
          'text-decoration-line',
          'line-through'
        );
        await pinned.locator('.chip-label').click();
        await expect(pinned).toHaveAttribute('aria-pressed', 'true');
        await pin.focus();
        await pin.press('Enter');
      } else {
        await pin.click();
      }
      await expect(pinned).toHaveCount(1);
      await expect(pinned.locator('.chip-remove')).toBeVisible();
      await expect(pinned.locator('.chip-pin')).toHaveCount(0);
      if (selected) await expect(pinned.locator('.chip-detail')).toHaveText('L101-108');

      if (switchEditors) {
        for (const filename of ['second.ts', 'third.ts']) {
          await updateEditorContext(page, filename);
          await expect(pinned).toHaveCount(1);
          await expect(chips.filter({ hasText: filename })).toHaveAttribute('aria-pressed', 'true');
          if (selected) await expect(pinned.locator('.chip-detail')).toHaveText('L101-108');
        }
      }

      const composer = page.getByRole('textbox', { name: 'Message composer' }).first();
      await composer.fill('Review the pinned file');
      await composer.press('Enter');
      await expect
        .poll(() =>
          page.evaluate(() => {
            // SAFETY: The isolated harness records the actual outgoing API request bodies.
            const harness = window as PinHarnessWindow;
            const request = harness.__varroE2E?.requests.find(
              (candidate) => candidate.method === 'POST' && candidate.path.includes('prompt_async')
            );
            // SAFETY: The prompt endpoint receives protocol-shaped text and file parts.
            const body = request?.body as
              | { parts?: Array<{ type: string; text?: string }> }
              | undefined;
            return body?.parts?.filter((part) => part.type === 'text').map((part) => part.text);
          })
        )
        .toEqual([
          'Review the pinned file',
          ...(switchEditors ? ['[Active file: src/third.ts]'] : []),
          selected
            ? '[Selection from src/pinned.ts lines 101-108]'
            : '[Attached file: src/pinned.ts]',
        ]);
    });
  }
}

test('pin merges additional selected lines without duplicating the file and can be removed', async ({
  page,
}) => {
  await page.goto('/e2e/harness/index.html?scenario=plan-ready');
  await waitForHarnessStartup(page);
  const chips = page.locator('.chat-attachments-container .chat-attachment-chip');
  const pin = page.getByRole('button', { name: 'Keep pinned.ts attached', exact: true });
  for (const selection of [
    { startLine: 101, endLine: 108 },
    { startLine: 111, endLine: 112 },
  ]) {
    await updateEditorContext(page, 'pinned.ts', selection);
    await pin.click();
    await expect(chips).toHaveCount(1);
    await expect(pin).toHaveCount(0);
  }
  await expect(chips.locator('.chip-detail')).toHaveText('L101-108, L111-112');
  await updateEditorContext(page, 'pinned.ts', { startLine: 103, endLine: 104 });
  await expect(chips).toHaveCount(1);
  await expect(pin).toHaveCount(0);
  await chips.locator('.chip-remove').click();
  await expect(pin).toBeVisible();
  await expect(chips.locator('.chip-detail')).toHaveText('L103-104');
  await expect(chips.locator('.chip-remove')).toHaveCount(0);
});
