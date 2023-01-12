const R3F = 'https://esm.sh/@react-three/fiber@8.10.0';

export const applyProps = (
  instance: Element,
  props: { [key: string]: unknown },
) => {
  import(R3F).then((m) => {
    m.applyProps(instance, props);
  });
};
