const METADATA_SUBSCRIPTION_ACTIVE_TIMESTAMP_FIELD = 'activeTimestamp';
const METADATA_SUBSCRIPTION_ACTIVE_QUANTITY_FIELD = 'activeQuantity';

export const getSubscriptionActiveQuantityMetadata = (
  activeQuantity: number,
  activeTimestamp: number
) => ({
  [METADATA_SUBSCRIPTION_ACTIVE_QUANTITY_FIELD]: activeQuantity,
  [METADATA_SUBSCRIPTION_ACTIVE_TIMESTAMP_FIELD]: activeTimestamp,
});
