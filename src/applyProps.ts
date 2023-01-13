import { applyProps as applyPropsR3F } from '@react-three/fiber';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { UIManager } from 'react-native/Libraries/ReactPrivate/ReactNativePrivateInterface';

import { setValueForStyles } from './vendor/react-dom';

export type Props = { [key: string]: unknown };

export const applyPropsDOM = (instance: Element, props: Props) => {
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

// FIXME untested
// TODO support text instance
const applyPropsRN = (instance: any, props: Props) => {
  UIManager.updateView(
    instance._nativeTag,
    instance.viewConfig.uiViewClassName,
    props,
  );
};

export const applyProps = (instance: any, props: Props) => {
  let fn: typeof applyProps;
  if (typeof Element !== 'undefined' && instance instanceof Element) {
    fn = applyPropsDOM;
  } else if (instance.__r3f) {
    fn = applyPropsR3F;
  } else if (instance._nativeTag && instance.viewConfig) {
    fn = applyPropsRN;
  } else {
    throw new Error('Cannot detect renderer type');
  }
  fn(instance, props);
};
