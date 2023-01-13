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

let r3fModule: any;

const applyPropsR3F = (instance: any, props: Props) => {
  if (!r3fModule) {
    import('@react-three/fiber').then((m) => {
      r3fModule = m;
      applyPropsR3F(instance, props);
    });
    return;
  }
  r3fModule.applyProps(instance, props);
};

export const applyProps = (instance: any, props: Props) => {
  let fn: typeof applyProps;
  if (typeof Element !== 'undefined' && instance instanceof Element) {
    fn = applyPropsDOM;
  } else if (instance.__r3f) {
    fn = applyPropsR3F;
  } else {
    throw new Error('Cannot detect renderer type');
  }
  fn(instance, props);
};
