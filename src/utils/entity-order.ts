export const sortEntitiesByOrderList = <
  TKeyName extends string,
  TKeyType extends string,
  T extends { [key in TKeyName]: TKeyType },
>(
  entities: T[],
  key: TKeyName,
  order: TKeyType[]
) => {
  const entityMap = entities.reduce(
    (acc, entity) => {
      acc[entity[key]] = entity;
      return acc;
    },
    {} as Record<TKeyType, T>
  );
  return order.map(key => entityMap[key]);
};
