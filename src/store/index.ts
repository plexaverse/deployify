import { create } from 'zustand';
import { createUISlice, UISlice } from './ui-slice';
import { createProjectSlice, ProjectSlice } from './project-slice';
import { createTeamSlice, TeamSlice } from './team-slice';
import { createImportSlice, ImportSlice } from './import-slice';
import { createBillingSlice, BillingSlice } from './billing-slice';
import { createSettingsSlice, SettingsSlice } from './settings-slice';

type StoreState = UISlice & ProjectSlice & TeamSlice & ImportSlice & BillingSlice & SettingsSlice;

export const useStore = create<StoreState>()((...a) => ({
    ...createUISlice(...a),
    ...createProjectSlice(...a),
    ...createTeamSlice(...a),
    ...createImportSlice(...a),
    ...createBillingSlice(...a),
    ...createSettingsSlice(...a),
}));
