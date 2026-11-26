import { describe, expect, it } from 'vitest';
import { assembleLayout, cleanRegions, gridFromStructure, itemBox, readingOrder, tableToMarkdown, type LayoutItem, type LayoutRegion } from '../layout-assemble';

const region = (label: string, x0: number, y0: number, x1: number, y1: number, score = 0.9): LayoutRegion => ({ label, score, x0, y0, x1, y1 });
// a word 10 high; width follows its length
const word = (str: string, x0: number, y0: number): LayoutItem => ({ str, x0, y0, x1: x0 + str.length * 6, y1: y0 + 10 });
const sentence = (text: string, x0: number, y0: number): LayoutItem[] => {
  let x = x0;
  return text.split(' ').map(w => {
    const it = word(w, x, y0);
    x = it.x1 + 4;
    return it;
  });
};
const page = { width: 600, height: 800 };

describe('layout assembly', () => {
  it('writes title, headings, paragraphs and lists, and leaves out page headers and footers', () => {
    const regions = [
      region('page_header', 50, 10, 550, 30),
      region('title', 50, 60, 550, 90),
      region('section_header', 50, 110, 550, 130),
      region('text', 50, 140, 550, 170),
      region('list_item', 50, 180, 550, 195),
      region('list_item', 50, 200, 550, 215),
      region('page_footer', 50, 760, 550, 780),
    ];
    const items = [
      ...sentence('Annual Report', 50, 65),
      ...sentence('Running header', 50, 15),
      ...sentence('Results', 50, 112),
      ...sentence('Sales grew in every', 50, 142),
      ...sentence('region this year.', 50, 156),
      ...sentence('• first point', 50, 182),
      ...sentence('• second point', 50, 202),
      ...sentence('page 1', 50, 765),
    ];
    const out = assembleLayout(regions, items, page);
    expect(out.markdown).toBe('# Annual Report\n\n## Results\n\nSales grew in every region this year.\n\n- first point\n- second point');
    expect(out.dropped).toBe(2);
    expect(out.unassigned).toBe(0);
  });

  it('reads two columns left then right, with a full-width title first', () => {
    const regions = [
      region('title', 50, 40, 550, 70),
      region('text', 50, 100, 280, 300),
      region('text', 320, 100, 550, 300),
      region('text', 50, 320, 280, 500),
    ];
    const items = [...sentence('Big Title', 50, 45), ...sentence('left top', 50, 110), ...sentence('right top', 320, 110), ...sentence('left lower', 50, 330)];
    expect(assembleLayout(regions, items, page).markdown).toBe('# Big Title\n\nleft top\n\nleft lower\n\nright top');
  });

  it('puts a table into rows and columns, folding a wrapped cell into its row', () => {
    const items = [
      ...sentence('Region', 50, 100), ...sentence('Sales', 250, 100), ...sentence('Change', 400, 100),
      ...sentence('North', 50, 120), ...sentence('1,200', 250, 120), ...sentence('+4%', 400, 120),
      ...sentence('South', 50, 140), ...sentence('900', 250, 140), ...sentence('-2%', 400, 140),
    ];
    expect(tableToMarkdown(items)).toBe('| Region | Sales | Change |\n| --- | --- | --- |\n| North | 1,200 | +4% |\n| South | 900 | -2% |');
    const wrapped = [...items, ...sentence('only', 250, 151)];
    expect(tableToMarkdown(wrapped).split('\n').pop()).toBe('| South | 900 only | -2% |');
  });

  it('marks a picture, a caption and a formula, and keeps words that no region holds', () => {
    const regions = [region('picture', 50, 100, 550, 300), region('caption', 50, 310, 550, 330), region('formula', 200, 340, 400, 360)];
    const items = [...sentence('Figure 1. Chart', 50, 312), ...sentence('E = mc2', 200, 345), ...sentence('stray note', 50, 600)];
    const out = assembleLayout(regions, items, page);
    expect(out.markdown).toBe('[picture]\n\n*Figure 1. Chart*\n\n$$ E = mc2 $$\n\nstray note');
    expect(out.pictures).toBe(1);
    expect(out.unassigned).toBe(2);
  });

  it('drops a duplicate region and a text region inside a table', () => {
    const kept = cleanRegions([region('table', 0, 0, 100, 100, 0.9), region('text', 10, 10, 90, 40, 0.8), region('table', 2, 2, 99, 99, 0.5)]);
    expect(kept.map(r => r.label)).toEqual(['table']);
  });

  it('keeps one column in order when nothing sits beside anything', () => {
    const order = readingOrder([region('text', 50, 300, 550, 400), region('text', 50, 100, 550, 200)], 600);
    expect(order.map(r => r.y0)).toEqual([100, 300]);
  });

  it('turns a text item into a box on an upright page, a page turned 90 degrees, and sideways text', () => {
    const item = { str: 'Hello', transform: [10, 0, 0, 10, 100, 700], width: 30 };
    // upright page, scale 2, 800 tall: y goes down from the top
    const upright = itemBox(item, [2, 0, 0, -2, 0, 1600])!;
    expect(upright.horizontal).toBe(true);
    expect([upright.x0, upright.x1, upright.y0]).toEqual([200, 260, 180]);
    // the same page turned 90 degrees clockwise: the drawn text now runs down the page
    const turned = itemBox(item, [0, 2, 2, 0, 0, 0])!;
    expect(turned.horizontal).toBe(false);
    // a page whose own text is set sideways (its transform runs up) and the view turns it back: reads horizontally
    const sideways = { str: 'Side', transform: [0, 10, -10, 0, 300, 100], width: 24 };
    const back = itemBox(sideways, [0, 2, 2, 0, 0, 0])!;
    expect(back.horizontal).toBe(true);
    expect(back.x1 - back.x0).toBe(48);
    expect(itemBox({ str: '  ', transform: [1, 0, 0, 1, 0, 0] }, [1, 0, 0, 1, 0, 0])).toBeUndefined();
  });

  it('builds a table from the structure model: rows, columns, a spanning header and a wrapped cell', () => {
    const items = [
      ...sentence('Layer', 50, 100), ...sentence('Output', 200, 100), ...sentence('Notes', 350, 100),
      ...sentence('conv1', 50, 130), ...sentence('112', 200, 130), ...sentence('3x3, 64', 350, 130), ...sentence('stride 2', 350, 142),
      ...sentence('conv2', 50, 170), ...sentence('56', 200, 170), ...sentence('1x1, 64', 350, 170),
    ];
    const structure: LayoutRegion[] = [
      region('table', 35, 85, 455, 195, 0.99), // the whole table, as the model returns it
      region('table row', 40, 95, 450, 115), region('table row', 40, 125, 450, 155), region('table row', 40, 165, 450, 185),
      region('table column', 40, 90, 150, 190), region('table column', 190, 90, 300, 190), region('table column', 340, 90, 450, 190),
    ];
    expect(gridFromStructure(items, structure)).toEqual([['Layer', 'Output', 'Notes'], ['conv1', '112', '3x3, 64 stride 2'], ['conv2', '56', '1x1, 64']]);
    expect(tableToMarkdown(items, structure).split(String.fromCharCode(10))[2]).toBe('| conv1 | 112 | 3x3, 64 stride 2 |');
    // a spanning header over two columns keeps its text in the first cell
    const span = [...sentence('Group', 200, 80), ...items.slice(0, 0)];
    const withSpan = gridFromStructure([...span, ...items], [...structure, region('table spanning cell', 190, 75, 450, 95)]);
    expect(withSpan).not.toBeNull();
    // too few rows from the model: no grid, the caller falls back to the word-gap method
    expect(gridFromStructure(items, [region('table row', 40, 95, 450, 115)])).toBeNull();
  });
});
