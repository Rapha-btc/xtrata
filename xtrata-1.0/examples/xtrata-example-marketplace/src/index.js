// Marketplace starter: read contract and listing status using Simple Mode.
import { createSimpleSdk } from '@xtrata/sdk/simple';
import { buildMarketBuyWorkflowPlan } from '@xtrata/sdk/workflows';

const senderAddress = process.env.XTRATA_SENDER || 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';
const offlineMode = process.env.XTRATA_OFFLINE === '1';
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

let effectiveOfflineMode = offlineMode;
let nextTokenId = null;
let feeUnit = null;
let lastListingId = null;
let listing = null;

if (!offlineMode && sdk.xtrata && sdk.market) {
  try {
    [nextTokenId, feeUnit, lastListingId] = await Promise.all([
      sdk.xtrata.getNextTokenId(),
      sdk.xtrata.getFeeUnit(),
      sdk.market.getLastListingId()
    ]);
    if (lastListingId) {
      listing = await sdk.market.getListing(lastListingId);
    }
  } catch (error) {
    effectiveOfflineMode = true;
    console.log({
      warning:
        'Read-only fetch failed. Falling back to offline planning output.',
      reason: error instanceof Error ? error.message : String(error)
    });
  }
}

console.log({
  mode: effectiveOfflineMode ? 'offline' : 'network',
  nextTokenId: nextTokenId?.toString(),
  feeUnitMicroStx: feeUnit?.toString(),
  lastListingId: lastListingId?.toString()
});

if (listing) {
  console.log({
    latestListing: {
      seller: listing.seller,
      tokenId: listing.tokenId.toString(),
      price: listing.price.toString()
    }
  });
}

if (sdk.market && sdk.xtrata) {
  const plannedListingId = lastListingId ?? 1n;
  const plannedTokenId = listing?.tokenId ?? 1n;
  const plannedPrice = listing?.price ?? 1_000_000n;
  const marketBuyPlan = buildMarketBuyWorkflowPlan({
    marketContract: sdk.market.contract,
    nftContract: sdk.xtrata.contract,
    buyerAddress: senderAddress,
    listingId: plannedListingId,
    tokenId: plannedTokenId,
    listingPriceMicroStx: plannedPrice
  });
  console.log({
    buyPlan: {
      functionName: marketBuyPlan.call.functionName,
      postConditionCount: marketBuyPlan.postConditions.length,
      summary: marketBuyPlan.summaryLines
    }
  });
}

console.log('Built using Xtrata Protocol');
