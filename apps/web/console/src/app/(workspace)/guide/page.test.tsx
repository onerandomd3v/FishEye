import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import GuidePage from './page';

afterEach(cleanup);

describe('Guide page', () => {
  it('explains the methods and evaluation terms in plain language', () => {
    render(<GuidePage />);

    expect(
      screen.getByRole('heading', { name: 'Guide', level: 1 }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Simple rules', level: 3 }),
    ).toBeTruthy();
    expect(screen.getByText('Score cutoff')).toBeTruthy();
    expect(screen.getByText('Person-day')).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: 'Back to evaluation' })
        .getAttribute('href'),
    ).toBe('/evaluation');
  });
});
