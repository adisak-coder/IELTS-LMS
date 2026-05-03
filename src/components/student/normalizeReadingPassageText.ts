function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeLineContent(line: string): string {
  return line.replace(/[ \t\f\v]+/g, ' ').trim();
}

function looksLikeHeading(line: string): boolean {
  if (line.length < 3 || line.length > 72) {
    return false;
  }

  if (/[.!?]$/.test(line)) {
    return false;
  }

  const alphaOnly = line.replace(/[^A-Za-z]/g, '');
  if (alphaOnly.length < 3) {
    return false;
  }

  const uppercaseRatio = (alphaOnly.match(/[A-Z]/g)?.length ?? 0) / alphaOnly.length;
  const startsWithUpper = /^[A-Z0-9]/.test(line);
  const titleCaseLike = /^([A-Z][a-z0-9'’.-]*)(\s+[A-Z][a-z0-9'’.-]*)*$/.test(line);

  return startsWithUpper && (uppercaseRatio >= 0.62 || titleCaseLike);
}

function splitLongParagraph(text: string): string[] {
  const normalized = normalizeLineContent(text);
  if (!normalized) {
    return [];
  }

  if (normalized.length <= 360) {
    return [normalized];
  }

  const sentences = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length <= 2) {
    return [normalized];
  }

  const paragraphs: string[] = [];
  let buffer = '';

  for (const sentence of sentences) {
    const candidate = buffer ? `${buffer} ${sentence}` : sentence;
    const shouldBreak = buffer.length >= 240 && candidate.length >= 320;

    if (shouldBreak) {
      paragraphs.push(buffer);
      buffer = sentence;
      continue;
    }

    buffer = candidate;
  }

  if (buffer) {
    paragraphs.push(buffer);
  }

  return paragraphs;
}

interface StructuredBlock {
  kind: 'heading' | 'paragraph';
  text: string;
}

function toStructuredParagraphBlocks(content: string): StructuredBlock[] {
  const normalizedContent = content
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .trim();

  if (!normalizedContent) {
    return [];
  }

  const explicitParagraphs = normalizedContent
    .split(/\n{2,}/)
    .map((paragraph) =>
      paragraph
        .split('\n')
        .map(normalizeLineContent)
        .filter(Boolean)
        .join(' '),
    )
    .filter(Boolean);

  if (explicitParagraphs.length > 1) {
    return explicitParagraphs.map((text) => ({
      kind: looksLikeHeading(text) ? 'heading' : 'paragraph',
      text,
    }));
  }

  const singleBlockLines = normalizedContent
    .split('\n')
    .map(normalizeLineContent)
    .filter(Boolean);

  if (singleBlockLines.length <= 1) {
    return splitLongParagraph(singleBlockLines[0] ?? '').map((text) => ({ kind: 'paragraph', text }));
  }

  const blocks: StructuredBlock[] = [];
  let paragraphBuffer = '';

  const flushParagraphBuffer = () => {
    if (!paragraphBuffer) {
      return;
    }

    splitLongParagraph(paragraphBuffer).forEach((chunk) => {
      blocks.push({ kind: 'paragraph', text: chunk });
    });
    paragraphBuffer = '';
  };

  singleBlockLines.forEach((line, index) => {
    if (looksLikeHeading(line)) {
      flushParagraphBuffer();
      blocks.push({ kind: 'heading', text: line });
      return;
    }

    paragraphBuffer = paragraphBuffer ? `${paragraphBuffer} ${line}` : line;

    const nextLine = singleBlockLines[index + 1];
    if (!nextLine) {
      return;
    }

    if (paragraphBuffer.length >= 420 && looksLikeHeading(nextLine)) {
      flushParagraphBuffer();
    }
  });

  flushParagraphBuffer();

  return blocks;
}

export function normalizeReadingPlainTextForDisplay(content: string): string {
  if (!content) {
    return '';
  }

  const blocks = toStructuredParagraphBlocks(content);
  if (blocks.length === 0) {
    return '';
  }

  return blocks
    .map((block) => {
      if (block.kind === 'heading') {
        return `<h3>${escapeHtml(block.text)}</h3>`;
      }

      return `<p>${escapeHtml(block.text)}</p>`;
    })
    .join('');
}
