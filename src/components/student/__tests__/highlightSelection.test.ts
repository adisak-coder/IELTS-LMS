import { describe, expect, it } from 'vitest';
import { studentHighlightPalette } from '../highlightPalette';
import { applyHighlightFromSnapshot, applySelectionHighlight, createHighlightSelectionSnapshot } from '../highlightSelection';

describe('applySelectionHighlight', () => {
  it('wraps the selected text without removing the passage', () => {
    const container = document.createElement('div');
    container.innerHTML = '<p>Alpha beta gamma</p>';

    const textNode = container.querySelector('p')?.firstChild;
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
      throw new Error('Expected a text node');
    }

    const range = document.createRange();
    range.setStart(textNode, 6);
    range.setEnd(textNode, 10);

    const selection = {
      rangeCount: 1,
      getRangeAt: () => range,
      toString: () => 'beta',
      removeAllRanges: vi.fn(),
    } as unknown as Selection;

    const html = applySelectionHighlight(container, selection, 'bg-blue-200');

    expect(html).toContain('Alpha');
    expect(html).toContain('beta');
    expect(html).toContain('gamma');
    expect(html).toContain('data-highlighted="true"');
    expect(container.textContent).toBe('Alpha beta gamma');
  });

  it('returns null when the selection spans multiple paragraphs', () => {
    const container = document.createElement('div');
    container.innerHTML = '<p>Alpha beta</p><p>Gamma delta</p>';

    const firstParagraphTextNode = container.querySelectorAll('p')[0]?.firstChild;
    const secondParagraphTextNode = container.querySelectorAll('p')[1]?.firstChild;
    if (
      !firstParagraphTextNode ||
      firstParagraphTextNode.nodeType !== Node.TEXT_NODE ||
      !secondParagraphTextNode ||
      secondParagraphTextNode.nodeType !== Node.TEXT_NODE
    ) {
      throw new Error('Expected two text nodes');
    }

    const range = document.createRange();
    range.setStart(firstParagraphTextNode, 6);
    range.setEnd(secondParagraphTextNode, 5);

    const removeAllRanges = vi.fn();
    const selection = {
      rangeCount: 1,
      getRangeAt: () => range,
      toString: () => range.toString(),
      removeAllRanges,
    } as unknown as Selection;

    const html = applySelectionHighlight(container, selection, 'bg-blue-200');

    expect(html).toBeNull();
    expect(removeAllRanges).not.toHaveBeenCalled();
  });

  it('still highlights when selection stays inside a single paragraph', () => {
    const container = document.createElement('div');
    container.innerHTML = '<p>Alpha beta</p><p>Gamma delta</p>';

    const secondParagraphTextNode = container.querySelectorAll('p')[1]?.firstChild;
    if (!secondParagraphTextNode || secondParagraphTextNode.nodeType !== Node.TEXT_NODE) {
      throw new Error('Expected a text node in the second paragraph');
    }

    const range = document.createRange();
    range.setStart(secondParagraphTextNode, 0);
    range.setEnd(secondParagraphTextNode, 5);

    const selection = {
      rangeCount: 1,
      getRangeAt: () => range,
      toString: () => 'Gamma',
      removeAllRanges: vi.fn(),
    } as unknown as Selection;

    const html = applySelectionHighlight(container, selection, 'bg-blue-200');

    expect(html).toContain('<p><mark');
    expect(html).toContain('Gamma');
    expect(html).toContain('data-highlighted="true"');
  });

  it('uses highlight styles that do not add spacing around highlighted text', () => {
    expect(studentHighlightPalette.every((entry) => !entry.highlightClassName.includes('px-'))).toBe(true);

    const container = document.createElement('div');
    container.innerHTML = '<p>Alpha beta gamma</p>';
    const textNode = container.querySelector('p')?.firstChild;
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
      throw new Error('Expected a text node');
    }

    const range = document.createRange();
    range.setStart(textNode, 6);
    range.setEnd(textNode, 10);

    const selection = {
      rangeCount: 1,
      getRangeAt: () => range,
      toString: () => 'beta',
      removeAllRanges: vi.fn(),
    } as unknown as Selection;

    const html = applySelectionHighlight(container, selection);

    expect(html).not.toContain('px-0.5');
    expect(html).toContain('Alpha <mark');
    expect(html).toContain('</mark> gamma');
  });

  it('can apply a stored selection snapshot even when live selection is unavailable', () => {
    const container = document.createElement('div');
    container.innerHTML = '<p>Alpha beta gamma delta</p>';
    const textNode = container.querySelector('p')?.firstChild;
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
      throw new Error('Expected a text node');
    }

    const range = document.createRange();
    range.setStart(textNode, 6);
    range.setEnd(textNode, 22);

    const selection = {
      rangeCount: 1,
      getRangeAt: () => range,
      toString: () => 'beta gamma delta',
      removeAllRanges: vi.fn(),
    } as unknown as Selection;

    const snapshot = createHighlightSelectionSnapshot(container, selection);
    expect(snapshot).not.toBeNull();

    const html = applyHighlightFromSnapshot(
      container,
      snapshot!,
      'rounded-sm bg-yellow-200/80 text-gray-900',
    );

    expect(html).toContain('data-highlighted="true"');
    expect(html).toContain('beta gamma delta');
  });
});
