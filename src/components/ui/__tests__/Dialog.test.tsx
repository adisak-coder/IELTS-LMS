import { describe, expect, it } from 'vitest';

import { Dialog } from '../Dialog';

describe('Dialog module', () => {
  it('exports the Dialog root component', () => {
    expect(Dialog).toBeTruthy();
  });
});
