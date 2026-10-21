import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScenarioPicker } from './scenario-picker';

describe('scenario preview', () => {
  it('changes the selected scenario and does not invent a run result', () => {
    render(<ScenarioPicker />);
    fireEvent.click(
      screen.getByRole('button', { name: /U010 · Bulk access/i }),
    );
    expect(screen.getByRole('heading', { name: 'Bulk access' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Start evaluation/i }));
    expect(screen.getByRole('status').textContent).toMatch(
      /No run was started/,
    );
    expect(screen.getByText('Not available')).toBeTruthy();
  });
});
