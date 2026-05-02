import React, { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Image as ImageIcon,
  Link as LinkIcon,
  Plus,
  Trash2,
} from 'lucide-react';
import type { InsertedBlockImage } from '../../types';
import { createId } from '../../utils/idUtils';
import { getImageUrlCandidates } from '../../utils/imageUrl';

interface InsertedImagesEditorProps {
  images: InsertedBlockImage[] | undefined;
  onChange: (nextImages: InsertedBlockImage[]) => void;
  errors?: Array<{ field: string; message: string }>;
}

const EMPTY_INSERTED_IMAGES: InsertedBlockImage[] = [];

export function InsertedImagesEditor({
  images,
  onChange,
  errors = [],
}: InsertedImagesEditorProps) {
  const rows = Array.isArray(images) ? images : EMPTY_INSERTED_IMAGES;
  const [previewCandidateIndices, setPreviewCandidateIndices] = useState<
    Record<string, number>
  >({});
  const [previewFailures, setPreviewFailures] = useState<Record<string, boolean>>(
    {},
  );

  useEffect(() => {
    const rowIds = new Set(rows.map((row) => row.id));

    setPreviewCandidateIndices((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([imageId]) => rowIds.has(imageId)),
      ),
    );
    setPreviewFailures((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([imageId]) => rowIds.has(imageId)),
      ),
    );
  }, [rows]);

  const getFieldError = (field: string) =>
    errors.find((error) => error.field === field || error.field.includes(field));

  const updateImage = (
    imageId: string,
    updates: Partial<InsertedBlockImage>,
    options?: { resetPreview?: boolean },
  ) => {
    const nextImages = rows.map((row) =>
      row.id === imageId ? { ...row, ...updates } : row,
    );
    onChange(nextImages);

    if (options?.resetPreview) {
      setPreviewCandidateIndices((current) => ({ ...current, [imageId]: 0 }));
      setPreviewFailures((current) => ({ ...current, [imageId]: false }));
    }
  };

  const addImage = () => {
    onChange([
      ...rows,
      {
        id: createId('img'),
        url: '',
        caption: '',
      },
    ]);
  };

  const removeImage = (imageId: string) => {
    onChange(rows.filter((row) => row.id !== imageId));
  };

  const moveImage = (imageId: string, direction: 'up' | 'down') => {
    const sourceIndex = rows.findIndex((row) => row.id === imageId);
    if (sourceIndex < 0) {
      return;
    }

    const targetIndex = direction === 'up' ? sourceIndex - 1 : sourceIndex + 1;
    if (targetIndex < 0 || targetIndex >= rows.length) {
      return;
    }

    const nextImages = [...rows];
    const sourceRow = nextImages[sourceIndex];
    const targetRow = nextImages[targetIndex];
    if (!sourceRow || !targetRow) {
      return;
    }
    nextImages[sourceIndex] = targetRow;
    nextImages[targetIndex] = sourceRow;
    onChange(nextImages);
  };

  const handlePreviewError = (imageId: string, candidates: string[]) => {
    const currentIndex = previewCandidateIndices[imageId] ?? 0;
    const nextIndex = currentIndex + 1;

    if (nextIndex < candidates.length) {
      setPreviewCandidateIndices((current) => ({ ...current, [imageId]: nextIndex }));
      return;
    }

    setPreviewFailures((current) => ({ ...current, [imageId]: true }));
  };

  return (
    <div className="mb-5 rounded-md border border-gray-200 bg-gray-50/70 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            Inserted Images
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Appears after instruction and before question content. Supports Google
            Drive share links.
          </p>
        </div>
        <button
          type="button"
          onClick={addImage}
          className="inline-flex items-center gap-1 rounded-sm border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
        >
          <Plus size={14} /> Add Image
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-300 bg-white px-3 py-4 text-center text-xs text-gray-500">
          No inserted images yet.
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((row, index) => {
            const urlField = `insertedImages[${index}].url`;
            const candidates = getImageUrlCandidates(row.url ?? '');
            const candidateIndex = previewCandidateIndices[row.id] ?? 0;
            const resolvedUrl = candidates[candidateIndex] ?? '';
            const urlError = getFieldError(urlField);

            return (
              <div
                key={row.id}
                className="rounded-md border border-gray-200 bg-white p-3 shadow-sm"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                    Image {index + 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveImage(row.id, 'up')}
                      disabled={index === 0}
                      className="rounded-sm border border-gray-200 p-1 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={`Move image ${index + 1} up`}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveImage(row.id, 'down')}
                      disabled={index === rows.length - 1}
                      className="rounded-sm border border-gray-200 p-1 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={`Move image ${index + 1} down`}
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeImage(row.id)}
                      className="rounded-sm border border-red-200 p-1 text-red-600 hover:bg-red-50"
                      aria-label={`Remove image ${index + 1}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                      Image URL
                    </label>
                    <div className="relative">
                      <LinkIcon
                        size={15}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                      />
                      <input
                        type="url"
                        value={row.url}
                        onChange={(event) =>
                          updateImage(
                            row.id,
                            { url: event.target.value },
                            { resetPreview: true },
                          )
                        }
                        className={`w-full rounded-md border px-3 py-2 pl-9 text-sm text-gray-800 outline-none transition-colors ${
                          urlError
                            ? 'border-red-500 bg-red-50'
                            : 'border-gray-300 focus:border-blue-700 focus:ring-1 focus:ring-blue-700'
                        }`}
                        placeholder="https://drive.google.com/file/d/... or https://example.com/image.png"
                      />
                    </div>
                    {urlError ? (
                      <p className="mt-1 text-xs text-red-600">{urlError.message}</p>
                    ) : null}
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                      Caption (optional)
                    </label>
                    <input
                      type="text"
                      value={row.caption ?? ''}
                      onChange={(event) =>
                        updateImage(row.id, { caption: event.target.value })
                      }
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 outline-none transition-colors focus:border-blue-700 focus:ring-1 focus:ring-blue-700"
                      placeholder="Describe this image (optional)"
                    />
                  </div>

                  <div className="overflow-hidden rounded-md border border-gray-200 bg-gray-50">
                    {resolvedUrl && !previewFailures[row.id] ? (
                      <img
                        src={resolvedUrl}
                        alt={row.caption?.trim() || `Inserted image ${index + 1}`}
                        className="max-h-60 w-full object-contain"
                        onError={() => handlePreviewError(row.id, candidates)}
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="flex h-36 items-center justify-center gap-2 text-xs text-gray-500">
                        <ImageIcon size={16} className="text-gray-400" />
                        {row.url.trim()
                          ? 'Unable to load preview'
                          : 'Add an image URL to preview'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
