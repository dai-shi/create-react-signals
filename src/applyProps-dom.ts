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
      ).forEach(([k2, v2]) => {
        if (k2 === 'float') {
          k2 = 'cssFloat';
        }
        (instance as any).style[k2] =
          typeof v2 === 'number' ? `${v2}px` : (v2 as string);
      });
    } else {
      (instance as any)[key] = value;
    }
  });
};
