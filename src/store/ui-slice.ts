import { StateCreator } from 'zustand';

export interface UISlice {
    isSidebarOpen: boolean;
    setSidebarOpen: (isOpen: boolean) => void;
    toggleSidebar: () => void;
    isMounted: boolean;
    setMounted: (isMounted: boolean) => void;
    isTeamSwitcherOpen: boolean;
    setTeamSwitcherOpen: (isOpen: boolean) => void;
    toggleTeamSwitcher: () => void;
}

export const createUISlice: StateCreator<UISlice> = (set) => ({
    isSidebarOpen: false,
    setSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),
    toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
    isMounted: false,
    setMounted: (isMounted) => set({ isMounted: isMounted }),
    isTeamSwitcherOpen: false,
    setTeamSwitcherOpen: (isOpen) => set({ isTeamSwitcherOpen: isOpen }),
    toggleTeamSwitcher: () => set((state) => ({ isTeamSwitcherOpen: !state.isTeamSwitcherOpen })),
});
