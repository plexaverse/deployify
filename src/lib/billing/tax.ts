/**
 * Calculates tax based on the country code.
 * Applies 18% GST for India ('IN') and 0% for other countries.
 *
 * @param amount The subtotal amount.
 * @param countryCode The ISO 3166-1 alpha-2 country code (e.g., 'IN', 'US').
 * @returns An object containing the tax amount and the tax rate used.
 */
export function calculateTax(amount: number, countryCode: string): { taxAmount: number; taxRate: number } {
    // Normalize country code to uppercase
    const code = countryCode.toUpperCase();

    if (code === 'IN') {
        const taxRate = 0.18;
        return {
            taxAmount: amount * taxRate,
            taxRate
        };
    }

    return {
        taxAmount: 0,
        taxRate: 0
    };
}
