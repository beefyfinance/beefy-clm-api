import { type SchemaOptions, type TEnum, type TSchema, Type } from '@sinclair/typebox';

export const StringEnum = <T extends string>(values: T[]) =>
  Type.Unsafe<T>({
    type: 'string',
    enum: values,
  }) as unknown as TEnum<Record<T, T>>;

// afaik, there is no way to set the options for the schema once set
// so we wrap that in Type.Awaited to set the options
export const setOpts = <T extends TSchema>(type: T, schemaOptions: SchemaOptions) =>
  Type.Awaited(type, schemaOptions);
