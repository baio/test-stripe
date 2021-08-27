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
  timestamp:
    +subscription.metadata[METADATA_SUBSCRIPTION_ACTIVE_TIMESTAMP_FIELD],
});

const METADATA_TEST_TIMESTAMP_FIELD = 'testTimestamp';
const METADATA_TEST_TIMESTAMP_WARNING_FIELD = 'testTimestampWarning';

export const createInvoiceMetadata = (timestamp: number) => {
  return timestamp
    ? {
        [METADATA_TEST_TIMESTAMP_FIELD]: timestamp,
        [METADATA_TEST_TIMESTAMP_WARNING_FIELD]:
          'There is test current time stamp set for subscription, prorarta will be calculated incorrectly !',
      }
    : undefined;
};

export const getInvoiceTestTimestamp = (invoice: Stripe.Invoice) =>
  +invoice.metadata[METADATA_TEST_TIMESTAMP_FIELD];

export const getInvoicesRefunds = (
  refundableInvoices: Stripe.Invoice[],
  refundAmount: number
) => {
  const charges = refundableInvoices.reduce(
    (acc, v) =>
      // payment intent could be null for trial period invoice
      v.payment_intent
        ? [...(v.payment_intent as Stripe.PaymentIntent).charges.data, ...acc]
        : acc,
    [] as Stripe.Charge[]
  );
  const chargeAmounts = charges.map((charge) => ({
    paymentIntentId: charge.payment_intent as string,
    amount: charge.amount,
    amountRefunded: charge.amount_refunded,
    amountLeft: charge.amount - charge.amount_refunded,
  }));
  // create refunds left based on refundable invoices chares
  // if chare is not refunded or partially refunded - refund it with calculated amount
  // and then use next invoice for additional refunds if necessary
  const refunds = chargeAmounts.reduceRight(
    (acc, v) => {
      if (acc.refundLeftover <= 0) {
        // everything already covered by previous charges
        return acc;
      } else if (v.amountLeft >= acc.refundLeftover) {
        // charge has enough amount to cover refund
        return {
          charges: [
            ...acc.charges,
            {
              paymentIntentId: v.paymentIntentId,
              amountToRefund: acc.refundLeftover,
            },
          ],
          refundLeftover: 0,
        };
      } else {
        if (v.amountLeft > 0) {
          // charge has partial amount to cover refund
          return {
            charges: [
              ...acc.charges,
              {
                paymentIntentId: v.paymentIntentId,
                amountToRefund: v.amountLeft,
              },
            ],
            refundLeftover: acc.refundLeftover - v.amountLeft,
          };
        } else {
          // charge already refunded
          return acc;
        }
      }
    },
    {
      charges: [] as { paymentIntentId: string; amountToRefund: number }[],
      refundLeftover: refundAmount,
    }
  );
  return refunds;
};
