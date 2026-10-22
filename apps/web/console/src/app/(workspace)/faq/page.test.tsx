import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import FaqPage from './page';

afterEach(cleanup);

describe('FAQ page', () => {
  it('shows ten collapsed, accessible questions without ranking them', () => {
    render(<FaqPage />);

    expect(
      screen.getByRole('heading', {
        name: 'Frequently Asked Questions',
        level: 1,
      }),
    ).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /important/i })).toBeNull();
    const questions = screen.getAllByText(/\?$/);
    expect(questions).toHaveLength(10);
    expect(document.querySelectorAll('details[open]')).toHaveLength(0);
  });

  it('expands and collapses an answer from its question summary', () => {
    render(<FaqPage />);

    const summary = screen.getByText(
      'Does “Under review” stop an employee’s access?',
    );
    const item = summary.closest('details');
    expect(item).not.toBeNull();
    fireEvent.click(summary);
    expect(item?.open).toBe(true);
    expect(
      screen.getByText(/It only means an analyst is investigating the finding/),
    ).toBeTruthy();
    fireEvent.click(summary);
    expect(item?.open).toBe(false);
  });
});
