import Stripe from 'stripe';

const METADATA_SUBSCRIPTION_ACTIVE_QUANTITY_FIELD = 'activeQuantity';
const METADATA_SUBSCRIPTION_ACTIVE_TIMESTAMP_FIELD = 'activeTimestamp';
const METADATA_SUBSCRIPTION_ACTIVE_WARNING_FIELD = 'activeWarning';

export const createSubscriptionActiveQuantityMetadata = (
  activeQuantity: number,
  activeTimestamp: number
) => ({
  [METADATA_SUBSCRIPTION_ACTIVE_QUANTITY_FIELD]: activeQuantity,
  [METADATA_SUBSCRIPTION_ACTIVE_TIMESTAMP_FIELD]: activeTimestamp,
  [METADATA_SUBSCRIPTION_ACTIVE_WARNING_FIELD]:
    'Active quantity is incorrect when active period expires. It will be updated automatically when retrieve active quantity through API.',
});

export const getSubscriptionActiveQuantityMetadata = (
  subscription: Stripe.Subscription
) => ({
  quantity: +subscription.metadata[METADATA_SUBSCRIPTION_ACTIVE_QUANTITY_FIELD],
  timestamp: +subscription.metadata[METADATA_SUBSCRIPTION_ACTIVE_TIMESTAMP_FIELD],
});
