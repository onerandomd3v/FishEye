import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ScenarioPicker } from './scenario-picker';

describe('scenario sample picker', () => {
  it('selects a bundled synthetic pack and offers its CSV for download', () => {
    const onSelect = vi.fn();
    render(
      <ScenarioPicker
        selectedId={null}
        loadingId={null}
        error=""
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Use sample' })[0]!);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'mixed-context' }),
    );
    expect(
      screen
        .getAllByRole('link', { name: 'Download CSV' })[0]!
        .getAttribute('href'),
    ).toBe('/demo-samples/approved-overtime-events-v2.csv');
  });
});
