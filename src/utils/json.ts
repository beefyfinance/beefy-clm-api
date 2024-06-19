type JsonScalar = string | number | boolean | Date | null;

type JsonObject = {
  [key: string]: JsonSerializable;
};

type JsonArray = Array<JsonSerializable>;

export type JsonSerializable = JsonScalar | JsonObject | JsonArray;
