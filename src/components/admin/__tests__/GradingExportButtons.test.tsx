import React from 'react';
import { describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GradingExportButtons } from '../GradingExportButtons';

describe('GradingExportButtons', () => {
  test('renders and invokes the matching export callback', () => {
    const onExportReading = vi.fn();
    const onExportReadingManual = vi.fn();
    const onExportListening = vi.fn();
    const onExportListeningManual = vi.fn();
    const onPrintWriting = vi.fn();

    render(
      <GradingExportButtons
        exportingSection={null}
        onExportReading={onExportReading}
        onExportReadingManual={onExportReadingManual}
        onExportListening={onExportListening}
        onExportListeningManual={onExportListeningManual}
        onPrintWriting={onPrintWriting}
      />,
    );

    expect(screen.getByText(/export csv/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /print all writing/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /reading csv/i }));
    fireEvent.click(screen.getByRole('button', { name: /reading manual check csv/i }));
    fireEvent.click(screen.getByRole('button', { name: /listening csv/i }));
    fireEvent.click(screen.getByRole('button', { name: /listening manual check csv/i }));
    fireEvent.click(screen.getByRole('button', { name: /print all writing/i }));

    expect(onExportReading).toHaveBeenCalledTimes(1);
    expect(onExportReadingManual).toHaveBeenCalledTimes(1);
    expect(onExportListening).toHaveBeenCalledTimes(1);
    expect(onExportListeningManual).toHaveBeenCalledTimes(1);
    expect(onPrintWriting).toHaveBeenCalledTimes(1);
  });
});
