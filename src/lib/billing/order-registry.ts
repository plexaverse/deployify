import { getDb, Collections } from '@/lib/firebase';
import { cleanFirestoreData } from '@/lib/utils';
import { TIERS, type TierType } from '@/lib/billing/tiers';
import { getRazorpay } from '@/lib/billing/payments';

/**
 * Server-side record of what a Razorpay order was actually created for.
 *
 * /api/billing/verify used to trust the `tierId` the browser posted alongside the
 * Razorpay signature, even though the signature only covers `orderId|paymentId`.
 * This module is the authoritative answer to "which tier did this order pay for?".
 */
export interface BillingOrderRecord {
    orderId: string;
    userId: string;
    tierId: TierType;
    amount: number; // paise
    currency: string;
}

export type OrderIntentSource = 'registry' | 'razorpay';

export interface OrderIntent extends BillingOrderRecord {
    source: OrderIntentSource;
}

export type ClaimResult = 'claimed' | 'replay' | 'unavailable';

export type VerifyTierMode = 'enforce' | 'monitor' | 'off';

export type PaymentCorroborationMode = 'enforce' | 'monitor' | 'off';

export type PaymentCorroboration = 'ok' | 'mismatch' | 'unknown';

function isTierType(value: unknown): value is TierType {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(TIERS, value);
}

/**
 * Resolution mode for /api/billing/verify.
 *
 * - `enforce` (default): the tier written to the user comes from the server-side
 *   order intent; a client tier that cannot be corroborated is rejected.
 * - `monitor`: log mismatches but keep the pre-fix behaviour (client tier wins).
 *   Use this as the one-line rollback if enforcement misbehaves in production.
 * - `off`: pre-fix behaviour with no extra lookups. Forced on for MOCK_DB local dev,
 *   where there is no real Razorpay order to corroborate against.
 */
export function getVerifyTierMode(): VerifyTierMode {
    if (process.env.MOCK_DB === 'true') return 'off';

    const raw = (process.env.BILLING_VERIFY_TIER_MODE || 'enforce').toLowerCase();
    if (raw === 'monitor' || raw === 'off') return raw;
    return 'enforce';
}

/**
 * Whether /api/billing/verify corroborates the payment itself (not just the
 * order) against Razorpay.
 *
 * - `monitor` (default): fetch the payment and log any mismatch, but grant as
 *   today. This is deliberately the default so the first deploy changes no
 *   outcome, only observability.
 * - `enforce`: reject a payment that belongs to another order, has failed, or
 *   paid less than the order amount.
 * - `off`: no payment lookup at all. Forced on for MOCK_DB local dev.
 */
export function getPaymentCorroborationMode(): PaymentCorroborationMode {
    if (process.env.MOCK_DB === 'true') return 'off';

    const raw = (process.env.BILLING_VERIFY_PAYMENT_MODE || 'monitor').toLowerCase();
    if (raw === 'enforce' || raw === 'off') return raw;
    return 'monitor';
}

/**
 * Persist the server-side intent for a freshly created Razorpay order.
 * Best effort: a Firestore hiccup must never break checkout, because
 * resolveOrderIntent() can still fall back to the order's Razorpay notes.
 */
export async function recordBillingOrder(record: BillingOrderRecord): Promise<boolean> {
    try {
        const db = getDb();
        await db.collection(Collections.BILLING_ORDERS).doc(record.orderId).set(
            cleanFirestoreData({
                ...record,
                createdAt: new Date(),
                updatedAt: new Date(),
            })
        );
        return true;
    } catch (error) {
        console.error('[Billing] Failed to record billing order intent', { orderId: record.orderId, error });
        return false;
    }
}

/**
 * Resolve what an order was actually created for, without trusting the client.
 *
 * Dual read, so no backfill migration is needed:
 *  1. the `billingOrders` registry (written by /api/billing/checkout from this deploy on);
 *  2. the Razorpay order itself, whose `notes` have always carried
 *     { userId, tierId } (src/app/api/billing/checkout/route.ts) — this covers
 *     every order created before the registry existed.
 */
export async function resolveOrderIntent(orderId: string): Promise<OrderIntent | null> {
    try {
        const db = getDb();
        const snap = await db.collection(Collections.BILLING_ORDERS).doc(orderId).get();
        const data = snap.exists ? snap.data() : undefined;

        if (data && isTierType(data.tierId) && typeof data.userId === 'string' && data.userId) {
            return {
                orderId,
                userId: data.userId,
                tierId: data.tierId,
                amount: typeof data.amount === 'number' ? data.amount : TIERS[data.tierId].price * 100,
                currency: typeof data.currency === 'string' ? data.currency : 'INR',
                source: 'registry',
            };
        }
    } catch (error) {
        console.error('[Billing] Order registry lookup failed', { orderId, error });
    }

    try {
        const order = await getRazorpay().orders.fetch(orderId);
        const notes = (order?.notes || {}) as Record<string, string | number | undefined>;

        if (isTierType(notes.tierId) && typeof notes.userId === 'string' && notes.userId) {
            return {
                orderId,
                userId: notes.userId,
                tierId: notes.tierId,
                amount: Number(order.amount) || TIERS[notes.tierId].price * 100,
                currency: typeof order.currency === 'string' ? order.currency : 'INR',
                source: 'razorpay',
            };
        }

        console.error('[Billing] Razorpay order carries no usable notes', { orderId, notes });
    } catch (error) {
        console.error('[Billing] Razorpay order fetch failed', { orderId, error });
    }

    return null;
}

/**
 * Mark an order as consumed by a specific payment, so the same
 * (orderId, paymentId, signature) triple cannot be replayed to keep pushing
 * currentPeriodEnd out by another 30 days.
 *
 * Returns 'replay' only for an exact re-submission of a payment we already
 * granted. Anything we cannot determine (Firestore error) returns 'unavailable'
 * and the caller grants the tier anyway — never block a real payment on our
 * bookkeeping.
 */
export async function claimOrderPayment(
    orderId: string,
    paymentId: string,
    intent: OrderIntent | null
): Promise<ClaimResult> {
    try {
        const db = getDb();
        const ref = db.collection(Collections.BILLING_ORDERS).doc(orderId);

        return await db.runTransaction<ClaimResult>(async (tx) => {
            const snap = await tx.get(ref);
            const data = snap.exists ? snap.data() : undefined;
            const consumedBy = typeof data?.consumedByPaymentId === 'string'
                ? data.consumedByPaymentId
                : undefined;

            if (consumedBy === paymentId) {
                return 'replay';
            }

            if (consumedBy) {
                // A different, signature-valid payment against the same order.
                // Rare (partial payments) but it is real money - grant it, but leave a trail.
                console.warn('[Billing] Order re-used by a different payment', { orderId, consumedBy, paymentId });
            }

            const patch: Record<string, unknown> = {
                orderId,
                consumedByPaymentId: paymentId,
                consumedAt: new Date(),
                updatedAt: new Date(),
            };

            // Lazy-migrate: orders created before the registry existed get a row now.
            if (!snap.exists && intent) {
                patch.userId = intent.userId;
                patch.tierId = intent.tierId;
                patch.amount = intent.amount;
                patch.currency = intent.currency;
                patch.createdAt = new Date();
                patch.backfilledFrom = intent.source;
            }

            tx.set(ref, cleanFirestoreData(patch), { merge: true });
            return 'claimed';
        });
    } catch (error) {
        console.error('[Billing] Could not claim order payment; granting anyway', { orderId, paymentId, error });
        return 'unavailable';
    }
}

/**
 * Record that the subscription grant for this payment actually landed.
 *
 * claimOrderPayment() has to run *before* updateUser() so two concurrent
 * requests cannot both grant. That ordering means a crash between the two
 * would leave the order marked consumed while the paying customer is still on
 * 'free' - and every retry would then short-circuit to `{ success: true }`
 * without ever upgrading them. The claim marks "in flight"; this marks "done",
 * and only "done" is allowed to short-circuit a replay.
 *
 * Best effort by design: the money has already moved and the user has already
 * been upgraded by the time we get here, so a Firestore hiccup must not turn a
 * successful upgrade into a 500. The cost of losing this write is that a
 * deliberate replay of the same triple re-grants 30 days - customer-favourable,
 * and bounded by claimOrderPayment()'s log trail.
 */
export async function markOrderFulfilled(
    orderId: string,
    paymentId: string,
    userId: string,
    tierId: TierType
): Promise<void> {
    try {
        const db = getDb();
        await db.collection(Collections.BILLING_ORDERS).doc(orderId).set(
            cleanFirestoreData({
                fulfilledPaymentId: paymentId,
                fulfilledUserId: userId,
                fulfilledTierId: tierId,
                fulfilledAt: new Date(),
                updatedAt: new Date(),
            }),
            { merge: true }
        );
    } catch (error) {
        console.error('[Billing] Could not record fulfilment', { orderId, paymentId, error });
    }
}

/**
 * Has this exact payment already been granted? Only `true` short-circuits a
 * replay; anything we cannot determine returns `false` so the grant is retried
 * (granting twice is an idempotent absolute write - never an increment).
 */
export async function isPaymentFulfilled(orderId: string, paymentId: string): Promise<boolean> {
    try {
        const db = getDb();
        const snap = await db.collection(Collections.BILLING_ORDERS).doc(orderId).get();
        return Boolean(snap.exists && snap.data()?.fulfilledPaymentId === paymentId);
    } catch (error) {
        console.error('[Billing] Fulfilment lookup failed; treating as unfulfilled', { orderId, paymentId, error });
        return false;
    }
}

/**
 * Corroborate the payment against Razorpay.
 *
 * The checkout signature is only HMAC(orderId|paymentId) - it proves the pair
 * came out of Razorpay checkout, not that money was actually taken or how much.
 *
 * `authorized` is deliberately accepted: Razorpay's browser handler fires the
 * instant the payment succeeds, which can be before auto-capture lands. Only a
 * genuinely bad payment (wrong order, failed, short-paid) is a 'mismatch'.
 */
export async function corroboratePayment(
    orderId: string,
    paymentId: string,
    intent: OrderIntent | null
): Promise<PaymentCorroboration> {
    try {
        const payment = await getRazorpay().payments.fetch(paymentId) as unknown as {
            order_id?: string;
            status?: string;
            amount?: number | string;
        };

        if (payment?.order_id && payment.order_id !== orderId) {
            console.error('[Billing] Payment belongs to a different order', {
                orderId, paymentId, paymentOrderId: payment.order_id
            });
            return 'mismatch';
        }

        if (payment?.status === 'failed') {
            console.error('[Billing] Payment is not in a payable state', {
                orderId, paymentId, status: payment.status
            });
            return 'mismatch';
        }

        if (intent && Number(payment?.amount) < intent.amount) {
            console.error('[Billing] Payment is short of the order amount', {
                orderId, paymentId, paid: payment?.amount, expected: intent.amount
            });
            return 'mismatch';
        }

        return 'ok';
    } catch (error) {
        console.error('[Billing] Payment corroboration lookup failed', { orderId, paymentId, error });
        return 'unknown';
    }
}
