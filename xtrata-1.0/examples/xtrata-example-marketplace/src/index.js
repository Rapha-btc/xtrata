// Marketplace starter: read contract and listing status using Simple Mode.
import { createSimpleSdk } from '@xtrata/sdk/simple';
import { buildMarketBuyWorkflowPlan } from '@xtrata/sdk/workflows';

const senderAddress = process.env.XTRATA_SENDER || 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';
const xtrataContractId =
  process.env.XTRATA_CORE_CONTRACT ||
  'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0';
const marketContractId =
  process.env.XTRATA_MARKET_CONTRACT ||
  'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-market-v1-1';

const sdk = createSimpleSdk({
  senderAddress,
  xtrataContractId,
  marketContractId
});

const [nextTokenId, feeUnit, lastListingId] = await Promise.all([
  sdk.xtrata?.getNextTokenId(),
  sdk.xtrata?.getFeeUnit(),
  sdk.market?.getLastListingId()
]);

console.log({
  nextTokenId: nextTokenId?.toString(),
  feeUnitMicroStx: feeUnit?.toString(),
  lastListingId: lastListingId?.toString()
});

if (lastListingId && sdk.market) {
  const listing = await sdk.market.getListing(lastListingId);
  console.log({
    latestListing: listing
      ? {
          seller: listing.seller,
          tokenId: listing.tokenId.toString(),
          price: listing.price.toString()
        }
      : null
  });

  if (listing) {
    const marketBuyPlan = buildMarketBuyWorkflowPlan({
      marketContract: sdk.market.contract,
      nftContract: sdk.xtrata.contract,
      buyerAddress: senderAddress,
      listingId: lastListingId,
      tokenId: listing.tokenId,
      listingPriceMicroStx: listing.price
    });
    console.log({
      buyPlan: {
        functionName: marketBuyPlan.call.functionName,
        postConditionCount: marketBuyPlan.postConditions.length,
        summary: marketBuyPlan.summaryLines
      }
    });
  }
}

console.log('Built using Xtrata Protocol');
