import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { InsertedBlockImage } from '../../../types';
import { InsertedImagesEditor } from '../InsertedImagesEditor';

describe('InsertedImagesEditor', () => {
  it('handles undefined insertedImages input for legacy blocks', () => {
    const onChange = vi.fn();

    render(<InsertedImagesEditor images={undefined} onChange={onChange} />);

    expect(screen.getByText('No inserted images yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /add image/i }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({
        id: expect.any(String),
        url: '',
        caption: '',
      }),
    ]);
  });

  it('adds, updates, reorders, and removes inserted image rows', () => {
    let latestImages: InsertedBlockImage[] = [];

    function Harness() {
      const [images, setImages] = useState<InsertedBlockImage[]>([]);
      latestImages = images;
      return <InsertedImagesEditor images={images} onChange={setImages} />;
    }

    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: /add image/i }));
    expect(latestImages).toHaveLength(1);

    const firstUrlInput = screen.getByPlaceholderText(
      /https:\/\/drive\.google\.com\/file\/d\/\.\.\./i,
    );
    const firstCaptionInput = screen.getByPlaceholderText(
      /describe this image \(optional\)/i,
    );
    fireEvent.change(firstUrlInput, { target: { value: 'https://example.com/one.png' } });
    fireEvent.change(firstCaptionInput, { target: { value: 'First caption' } });

    fireEvent.click(screen.getByRole('button', { name: /add image/i }));
    const urlInputs = screen.getAllByPlaceholderText(
      /https:\/\/drive\.google\.com\/file\/d\/\.\.\./i,
    );
    fireEvent.change(urlInputs[1], { target: { value: 'https://example.com/two.png' } });

    fireEvent.click(screen.getByLabelText('Move image 2 up'));
    expect(latestImages.map((image) => image.url)).toEqual([
      'https://example.com/two.png',
      'https://example.com/one.png',
    ]);

    fireEvent.click(screen.getByLabelText('Remove image 1'));
    expect(latestImages).toHaveLength(1);
    expect(latestImages[0]?.url).toBe('https://example.com/one.png');
    expect(latestImages[0]?.caption).toBe('First caption');
  });

  it('renders a Google Drive candidate URL preview', () => {
    const driveUrl =
      'https://drive.google.com/file/d/abc123DEF456/view?usp=sharing';

    render(
      <InsertedImagesEditor
        images={[
          {
            id: 'img-1',
            url: driveUrl,
            caption: 'Drive preview',
          },
        ]}
        onChange={() => {}}
      />,
    );

    const preview = screen.getByAltText('Drive preview');
    expect(preview).toHaveAttribute(
      'src',
      'https://drive.google.com/uc?export=view&id=abc123DEF456',
    );
  });
});
