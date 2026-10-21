import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HomePage from './page';

describe('console scaffold', () => {
  it('shows the product name and accurately describes the unimplemented shell', () => {
    render(<HomePage />);

    expect(
      screen.getByRole('heading', { name: 'Detection with context.' }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /Authentication, evaluation runs and analyst findings are not implemented yet\./,
      ),
    ).toBeTruthy();
  });
});
