import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InvestigationList } from './list';

describe('investigation fixture list', () => {
  it('filters examples by account without presenting them as detector results', () => {
    render(<InvestigationList />);
    fireEvent.change(screen.getByLabelText('Search examples'), {
      target: { value: 'U010' },
    });
    expect(screen.getByRole('link', { name: 'U010' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'U003' })).toBeNull();
    expect(screen.getByText('Fixture only')).toBeTruthy();
  });
});
