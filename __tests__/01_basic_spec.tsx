import { createReactSignals } from '../src/index';

describe('basic spec', () => {
  it('should export functions', () => {
    expect(createReactSignals).toBeDefined();
  });
});
