/* eslint @typescript-eslint/no-explicit-any: off */

import { setValueForStyles } from './vendor/react-dom.js';

// eslint-disable-next-line no-var
declare var __CREATE_REACT_SIGNALS_ATTACH_PROPS: any;

export type Props = { [key: string]: unknown };

const applyPropsDOM = (instance: Element, props: Props) => {
  Object.entries(props).forEach(([key, value]) => {
    if (key === 'children') {
      instance.textContent = value as string;
    } else if (key === 'style') {
      setValueForStyles(
        instance,
        Array.isArray(value) ? Object.assign({}, ...value) : (value as object),
      );
    } else {
      (instance as any)[key] = value;
    }
  });
};

const applyPropsR3F = (instance: any, props: Props) => {
  Object.entries(props).forEach(([key, value]) => {
    if (instance[key]?.fromArray && Array.isArray(value)) {
      instance[key].fromArray(value);
    } else if (instance[key]?.set) {
      instance[key].set(...(Array.isArray(value) ? value : [value]));
    } else if (
      instance[key]?.copy &&
      value?.constructor &&
      instance[key].constructor.name === value.constructor.name
    ) {
      instance[key].copy(value);
    } else {
      instance[key] = value;
    }
  });
};

export const applyProps = (instance: any, props: Props) => {
  let fn: typeof applyProps;
  if (typeof __CREATE_REACT_SIGNALS_ATTACH_PROPS === 'function') {
    fn = __CREATE_REACT_SIGNALS_ATTACH_PROPS;
  } else if (typeof Element !== 'undefined' && instance instanceof Element) {
    fn = applyPropsDOM;
  } else if (instance.__r3f) {
    fn = applyPropsR3F;
  } else {
    throw new Error('Cannot detect renderer type');
  }
  fn(instance, props);
};
