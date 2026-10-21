import { describe, expect, it } from 'vitest';
import { siteContent } from './site';

describe('landing page copy', () => {
  it('identifies the synthetic-data scope and avoids claiming a live banking connection', () => {
    expect(siteContent.title).toContain('FishEye');
    expect(siteContent.disclaimer).toContain('synthetic-data research MVP');
    expect(siteContent.disclaimer).toContain(
      'No real banking system is connected',
    );
  });
});
