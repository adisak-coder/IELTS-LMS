import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

describe('StudentReviewWorkspace print writing layout', () => {
  test('uses compact A4 Arial print setup matching session writing print', () => {
    const source = readFileSync(
      resolve(__dirname, '../StudentReviewWorkspace.tsx'),
      'utf8',
    );

    expect(source).toContain('@page');
    expect(source).toContain('size: A4');
    expect(source).toContain('font-family: Arial, Helvetica, sans-serif');
    expect(source).toContain('.writing-print-summary');
    expect(source).toContain('.writing-print-response');
    expect(source).toContain('white-space: pre-wrap');
    expect(source).toContain('<div className="writing-print-response">{task.text}</div>');
    expect(source).not.toContain('htmlToPlainText(');
    expect(source).toContain('.writing-print-assessment-table');
    expect(source).not.toContain('responseHtml');
    expect(source).not.toContain('font-family: Arial, "Times New Roman", serif');
    expect(source).not.toContain('page-break-inside: avoid');
    expect(source).not.toContain('break-inside: avoid');
  });
});
