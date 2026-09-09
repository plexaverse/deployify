import assert from 'node:assert';
import { test, mock } from 'node:test';

test('Billing Order Registry (payment tier authorization)', async (t) => {
    const stored = new Map<string, Record<string, unknown>>();
    stored.set('order_pro_1', {
        orderId: 'order_pro_1',
        userId: 'user_1',
        tierId: 'pro',
        amount: 150000,
        currency: 'INR',
    });

    const docRef = (id: string) => ({
        _id: id,
        get: async () => ({
            exists: stored.has(id),
            data: () => stored.get(id),
        }),
        set: async (data: Record<string, unknown>) => {
            stored.set(id, { ...(stored.get(id) || {}), ...data });
        },
    });

    const mockDb = {
        collection: () => ({ doc: (id: string) => docRef(id) }),
        runTransaction: async <T>(cb: (tx: unknown) => Promise<T>): Promise<T> => cb({
            get: async (ref: { _id: string }) => ({
                exists: stored.has(ref._id),
                data: () => stored.get(ref._id),
            }),
            set: (ref: { _id: string }, data: Record<string, unknown>) => {
                stored.set(ref._id, { ...(stored.get(ref._id) || {}), ...data });
            },
        }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mock as any).module('@/lib/firebase', {
        namedExports: {
            getDb: () => mockDb,
            Collections: { BILLING_ORDERS: 'billingOrders' },
        }
    });

    const payments: Record<string, { order_id: string; status: string; amount: number }> = {
        pay_ok: { order_id: 'order_pro_1', status: 'captured', amount: 150000 },
        pay_authorized: { order_id: 'order_pro_1', status: 'authorized', amount: 150000 },
        pay_other_order: { order_id: 'order_someone_else', status: 'captured', amount: 150000 },
        pay_failed: { order_id: 'order_pro_1', status: 'failed', amount: 150000 },
        pay_short: { order_id: 'order_pro_1', status: 'captured', amount: 100 },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mock as any).module('@/lib/billing/payments', {
        namedExports: {
            getRazorpay: () => ({
                orders: {
                    fetch: async (orderId: string) => {
                        if (orderId !== 'order_legacy_team') throw new Error('order not found');
                        return {
                            id: orderId,
                            amount: 500000,
                            currency: 'INR',
                            notes: { userId: 'user_2', tierId: 'team' },
                        };
                    }
                },
                payments: {
                    fetch: async (paymentId: string) => {
                        const p = payments[paymentId];
                        if (!p) throw new Error('payment not found');
                        return p;
                    }
                }
            }),
        }
    });

    const {
        resolveOrderIntent, claimOrderPayment, getVerifyTierMode,
        isPaymentFulfilled, markOrderFulfilled, corroboratePayment, getPaymentCorroborationMode,
    } = await import('@/lib/billing/order-registry');

    await t.test('resolves the paid tier from the registry, not the client', async () => {
        const intent = await resolveOrderIntent('order_pro_1');
        assert.ok(intent);
        assert.strictEqual(intent?.tierId, 'pro');
        assert.strictEqual(intent?.userId, 'user_1');
        assert.strictEqual(intent?.source, 'registry');
    });

    await t.test('falls back to Razorpay order notes for pre-registry orders', async () => {
        const intent = await resolveOrderIntent('order_legacy_team');
        assert.ok(intent);
        assert.strictEqual(intent?.tierId, 'team');
        assert.strictEqual(intent?.userId, 'user_2');
        assert.strictEqual(intent?.source, 'razorpay');
    });

    await t.test('returns null when neither source can corroborate the order', async () => {
        assert.strictEqual(await resolveOrderIntent('order_unknown'), null);
    });

    await t.test('claims a payment once, then reports replays', async () => {
        const intent = await resolveOrderIntent('order_pro_1');
        assert.strictEqual(await claimOrderPayment('order_pro_1', 'pay_1', intent), 'claimed');
        assert.strictEqual(await claimOrderPayment('order_pro_1', 'pay_1', intent), 'replay');
        assert.strictEqual(stored.get('order_pro_1')?.consumedByPaymentId, 'pay_1');
    });

    await t.test('lazy-migrates a legacy order into the registry on claim', async () => {
        const intent = await resolveOrderIntent('order_legacy_team');
        assert.strictEqual(await claimOrderPayment('order_legacy_team', 'pay_2', intent), 'claimed');
        assert.strictEqual(stored.get('order_legacy_team')?.tierId, 'team');
        assert.strictEqual(stored.get('order_legacy_team')?.backfilledFrom, 'razorpay');
        assert.strictEqual(await claimOrderPayment('order_legacy_team', 'pay_2', intent), 'replay');
    });

    await t.test('a claimed-but-unfulfilled payment is not treated as already granted', async () => {
        // Regression guard for the claim -> grant window: claimOrderPayment() runs before
        // updateUser(), so "consumed" must never by itself mean "the customer got the tier".
        stored.set('order_crash_1', { orderId: 'order_crash_1', userId: 'user_9', tierId: 'pro', amount: 150000, currency: 'INR' });
        const intent = await resolveOrderIntent('order_crash_1');

        assert.strictEqual(await claimOrderPayment('order_crash_1', 'pay_crash', intent), 'claimed');
        assert.strictEqual(await claimOrderPayment('order_crash_1', 'pay_crash', intent), 'replay');
        // ...but nothing was ever granted, so the retry must be allowed to grant.
        assert.strictEqual(await isPaymentFulfilled('order_crash_1', 'pay_crash'), false);

        await markOrderFulfilled('order_crash_1', 'pay_crash', 'user_9', 'pro');
        assert.strictEqual(await isPaymentFulfilled('order_crash_1', 'pay_crash'), true);
        // A different payment against the same order is still unfulfilled.
        assert.strictEqual(await isPaymentFulfilled('order_crash_1', 'pay_other'), false);
    });

    await t.test('corroborates the payment against Razorpay without rejecting real ones', async () => {
        const intent = await resolveOrderIntent('order_pro_1');

        assert.strictEqual(await corroboratePayment('order_pro_1', 'pay_ok', intent), 'ok');
        // Razorpay's handler can fire before auto-capture lands - must not be a mismatch.
        assert.strictEqual(await corroboratePayment('order_pro_1', 'pay_authorized', intent), 'ok');
        assert.strictEqual(await corroboratePayment('order_pro_1', 'pay_other_order', intent), 'mismatch');
        assert.strictEqual(await corroboratePayment('order_pro_1', 'pay_failed', intent), 'mismatch');
        assert.strictEqual(await corroboratePayment('order_pro_1', 'pay_short', intent), 'mismatch');
        // Razorpay unreachable => 'unknown', which the route never treats as a rejection.
        assert.strictEqual(await corroboratePayment('order_pro_1', 'pay_missing', intent), 'unknown');
    });

    await t.test('payment corroboration defaults to monitor (no behaviour change on deploy)', async () => {
        const prevMock = process.env.MOCK_DB;
        const prevMode = process.env.BILLING_VERIFY_PAYMENT_MODE;

        delete process.env.MOCK_DB;
        delete process.env.BILLING_VERIFY_PAYMENT_MODE;
        assert.strictEqual(getPaymentCorroborationMode(), 'monitor');

        process.env.BILLING_VERIFY_PAYMENT_MODE = 'enforce';
        assert.strictEqual(getPaymentCorroborationMode(), 'enforce');

        process.env.MOCK_DB = 'true';
        assert.strictEqual(getPaymentCorroborationMode(), 'off');

        if (prevMock === undefined) delete process.env.MOCK_DB; else process.env.MOCK_DB = prevMock;
        if (prevMode === undefined) delete process.env.BILLING_VERIFY_PAYMENT_MODE; else process.env.BILLING_VERIFY_PAYMENT_MODE = prevMode;
    });

    await t.test('mode defaults to enforce and is forced off under MOCK_DB', async () => {
        const prevMock = process.env.MOCK_DB;
        const prevMode = process.env.BILLING_VERIFY_TIER_MODE;

        delete process.env.MOCK_DB;
        delete process.env.BILLING_VERIFY_TIER_MODE;
        assert.strictEqual(getVerifyTierMode(), 'enforce');

        process.env.BILLING_VERIFY_TIER_MODE = 'monitor';
        assert.strictEqual(getVerifyTierMode(), 'monitor');

        process.env.MOCK_DB = 'true';
        assert.strictEqual(getVerifyTierMode(), 'off');

        if (prevMock === undefined) delete process.env.MOCK_DB; else process.env.MOCK_DB = prevMock;
        if (prevMode === undefined) delete process.env.BILLING_VERIFY_TIER_MODE; else process.env.BILLING_VERIFY_TIER_MODE = prevMode;
    });
});
