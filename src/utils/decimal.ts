import Decimal from 'decimal.js';

export const interpretAsDecimal = (rawValue: string, decimals: string | number): Decimal => {
  return new Decimal(rawValue).dividedBy(new Decimal(10).pow(decimals));
};
