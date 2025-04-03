import Decimal from 'decimal.js';

export const interpretAsDecimal = (
  rawValue: string | null | undefined,
  decimals: string | number
): Decimal => {
  if (rawValue === null || rawValue === undefined) {
    return new Decimal(0);
  }
  return new Decimal(rawValue).dividedBy(new Decimal(10).pow(decimals));
};
