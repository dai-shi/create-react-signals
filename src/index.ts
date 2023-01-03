import {
  createElement as createElementOrig,
  useEffect,
  useReducer,
  useState,
} from 'react';
import type { ReactNode } from 'react';

type Unsubscribe = () => void;
type Subscribe = (callback: () => void) => Unsubscribe;
type GetValue = () => unknown;
type SetValue = (path: unknown[], value: unknown) => void;

export function createReactSignals<Args extends object[]>(
  createSignal: (...args: Args) => [Subscribe, GetValue, SetValue],
  handlePromise?: (promise: Promise<unknown>) => unknown,
) {
  const SIGNAL = Symbol('REACT_SIGNAL');
  type Signal = {
    [SIGNAL]: [Subscribe, GetValue, SetValue];
  };
  const isSignal = (x: unknown): x is Signal => !!(x as any)?.[SIGNAL];

  const wrapProxy = (sub: Subscribe, get: GetValue, set: SetValue): Signal => {
    const sig = new Proxy(
      (() => {
        // empty
      }) as any,
      {
        get(_target, prop) {
          if (prop === SIGNAL) {
            return [sub, get, set];
          }
          return wrapProxy(
            sub,
            () => {
              const obj = get() as any;
              if (typeof obj[prop] === 'function') {
                return obj[prop].bind(obj);
              }
              return obj[prop];
            },
            (path, val) => {
              set([prop, ...path], val);
            },
          );
        },
        apply(_target, _thisArg, args) {
          const value = get();
          if (typeof value === 'function') {
            return wrapProxy(
              sub,
              () => (get() as any)(...args),
              () => {
                throw new Error('Cannot set a value');
              },
            );
          }
          if (args.length === 0) {
            return value;
          }
          return set([], args[0]);
        },
      },
    );
    return sig;
  };

  const cache1 = new WeakMap();

  const getSignal = (...args: Args): unknown => {
    let cache = cache1;
    for (let i = 0; i < args.length - 1; ++i) {
      const arg = args[i] as object;
      let nextCache = cache.get(arg);
      if (!nextCache) {
        nextCache = new WeakMap();
        cache.set(arg, nextCache);
      }
      cache = nextCache;
    }
    const lastArg = args[args.length - 1] as object;
    let sig = cache.get(lastArg);
    if (!sig) {
      sig = wrapProxy(...createSignal(...args));
      cache.set(lastArg, sig);
    }
    return sig;
  };

  const subscribeSignal = (sig: Signal, callback: () => void) => {
    return sig[SIGNAL][0](callback);
  };

  const readSignal = (sig: Signal) => {
    const value = sig[SIGNAL][1]();
    if (handlePromise && value instanceof Promise) {
      return handlePromise(value);
    }
    return value;
  };

  const useMemoList = <T>(list: T[], compareFn = (a: T, b: T) => a === b) => {
    const [state, setState] = useState(list);
    const listChanged =
      list.length !== state.length ||
      list.some((arg, index) => !compareFn(arg, state[index] as T));
    if (listChanged) {
      // schedule update, triggers re-render
      setState(list);
    }
    return listChanged ? list : state;
  };

  const Rerenderer = ({
    signals,
    render,
  }: {
    signals: Signal[];
    render: () => ReactNode;
  }): ReactNode => {
    const [, rerender] = useReducer((c) => c + 1, 0);
    const memoedSignals = useMemoList(signals);
    useEffect(() => {
      const unsubs = memoedSignals.map((sig) => subscribeSignal(sig, rerender));
      return () => unsubs.forEach((unsub) => unsub());
    }, [memoedSignals]);
    return render();
  };

  const findAllSignals = (x: unknown): Signal[] => {
    if (isSignal(x)) {
      return [x];
    }
    if (Array.isArray(x)) {
      return x.flatMap(findAllSignals);
    }
    if (typeof x === 'object' && x !== null) {
      return Object.values(x).flatMap(findAllSignals);
    }
    return [];
  };

  const fillAllSignalValues = <T>(x: T): T => {
    if (isSignal(x)) {
      return readSignal(x) as T;
    }
    if (Array.isArray(x)) {
      let changed = false;
      const x2 = x.map((item) => {
        const item2 = fillAllSignalValues(item);
        if (item !== item2) {
          changed = true; // HACK side effect
        }
        return item2;
      });
      return changed ? (x2 as typeof x) : x;
    }
    if (typeof x === 'object' && x !== null) {
      let changed = false;
      const x2 = Object.fromEntries(
        Object.entries(x).map(([key, value]) => {
          const value2 = fillAllSignalValues(value);
          if (value !== value2) {
            changed = true; // HACK side effect
          }
          return [key, value2];
        }),
      );
      return changed ? (x2 as typeof x) : x;
    }
    return x;
  };

  const createElement = ((type: any, props?: any, ...children: any[]) => {
    const signalsInChildren = children.flatMap((child) =>
      isSignal(child) ? [child] : [],
    );
    const signalsInProps = findAllSignals(props);
    if (!signalsInChildren.length && !signalsInProps.length) {
      return createElementOrig(type, props, ...children);
    }
    const getChildren = () =>
      signalsInChildren.length
        ? children.map((child) => (isSignal(child) ? readSignal(child) : child))
        : children;
    const getProps = () =>
      signalsInProps.length ? fillAllSignalValues(props) : props;
    return createElementOrig(Rerenderer as any, {
      signals: [...signalsInChildren, ...signalsInProps],
      render: () => createElementOrig(type, getProps(), ...getChildren()),
    });
  }) as typeof createElementOrig;

  return { getSignal, createElement };
}
