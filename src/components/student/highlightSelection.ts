export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface HighlightSelectionSnapshot {
  startNodePath: number[];
  startOffset: number;
  endNodePath: number[];
  endOffset: number;
  selectedText: string;
  signature: string;
}

export function applySelectionHighlight(
  container: HTMLElement,
  selection: Selection,
  highlightClassName = 'rounded-sm bg-yellow-200/80 text-gray-900',
): string | null {
  const snapshot = createHighlightSelectionSnapshot(container, selection);
  if (!snapshot) {
    return null;
  }

  const clonedContainer = container.cloneNode(true) as HTMLElement;
  const clonedRange = createClonedRangeFromSnapshot(clonedContainer, snapshot);
  if (!clonedRange) {
    return null;
  }

  const wrapper = document.createElement('mark');
  wrapper.className = highlightClassName;
  wrapper.setAttribute('data-highlighted', 'true');

  try {
    clonedRange.surroundContents(wrapper);
  } catch {
    try {
      wrapper.appendChild(clonedRange.extractContents());
      clonedRange.insertNode(wrapper);
    } catch {
      return null;
    }
  }

  selection.removeAllRanges();

  return clonedContainer.innerHTML;
}

export function applyHighlightFromSnapshot(
  container: HTMLElement,
  snapshot: HighlightSelectionSnapshot,
  highlightClassName = 'rounded-sm bg-yellow-200/80 text-gray-900',
): string | null {
  const clonedContainer = container.cloneNode(true) as HTMLElement;
  const clonedRange = createClonedRangeFromSnapshot(clonedContainer, snapshot);
  if (!clonedRange) {
    return null;
  }

  if (!clonedRange.toString().trim()) {
    return null;
  }

  const wrapper = document.createElement('mark');
  wrapper.className = highlightClassName;
  wrapper.setAttribute('data-highlighted', 'true');

  try {
    clonedRange.surroundContents(wrapper);
  } catch {
    try {
      wrapper.appendChild(clonedRange.extractContents());
      clonedRange.insertNode(wrapper);
    } catch {
      return null;
    }
  }

  return clonedContainer.innerHTML;
}

export function removeHighlightAtIndex(container: HTMLElement, highlightIndex: number): string | null {
  if (highlightIndex < 0) {
    return null;
  }

  const clonedContainer = container.cloneNode(true) as HTMLElement;
  const highlightedNodes = clonedContainer.querySelectorAll('mark[data-highlighted="true"]');
  const highlightedNode = highlightedNodes.item(highlightIndex);
  if (!highlightedNode || !highlightedNode.parentNode) {
    return null;
  }

  const parent = highlightedNode.parentNode;
  while (highlightedNode.firstChild) {
    parent.insertBefore(highlightedNode.firstChild, highlightedNode);
  }
  parent.removeChild(highlightedNode);

  return clonedContainer.innerHTML;
}

export function createHighlightSelectionSnapshot(
  container: HTMLElement,
  selection: Selection,
): HighlightSelectionSnapshot | null {
  if (selection.rangeCount === 0) {
    return null;
  }

  let range: Range;
  try {
    range = selection.getRangeAt(0);
  } catch {
    return null;
  }
  const selectedText = selection.toString().trim();
  if (!selectedText) {
    return null;
  }

  if (!container.contains(range.commonAncestorContainer)) {
    return null;
  }

  if (selectionCrossesBlockBoundary(container, range)) {
    return null;
  }

  const startNodePath = getNodePath(container, range.startContainer);
  const endNodePath = getNodePath(container, range.endContainer);
  if (!startNodePath || !endNodePath) {
    return null;
  }

  return {
    startNodePath,
    startOffset: range.startOffset,
    endNodePath,
    endOffset: range.endOffset,
    selectedText,
    signature: `${startNodePath.join('.')}:${range.startOffset}|${endNodePath.join('.')}:${range.endOffset}|${selectedText}`,
  };
}

const BLOCK_BOUNDARY_TAGS = new Set([
  'P',
  'DIV',
  'SECTION',
  'ARTICLE',
  'ASIDE',
  'MAIN',
  'NAV',
  'HEADER',
  'FOOTER',
  'UL',
  'OL',
  'LI',
  'DL',
  'DT',
  'DD',
  'BLOCKQUOTE',
  'PRE',
  'TABLE',
  'THEAD',
  'TBODY',
  'TFOOT',
  'TR',
  'TD',
  'TH',
  'CAPTION',
  'FIGURE',
  'FIGCAPTION',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
]);

function selectionCrossesBlockBoundary(container: HTMLElement, range: Range): boolean {
  const startBlock = findNearestBlockBoundary(container, range.startContainer);
  const endBlock = findNearestBlockBoundary(container, range.endContainer);
  return startBlock !== endBlock;
}

function findNearestBlockBoundary(container: HTMLElement, node: Node): Node {
  const initialElement =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement;

  let current: Element | null = initialElement;
  while (current && current !== container) {
    if (BLOCK_BOUNDARY_TAGS.has(current.tagName)) {
      return current;
    }
    current = current.parentElement;
  }

  return container;
}

function createClonedRangeFromSnapshot(
  clonedContainer: HTMLElement,
  snapshot: HighlightSelectionSnapshot,
): Range | null {
  const clonedStartNode = resolveNodePath(clonedContainer, snapshot.startNodePath);
  const clonedEndNode = resolveNodePath(clonedContainer, snapshot.endNodePath);
  if (!clonedStartNode || !clonedEndNode) {
    return null;
  }

  const clonedRange = document.createRange();
  try {
    clonedRange.setStart(clonedStartNode, snapshot.startOffset);
    clonedRange.setEnd(clonedEndNode, snapshot.endOffset);
  } catch {
    return null;
  }

  return clonedRange;
}

function getNodePath(root: Node, node: Node): number[] | null {
  const path: number[] = [];
  let current: Node | null = node;

  while (current && current !== root) {
    const parent: Node | null = current.parentNode;
    if (!parent) {
      return null;
    }

    const index = Array.from(parent.childNodes).indexOf(current as ChildNode);
    if (index < 0) {
      return null;
    }

    path.unshift(index);
    current = parent;
  }

  return current === root ? path : null;
}

function resolveNodePath(root: Node, path: number[]): Node | null {
  let current: Node | null = root;

  for (const index of path) {
    current = (current?.childNodes.item(index) as ChildNode | null) ?? null;
    if (!current) {
      return null;
    }
  }

  return current;
}
