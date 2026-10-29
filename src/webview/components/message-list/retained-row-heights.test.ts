import { describe, expect, it } from 'vitest';
import { RetainedRowHeights } from './retained-row-heights';
import { buildVirtualMetrics } from './virtualization';

describe('RetainedRowHeights', () => {
  const itemIds = ['a', 'b', 'c'];
  const metrics = buildVirtualMetrics({
    itemIds,
    measuredHeights: new Map([
      ['a', 40],
      ['b', 0],
      ['c', 80],
    ]),
  });

  it('restores provisional heights without certifying old zeros or overriding fresh measurements', () => {
    const cache = new RetainedRowHeights();
    cache.remember('session', itemIds, metrics);
    const estimates = cache.restore('session', [...itemIds]);
    expect(estimates).toEqual(
      new Map([
        ['a', 40],
        ['c', 80],
      ])
    );
    const measuredHeights = new Map([['a', 60]]);
    const updated = buildVirtualMetrics({
      itemIds,
      measuredHeights,
      estimatedHeights: estimates!,
      defaultItemHeight: 100,
    });
    expect([...updated.prefix]).toEqual([0, 60, 160, 240]);
    expect(measuredHeights).toEqual(new Map([['a', 60]]));
    expect([...metrics.prefix]).toEqual([0, 40, 40, 120]);
    expect(
      buildVirtualMetrics({
        itemIds,
        measuredHeights,
        estimatedHeights: estimates!,
        knownZeroHeightIds: new Set(['c']),
        defaultItemHeight: 100,
      }).totalHeight
    ).toBe(160);
  });

  it('requires the same session and ordered message window', () => {
    const cache = new RetainedRowHeights();
    cache.remember('session', itemIds, metrics);
    expect(cache.restore('other', itemIds)).toBeNull();
    expect(cache.restore('session', ['c', 'b', 'a'])).toBeNull();
    expect(cache.restore('session', ['a', 'b'])).toBeNull();
    expect(cache.restore('session', [...itemIds, 'd'])).toBeNull();
    expect(cache.restore('session', ['a', 'b', 'new'])).toBeNull();
  });

  it('bounds retained rows and sessions and evicts the least recently used snapshot', () => {
    const cache = new RetainedRowHeights(6, 2);
    cache.remember('first', itemIds, metrics);
    cache.remember('second', itemIds, metrics);
    expect(cache.restore('first', itemIds)).not.toBeNull();
    cache.remember('third', itemIds, metrics);
    expect(cache.restore('second', itemIds)).toBeNull();
    expect(cache.restore('first', itemIds)).not.toBeNull();
    cache.remember('first', itemIds, metrics);
    expect(cache.restore('third', itemIds)).not.toBeNull();
    const rowLimited = new RetainedRowHeights(4, 4);
    rowLimited.remember('first', itemIds, metrics);
    rowLimited.remember('second', itemIds, metrics);
    expect(rowLimited.restore('first', itemIds)).toBeNull();
    rowLimited.remember('second', [...itemIds, 'd', 'e'], {
      prefix: [0, 1, 2, 3, 4, 5],
      itemCount: 5,
      totalHeight: 5,
    });
    expect(rowLimited.restore('second', itemIds)).toBeNull();
  });
});
