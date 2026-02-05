import Razorpay from 'razorpay';
import { config } from '@/lib/config';
import crypto from 'crypto';

// Lazy-initialize Razorpay for server-side usage
let razorpayInstance: Razorpay | null = null;

export function getRazorpay(): Razorpay {
    if (!razorpayInstance) {
        razorpayInstance = new Razorpay({
            key_id: config.billing.razorpay.keyId,
            key_secret: config.billing.razorpay.keySecret,
        });
    }
    return razorpayInstance;
}

/**
 * Creates a Razorpay Order
 */
export async function createOrder(
    amount: number, // in paise
    currency: string = 'INR',
    receipt: string
) {
    const razorpay = getRazorpay();
    const options = {
        amount,
        currency,
        receipt,
    };
    try {
        const order = await razorpay.orders.create(options);
        return order;
    } catch (error) {
        console.error('Error creating Razorpay order:', error);
        throw error;
    }
}

/**
 * Verify Razorpay Payment Signature
 */
export function verifyPaymentSignature(
    orderId: string,
    paymentId: string,
    signature: string
): boolean {
    const hmac = crypto.createHmac('sha256', config.billing.razorpay.keySecret);
    hmac.update(orderId + '|' + paymentId);
    const generatedSignature = hmac.digest('hex');
    return generatedSignature === signature;
}

/**
 * Verify Webhook Signature
 */
export function verifyWebhookSignature(
    body: string,
    signature: string,
    webhookSecret: string
): boolean {
    const hmac = crypto.createHmac('sha256', webhookSecret);
    hmac.update(body);
    const generatedSignature = hmac.digest('hex');
    return generatedSignature === signature;
}

