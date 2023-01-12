export const applyProps = (
  instance: Element,
  props: { [key: string]: unknown },
) => {
  Object.entries(props).forEach(([key, value]) => {
    if (key === 'children') {
      instance.textContent = value as string;
    } else if (key === 'style') {
      Object.entries(
        Array.isArray(value) ? Object.assign({}, ...value) : (value as object),
      ).forEach(([k, v]) => {
        if (k === 'float') {
          k = 'cssFloat';
        }
        (instance as any).style[k] =
          typeof v === 'number' ? `${v}px` : (v as string);
      });
    } else {
      (instance as any)[key] = value;
    }
  });
};
