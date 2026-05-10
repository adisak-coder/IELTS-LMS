export const highlightColors = ['yellow', 'amber', 'green', 'blue'] as const;

export type HighlightColor = (typeof highlightColors)[number];

export type HighlightRange = {
  start: number;
  end: number;
  color: HighlightColor;
};

export type HighlightSet = HighlightRange[];

export type HighlightBlockKey = {
  attemptId: string;
  section: 'reading';
  passageId: string;
  blockId: string;
};
