import { extractGoogleDriveFileId } from './audioUrl';

export const normalizeImageUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const driveFileId = extractGoogleDriveFileId(trimmed);
  if (!driveFileId) {
    return trimmed;
  }

  return `https://drive.google.com/uc?export=download&id=${driveFileId}`;
};

