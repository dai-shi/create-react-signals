import { expect, test } from 'vitest';
import { createReactSignals } from 'create-react-signals';

test('should export functions', () => {
  expect(createReactSignals).toBeDefined();
});
