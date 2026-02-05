import Stripe from 'stripe';
import { config } from '@/lib/config';

// Initialize Stripe with the secret key from config
export const stripe = new Stripe(config.billing.stripe.secretKey, {
    apiVersion: '2026-01-28.clover',
    typescript: true,
});

/**
 * Creates a Stripe Checkout Session for a subscription.
 */
export async function createCheckoutSession(
    customerId: string,
    priceId: string,
    successUrl: string,
    cancelUrl: string
) {
    const session = await stripe.checkout.sessions.create({
        customer: customerId,
        line_items: [
            {
                price: priceId,
                quantity: 1,
            },
        ],
        mode: 'subscription',
        success_url: successUrl,
        cancel_url: cancelUrl,
    });

    return session;
}

/**
 * Cancels a Stripe subscription.
 */
export async function cancelSubscription(subscriptionId: string) {
    const subscription = await stripe.subscriptions.cancel(subscriptionId);
    return subscription;
}

/**
 * Retrieves the status of a Stripe subscription.
 */
export async function getSubscriptionStatus(subscriptionId: string) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    return subscription.status;
}
