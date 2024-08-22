import {
  ClassicPriceDataFragment,
  ClassicSnapshotDataFragment,
  ClmPriceDataFragment,
  ClmSnapshotDataFragment,
} from '../queries/codegen/sdk';
import { type Static, Type } from '@sinclair/typebox';
import { bigDecimalSchema, timestampNumberSchema } from '../schema/bigint';
import { addressSchema } from '../schema/address';
import { interpretAsDecimal } from './decimal';
import { Token } from './timeline';

export const clmHistoricPricesSchema = Type.Object({
  type: Type.Literal('clm'),
  timestamp: timestampNumberSchema,
  rangeMin: bigDecimalSchema,
  currentPrice: bigDecimalSchema,
  rangeMax: bigDecimalSchema,
  token0ToUsd: bigDecimalSchema,
  token1ToUsd: bigDecimalSchema,
  totalAmount0: bigDecimalSchema,
  totalAmount1: bigDecimalSchema,
  totalSupply: bigDecimalSchema,
});

export const classicHistoricPricesSchema = Type.Object({
  type: Type.Literal('classic'),
  timestamp: timestampNumberSchema,
  underlyingToUsd: bigDecimalSchema,
  totalUnderlyingAmount: bigDecimalSchema,
  totalSupply: bigDecimalSchema,
  totalUnderlyingSupply: bigDecimalSchema,
  totalUnderlyingBreakdown: Type.Array(
    Type.Object({
      token: addressSchema,
      amount: bigDecimalSchema,
      priceUsd: bigDecimalSchema,
    })
  ),
});

export type ClmHistoricPrice = Static<typeof clmHistoricPricesSchema>;
export type ClassicHistoricPrice = Static<typeof classicHistoricPricesSchema>;

export function handleClmPrice(
  sharesToken: ClmPriceDataFragment['sharesToken'],
  underlyingToken0: ClmPriceDataFragment['underlyingToken0'],
  underlyingToken1: ClmPriceDataFragment['underlyingToken1'],
  snapshot: ClmSnapshotDataFragment
): ClmHistoricPrice {
  const nativeToUsd = interpretAsDecimal(snapshot.nativeToUSDPrice, 18);

  return {
    type: 'clm',
    timestamp: Number.parseInt(snapshot.roundedTimestamp),
    rangeMin: interpretAsDecimal(snapshot.priceRangeMin1, underlyingToken1.decimals).toString(),
    currentPrice: interpretAsDecimal(
      snapshot.priceOfToken0InToken1,
      underlyingToken1.decimals
    ).toString(),
    rangeMax: interpretAsDecimal(snapshot.priceRangeMax1, underlyingToken1.decimals).toString(),
    token0ToUsd: interpretAsDecimal(snapshot.token0ToNativePrice, 18).mul(nativeToUsd).toString(),
    token1ToUsd: interpretAsDecimal(snapshot.token1ToNativePrice, 18).mul(nativeToUsd).toString(),
    totalAmount0: interpretAsDecimal(
      snapshot.totalUnderlyingAmount0,
      underlyingToken0.decimals
    ).toString(),
    totalAmount1: interpretAsDecimal(
      snapshot.totalUnderlyingAmount1,
      underlyingToken1.decimals
    ).toString(),
    totalSupply: interpretAsDecimal(snapshot.totalSupply, sharesToken.decimals).toString(),
  };
}

export const handleClassicPrice = (
  sharesToken: ClassicPriceDataFragment['sharesToken'],
  underlyingToken: ClassicPriceDataFragment['underlyingToken'],
  underlyingBreakdownTokens: Token[],
  snapshot: ClassicSnapshotDataFragment
): ClassicHistoricPrice => {
  const nativeToUsd = interpretAsDecimal(snapshot.nativeToUSDPrice, 18);

  return {
    type: 'classic',
    timestamp: Number.parseInt(snapshot.roundedTimestamp),
    underlyingToUsd: interpretAsDecimal(snapshot.underlyingToNativePrice, 18)
      .mul(nativeToUsd)
      .toString(),
    totalUnderlyingAmount: interpretAsDecimal(
      snapshot.underlyingAmount,
      underlyingToken.decimals
    ).toString(),
    totalSupply: interpretAsDecimal(snapshot.totalSupply, sharesToken.decimals).toString(),
    totalUnderlyingSupply: interpretAsDecimal(
      snapshot.vaultUnderlyingTotalSupply,
      underlyingToken.decimals
    ).toString(),
    totalUnderlyingBreakdown: underlyingBreakdownTokens.map((token, i) => ({
      token: token.address,
      amount: interpretAsDecimal(
        snapshot.vaultUnderlyingBreakdownBalances[i],
        token.decimals
      ).toString(),
      priceUsd: interpretAsDecimal(snapshot.underlyingBreakdownToNativePrices[i], 18)
        .mul(nativeToUsd)
        .toString(),
    })),
  };
};
