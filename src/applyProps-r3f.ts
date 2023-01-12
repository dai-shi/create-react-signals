let mod: any;

export const applyProps = (
  instance: any,
  props: { [key: string]: unknown },
) => {
  if (mod) {
    mod.applyProps(instance, props);
    return;
  }
  import('@react-three/fiber').then((m) => {
    mod = m;
    m.applyProps(instance, props);
  });
};
