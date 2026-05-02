import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type {
  DiagramLabelingBlock as DiagramLabelingBlockType,
  MapBlock,
  TFNGBlock,
} from '../../../types';
import { DiagramLabelingBlock } from '../DiagramLabelingBlock';
import { MapLabelingBlock } from '../MapLabelingBlock';
import { TFNGBlock as TFNGBlockEditor } from '../TFNGBlock';

describe('inserted images slot placement', () => {
  it('shows inserted images section in supported block editors', () => {
    const block: TFNGBlock = {
      id: 'tfng-1',
      type: 'TFNG',
      mode: 'TFNG',
      instruction: 'Answer true/false/not given.',
      questions: [{ id: 'q-1', statement: 'A statement', correctAnswer: 'T' }],
    };

    render(
      <TFNGBlockEditor
        block={block}
        startNum={1}
        endNum={1}
        updateBlock={() => {}}
        deleteBlock={() => {}}
        moveBlock={() => {}}
      />,
    );

    expect(screen.getByText('Inserted Images')).toBeInTheDocument();
  });

  it('does not add inserted images section to map or diagram labeling editors', () => {
    const mapBlock: MapBlock = {
      id: 'map-1',
      type: 'MAP',
      instruction: 'Label the map.',
      assetUrl: 'https://example.com/map.png',
      questions: [{ id: 'q-1', label: 'A', correctAnswer: 'A', x: 50, y: 50 }],
    };

    const diagramBlock: DiagramLabelingBlockType = {
      id: 'diagram-1',
      type: 'DIAGRAM_LABELING',
      instruction: 'Label the diagram.',
      imageUrl: 'https://example.com/diagram.png',
      labels: [{ id: 'lbl-1', x: 20, y: 20, correctAnswer: 'Engine' }],
    };

    const { rerender } = render(
      <MapLabelingBlock
        block={mapBlock}
        startNum={1}
        endNum={1}
        updateBlock={() => {}}
        deleteBlock={() => {}}
        moveBlock={() => {}}
      />,
    );
    expect(screen.queryByText('Inserted Images')).not.toBeInTheDocument();

    rerender(
      <DiagramLabelingBlock
        block={diagramBlock}
        startNum={1}
        endNum={1}
        updateBlock={() => {}}
        deleteBlock={() => {}}
        moveBlock={() => {}}
      />,
    );
    expect(screen.queryByText('Inserted Images')).not.toBeInTheDocument();
  });
});
