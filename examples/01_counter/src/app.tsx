import { createElement as createElementOrig } from 'react';
import { createReactSignals } from 'create-react-signals';

const { getSignal, inject } = createReactSignals(
  ({ initialValue }: { initialValue: unknown }) => {
    let value = initialValue;
    const listeners = new Set<() => void>();
    const sub = (callback: () => void) => {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    };
    const get = () => value;
    const set = (_path: unknown[], newValue: unknown) => {
      value = newValue;
      listeners.forEach((listener) => listener());
    };
    return [sub, get, set];
  },
  false,
  'value',
);

const createElement = inject(createElementOrig);

type AttachValue<T> = T & { value: T } & {
  readonly [K in keyof T]: AttachValue<T[K]>;
};

function signal<T>(initialValue: T): AttachValue<T> {
  return getSignal({ initialValue }) as never;
}

const counter = signal(0);

const Counter = () => {
  const inc = () => ++counter.value;
  return createElement(
    'div',
    null,
    createElement('div', null, 'Count: ', counter),
    createElement('button', { type: 'button', onClick: inc }, '+1'),
  );
};

const App = () => createElement('div', null, createElement(Counter));

export default App;
