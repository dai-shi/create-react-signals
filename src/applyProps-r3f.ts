export const applyProps = (
  instance: any,
  props: { [key: string]: unknown },
) => {
  import('@react-three/fiber').then((m) => {
    m.applyProps(instance, props);
  });
};
