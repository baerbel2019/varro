import { expect, test } from '@playwright/test';

type RemountWork = { peakRows: number; rowReads: number; mountedIds: string[] };
declare global {
  interface Window {
    finishRemountWork?: () => RemountWork;
  }
}

function observeMountWork() {
  const mounted = new Set<Element>();
  const mountedIds = new Set<string>();
  let peakRows = 0;
  let rowReads = 0;
  const rect = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.hasAttribute('data-msg-id')) rowReads += 1;
    return rect.call(this);
  };
  const rows = (node: Node) =>
    node instanceof Element
      ? [
          ...(node.matches('[data-msg-id]') ? [node] : []),
          ...node.querySelectorAll('[data-msg-id]'),
        ]
      : [];
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.removedNodes) for (const row of rows(node)) mounted.delete(row);
      for (const node of record.addedNodes) {
        for (const row of rows(node)) {
          mounted.add(row);
          mountedIds.add(row.getAttribute('data-msg-id')!);
        }
      }
      peakRows = Math.max(peakRows, mounted.size);
    }
  });
  observer.observe(document, { childList: true, subtree: true });
  window.finishRemountWork = () => {
    observer.disconnect();
    HTMLElement.prototype.getBoundingClientRect = rect;
    delete window.finishRemountWork;
    return { peakRows, rowReads, mountedIds: [...mountedIds] };
  };
}

for (const width of [486, 360]) {
  test(`cold transcript at ${width}px measures a bounded tail and reconciles unseen rows`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(observeMountWork);
    await page.goto('/e2e/harness/index.html?scenario=large-transcript');
    const list = page.locator('.interactive-list');
    const latest = page.locator('[data-msg-id="message-large-assistant-239"]');
    await expect(latest).toBeInViewport();
    await expect
      .poll(() =>
        list.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop)
      )
      .toBeLessThanOrEqual(1);
    const work = await page.evaluate(() => window.finishRemountWork!());
    await test.info().attach('cold-mount-work', {
      body: JSON.stringify(work),
      contentType: 'application/json',
    });
    expect(work.peakRows, JSON.stringify(work)).toBeLessThan(90);
    expect(work.rowReads, JSON.stringify(work)).toBeLessThan(500);
    expect(work.mountedIds).not.toContain('message-large-user-0');
    const measuredTailHeight = await latest.evaluate(
      (element) => element.getBoundingClientRect().height
    );
    expect(measuredTailHeight).toBeGreaterThan(0);
    expect(measuredTailHeight).toBe(Math.round(measuredTailHeight));

    // Home enters rows that have never mounted. Their estimates must be replaced by exact
    // measurements without losing the native destination; returning retains the measured tail.
    await list.click({ position: { x: 2, y: 20 } });
    await list.press('Home');
    await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeLessThanOrEqual(1);
    await expect(page.locator('[data-msg-id="message-large-user-0"]')).toBeInViewport();
    await expect(latest).toHaveCount(0);
    await list.press('End');
    await expect(latest).toBeInViewport();
    await expect
      .poll(() =>
        list.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop)
      )
      .toBeLessThanOrEqual(1);
    expect(await latest.evaluate((element) => element.getBoundingClientRect().height)).toBe(
      measuredTailHeight
    );
  });

  test(`reopening a measured transcript at ${width}px avoids a full-page remount`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 486, height: 900 });
    await page.goto('/e2e/harness/index.html?scenario=large-transcript');
    const list = page.locator('.interactive-list');
    await expect(page.locator('.interactive-list-track')).toHaveClass(/virtualized/);
    await expect(page.locator('[data-msg-id="message-large-assistant-239"]')).toBeInViewport();
    await expect
      .poll(() =>
        list.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop)
      )
      .toBeLessThanOrEqual(1);

    await page.getByLabel('Back to sessions').click();
    await expect(list).toHaveCount(0);
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(observeMountWork);
    await page.locator('.session-item').filter({ hasText: 'Large transcript' }).click();
    await expect(list).toBeVisible();
    await expect(page.locator('.interactive-list-track')).toHaveClass(/virtualized/);
    await expect(page.locator('[data-msg-id="message-large-assistant-239"]')).toBeInViewport();
    await expect
      .poll(() =>
        list.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop)
      )
      .toBeLessThanOrEqual(1);
    const work = await page.evaluate(() => window.finishRemountWork!());
    await test.info().attach('remount-work', {
      body: JSON.stringify(work),
      contentType: 'application/json',
    });
    expect(work.peakRows, JSON.stringify(work)).toBeLessThan(90);
    expect(work.rowReads, JSON.stringify(work)).toBeLessThan(500);

    // Provisional offscreen heights must still reconcile with native input and physical row boxes.
    await list.click({ position: { x: 2, y: 20 } });
    await expect(list).toBeFocused();
    await page.keyboard.press('Home');
    await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeLessThanOrEqual(1);
    await list.press('End');
    await expect(page.locator('[data-msg-id="message-large-assistant-239"]')).toBeInViewport();
    const geometry = await list.evaluate(async (element) => {
      const samples = [];
      for (let frame = 0; frame < 12; frame++) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const bounds = element.getBoundingClientRect();
        const rows = [...element.querySelectorAll<HTMLElement>('[data-msg-id]')].map((row) =>
          row.getBoundingClientRect()
        );
        samples.push({
          bottomGap: element.scrollHeight - element.clientHeight - element.scrollTop,
          covered: rows.some(
            (row) => row.height > 0 && row.bottom > bounds.top && row.top < bounds.bottom
          ),
          fractionalRows: rows.filter((row) => Math.abs(row.height - Math.round(row.height)) > 0.01)
            .length,
        });
      }
      return samples;
    });
    expect(
      geometry.every((sample) => sample.covered && sample.fractionalRows === 0),
      JSON.stringify(geometry)
    ).toBe(true);
    expect(geometry.at(-1)!.bottomGap).toBeLessThanOrEqual(1);
  });
}
