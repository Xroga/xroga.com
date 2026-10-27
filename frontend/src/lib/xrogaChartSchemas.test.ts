import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseXrogaBlock } from './xrogaBlocks';

test('data-driven chart families validate for standalone charts and dashboards', () => {
  for (const chartType of ['grouped-bar', 'stacked-bar', 'stacked-area', 'histogram', 'waterfall', 'bubble', 'heatmap', 'treemap']) {
    const chart = { schemaVersion: 1, id: `chart-${chartType}`, type: 'chart', chartType, xKey: 'period', data: [{ period: '2025', value: 10, size: 3 }, { period: '2026', value: 15, size: 5 }], series: [{ key: 'value', label: 'Value' }, { key: 'size', label: 'Size' }], summary: 'Recorded values' };
    assert.equal(parseXrogaBlock(chart)?.type, 'chart', chartType);
    assert.equal(parseXrogaBlock({ schemaVersion: 1, id: `dashboard-${chartType}`, type: 'dashboard', charts: [{ ...chart, id: `nested-${chartType}` }] })?.type, 'dashboard', chartType);
  }
});
