/* eslint @typescript-eslint/no-explicit-any: off */

import { createElement, isValidElement, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { applyProps } from './applyProps.js';
import type { Props } from './applyProps.js';

type Unsubscribe = () => void;
type Subscribe = (callback: () => void) => Unsubscribe;
type GetValue = () => unknown;
type SetValue = (path: (string | symbol)[], value: unknown) => void;

export function createReactSignals<Args extends object[]>(
  createSignal: (...args: Args) => readonly [Subscribe, GetValue, SetValue],
  recursive?: boolean,
  valueProp?: string | symbol,
  fallbackValueProp?: string | symbol,
  handlePromise?: (promise: Promise<unknown>) => unknown,
) {
  const SIGNAL = Symbol('REACT_SIGNAL');
  type Signal = {
    [SIGNAL]: readonly [Subscribe, GetValue, SetValue];
  };
  const isSignal = (x: unknown): x is Signal => !!(x as any)?.[SIGNAL];

  const EMPTY = Symbol();

  const wrapProxy = (sub: Subscribe, get: GetValue, set: SetValue): Signal => {
    const sig = new Proxy((() => {}) as any, {
      get(target, prop) {
        if (prop === SIGNAL) {
          return [sub, get, set];
        }
        if (prop === valueProp) {
          return get();
        }
        if (valueProp && prop === fallbackValueProp) {
          prop = valueProp;
        }
        if (recursive) {
          let value: unknown | typeof EMPTY = EMPTY;
          return wrapProxy(
            (callback) =>
              sub(() => {
                try {
                  const obj = get() as any;
                  const prevValue = value;
                  value = obj[prop];
                  if (
                    typeof value !== 'function' &&
                    Object.is(prevValue, value)
                  ) {
                    return;
                  }
                } catch (_e) {
                  // NOTE shouldn't we catch all errors?
                }
                callback();
              }),
            () => {
              const obj = get() as any;
              value = obj[prop];
              if (typeof value === 'function') {
                return value.bind(obj);
              }
              return value;
            },
            (path, val) => {
              set([prop, ...path], val);
            },
          );
        }
        return target[prop];
      },
      set(target, prop, value) {
        if (prop === valueProp) {
          set([], value);
          return true;
        }
        if (!recursive) {
          target[prop] = value;
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
    });
    return sig;
  };

  const signalCache = new WeakMap();

  const getSignal = (...args: Args): unknown => {
    let cache = signalCache;
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

  const findAllSignals = (target: unknown): Signal[] => {
    const seen = new WeakSet();
    const find = (x: unknown): Signal[] => {
      if (typeof x === 'object' && x !== null) {
        if (isValidElement(x)) {
          return [];
        }
        if (seen.has(x)) {
          return [];
        }
        seen.add(x);
      }
      if (isSignal(x)) {
        return [x];
      }
      if (Array.isArray(x)) {
        return x.flatMap(find);
      }
      if (typeof x === 'object' && x !== null) {
        return Object.values(x).flatMap(find);
      }
      return [];
    };
    return find(target);
  };

  const fillAllSignalValues = <T>(target: T): T => {
    const seen = new WeakSet();
    const fill = (x: T): T => {
      if (typeof x === 'object' && x !== null) {
        if (isValidElement(x)) {
          return x;
        }
        if (seen.has(x)) {
          return x;
        }
        seen.add(x);
      }
      if (isSignal(x)) {
        return readSignal(x) as T;
      }
      if (Array.isArray(x)) {
        let changed = false;
        const x2 = x.map((item) => {
          const item2 = fill(item);
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
            const value2 = fill(value);
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
    return fill(target);
  };

  const register = (
    fallback: () => void,
    signalsInChildren: Signal[],
    signalsInProps: { [key: string]: Signal[] },
    children: unknown[],
    props: Props | undefined,
  ) => {
    const unsubs: (() => void)[] = [];
    return (instance: any) => {
      unsubs.splice(0).forEach((unsub) => unsub());
      if (!instance) {
        return;
      }
      // NOTE it would be nicer if we can batch callbacks
      if (signalsInChildren.length) {
        const callback = () => {
          try {
            applyProps(instance, {
              children: fillAllSignalValues(children).join(''),
            });
          } catch (_e) {
            // NOTE shouldn't we catch all errors?
            fallback();
          }
        };
        signalsInChildren.forEach((sig) =>
          unsubs.push(
            subscribeSignal(sig, () => {
              try {
                const v = readSignal(sig);
                if (typeof v === 'string' || typeof v === 'number') {
                  callback();
                  return;
                }
              } catch (_e) {
                // NOTE shouldn't we catch all errors?
              }
              fallback();
            }),
          ),
        );
      }
      Object.entries(props || {}).forEach(([key, val]) => {
        const sigs = signalsInProps[key];
        if (sigs) {
          const callback = () => {
            try {
              applyProps(instance, {
                [key]: fillAllSignalValues(val),
              });
            } catch (_e) {
              // NOTE shouldn't we catch all errors?
              fallback();
            }
          };
          sigs.forEach((sig) =>
            unsubs.push(
              subscribeSignal(sig, () => {
                try {
                  const v = readSignal(sig);
                  if (!(v instanceof Promise)) {
                    callback();
                    return;
                  }
                } catch (_e) {
                  // NOTE shouldn't we catch all errors?
                }
                fallback();
              }),
            ),
          );
        }
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

  const SignalsRerenderer = ({
    uncontrolled,
    signals,
    render,
  }: {
    uncontrolled: boolean;
    signals: Signal[];
    render: (uncontrolledFallback: (() => void) | false) => ReactNode;
  }): ReactNode => {
    const [state, setState] = useState<{ uncontrolled?: boolean }>({
      uncontrolled,
    });
    const uncontrolledFallback = !!state.uncontrolled && (() => setState({}));
    const memoedSignals = useMemoList(state.uncontrolled ? [] : signals);
    useEffect(() => {
      const rerender = () => setState({});
      const unsubs = memoedSignals.map((sig) => subscribeSignal(sig, rerender));
      // FIXME we need to check if signals are updated
      // before the effect fires, and trigger rerender
      return () => unsubs.forEach((unsub) => unsub());
    }, [memoedSignals]);
    return render(uncontrolledFallback);
  };

  const inject = (createElementOrig: typeof createElement) => {
    const createElementInjected = (
      type: any,
      props?: Props,
      ...children: any[]
    ) => {
      const signalsInChildren = children.flatMap((child) =>
        isSignal(child) ? [child] : [],
      );
      const signalsInProps = Object.fromEntries(
        Object.entries(props || {}).flatMap(([key, value]) => {
          const sigs = findAllSignals(value);
          if (sigs.length) {
            return [[key, sigs]];
          }
          return [];
        }),
      );
      const allSignalsInProps = Object.values(signalsInProps).flat();

      // case: no signals
      if (!signalsInChildren.length && !allSignalsInProps.length) {
        return createElementOrig(type, props, ...children);
      }

      const hasNonDisplayableChildren = children.some(
        (child) =>
          !isSignal(child) &&
          typeof child !== 'string' &&
          typeof child !== 'number',
      );

      // case: rerenderer
      const getChildren = () =>
        signalsInChildren.length
          ? children.map((child) =>
              isSignal(child) ? readSignal(child) : child,
            )
          : children;
      const getProps = (uncontrolledFallback: (() => void) | false) => {
        let propsToReturn = props;
        if (allSignalsInProps.length) {
          propsToReturn = fillAllSignalValues(props);
        }
        if (uncontrolledFallback) {
          propsToReturn = {
            ...propsToReturn,
            ref: register(
              uncontrolledFallback,
              signalsInChildren,
              signalsInProps,
              children,
              props,
            ),
          };
        }
        return propsToReturn;
      };
      return createElementOrig(SignalsRerenderer as any, {
        uncontrolled: typeof type === 'string' && !hasNonDisplayableChildren,
        signals: [...signalsInChildren, ...allSignalsInProps],
        render: (uncontrolledFallback: (() => void) | false) =>
          createElementOrig(
            type,
            getProps(uncontrolledFallback),
            ...getChildren(),
          ),
      });
    };
    return createElementInjected as typeof createElement;
  };

  return { getSignal, inject };
}
