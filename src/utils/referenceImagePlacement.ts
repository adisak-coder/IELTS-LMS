import type {
  DiagramLabelingBlock,
  MapBlock,
  QuestionBlock,
  ReferenceImagePlacement,
} from '../types';

type MapOrDiagramBlock = MapBlock | DiagramLabelingBlock;

export const getReferenceImagePlacement = (
  block: MapOrDiagramBlock,
): ReferenceImagePlacement =>
  block.referenceImagePlacement === 'instruction' ? 'instruction' : 'question';

export const isInstructionReferencePlacement = (
  block: QuestionBlock,
): block is MapOrDiagramBlock =>
  (block.type === 'MAP' || block.type === 'DIAGRAM_LABELING') &&
  getReferenceImagePlacement(block) === 'instruction';
