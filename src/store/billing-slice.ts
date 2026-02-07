import { StateCreator } from 'zustand';

interface UsageData {
    usage: {
        deployments: number;
        buildMinutes: number;
        bandwidth: number;
    };
    limits: {
        deployments: number;
        buildMinutes: number;
        bandwidth: number;
    };
    tier: {
        id: string;
        name: string;
    };
}

interface Invoice {
    id: string;
    invoiceNumber: string;
    date: string;
    total: number;
    status: string;
}

export interface BillingSlice {
    usageData: UsageData | null;
    invoices: Invoice[];
    isLoadingBilling: boolean;
    billingError: string | null;
    upgradingTierId: string | null;

    setUsageData: (data: UsageData | null) => void;
    setInvoices: (invoices: Invoice[]) => void;
    setLoadingBilling: (isLoading: boolean) => void;
    setBillingError: (error: string | null) => void;
    setUpgradingTierId: (tierId: string | null) => void;
    fetchBillingData: () => Promise<void>;
}

export const createBillingSlice: StateCreator<BillingSlice> = (set) => ({
    usageData: null,
    invoices: [],
    isLoadingBilling: true,
    billingError: null,
    upgradingTierId: null,

    setUsageData: (data) => set({ usageData: data }),
    setInvoices: (invoices) => set({ invoices }),
    setLoadingBilling: (isLoading) => set({ isLoadingBilling: isLoading }),
    setBillingError: (error) => set({ billingError: error }),
    setUpgradingTierId: (tierId) => set({ upgradingTierId: tierId }),

    fetchBillingData: async () => {
        set({ isLoadingBilling: true, billingError: null });
        try {
            const [usageRes, invoicesRes] = await Promise.all([
                fetch('/api/billing/usage'),
                fetch('/api/billing/invoices')
            ]);

            if (usageRes.status === 401) {
                window.location.href = '/login';
                return;
            }

            if (!usageRes.ok) throw new Error('Failed to load billing data');

            const usageData = await usageRes.json();
            const invoicesData = invoicesRes.ok ? await invoicesRes.json() : { invoices: [] };

            set({
                usageData,
                invoices: invoicesData.invoices || [],
                isLoadingBilling: false
            });
        } catch (error) {
            console.error('Billing fetch error:', error);
            set({
                billingError: error instanceof Error ? error.message : 'Failed to load billing data',
                isLoadingBilling: false
            });
        }
    },
});
