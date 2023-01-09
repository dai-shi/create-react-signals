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
type SetValue = (path: (string | symbol)[], value: unknown) => void;

export function createReactSignals<Args extends object[]>(
  createSignal: (...args: Args) => [Subscribe, GetValue, SetValue],
  valueProp?: string | symbol,
  fallbackValueProp?: string | symbol,
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
          if (prop === valueProp) {
            return get();
          }
          if (valueProp && prop === fallbackValueProp) {
            prop = valueProp;
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
        set(_target, prop, value) {
          if (prop === valueProp) {
            set([], value);
            return true;
          }
          return false;
        },
        apply(_target, _thisArg, args) {
          return wrapProxy(
            sub,
            () => (get() as any)(...args),
            () => {
              throw new Error('Cannot set a value');
            },
          );
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

  // ----------------------------------------------------------------------

  // LIMITATION: this is just guessing from the first value
  const isDisplayableSignal = (sig: Signal) => {
    try {
      const v = readSignal(sig);
      return typeof v === 'string' || typeof v === 'number';
    } catch (e) {
      return false;
    }
  };

  const removeSignals = <T>(t: T, signalsToRemove: Signal[]): T => {
    const remove = (xa: [T]): [T] | [] => {
      const [x] = xa;
      if (signalsToRemove.includes(x as Signal)) {
        return [];
      }
      if (Array.isArray(x)) {
        const x2 = x.flatMap((item) => remove([item]));
        return x2.length === x.length && x2.every((item, i) => item === x[i])
          ? xa
          : [x2 as T];
      }
      if (typeof x === 'object' && x !== null) {
        const entries = Object.entries(x);
        const entries2 = entries.flatMap(([key, value]) => {
          const value2 = remove([value]);
          return value2.length === 0 ? [] : [[key, value2[0]] as const];
        });
        return entries2.length === entries.length &&
          entries2.every(([k, v]) => v === (x as Record<string, unknown>)[k])
          ? xa
          : [Object.fromEntries(entries2) as T];
      }
      return xa;
    };
    const result = remove([t]);
    return result.length ? result[0] : t;
  };

  const register = (
    children: unknown,
    className: unknown,
    style: unknown,
    rest: {
      [key: string]: unknown;
    },
  ) => {
    const unsubs: (() => void)[] = [];
    return (instance: any) => {
      unsubs.splice(0).forEach((unsub) => unsub());
      if (!instance) {
        return;
      }
      if (isSignal(children)) {
        unsubs.push(
          subscribeSignal(children, () => {
            instance.textContent = readSignal(children);
          }),
        );
      }
      if (isSignal(className)) {
        unsubs.push(
          subscribeSignal(className, () => {
            instance.className = readSignal(className);
          }),
        );
      }
      if (style) {
        Object.entries(style).forEach(([key, val]) => {
          if (isSignal(val))
            unsubs.push(
              subscribeSignal(val, () => {
                const v = readSignal(val);
                instance.style[key] = typeof v === 'number' ? `${v}px` : v;
              }),
            );
        });
      }
      Object.entries(rest).forEach(([key, val]) => {
        if (isSignal(val))
          unsubs.push(
            subscribeSignal(val, () => {
              const v = readSignal(val);
              if (instance.setAttribute && typeof v === 'string') {
                instance.setAttribute(key, v);
              } else {
                instance[key] = v;
              }
            }),
          );
      });
    };
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

    // case 1: no signals
    if (!signalsInChildren.length && !signalsInProps.length) {
      return createElementOrig(type, props, ...children);
    }

    // case 2: only displayable signals
    if (
      typeof type === 'string' &&
      signalsInChildren.length <= 1 &&
      signalsInChildren.every(isDisplayableSignal) &&
      signalsInProps.every(isDisplayableSignal)
    ) {
      const { className, style, ...rest } = props;
      return createElementOrig(
        type,
        {
          ...removeSignals(props, signalsInProps),
          ref: register(children, className, style, rest),
        },
        ...removeSignals(children, signalsInChildren),
      );
    }

    // case 3: signals including non-displayable ones
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
