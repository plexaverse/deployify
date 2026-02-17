import { StateCreator } from 'zustand';

export interface EnvVar {
    key: string;
    value: string;
    target: 'both' | 'build' | 'runtime';
    isSecret?: boolean;
}

export interface ImportSlice {
    projectName: string;
    framework: string;
    rootDirectory: string;
    buildCommand: string;
    outputDirectory: string;
    installCommand: string;
    region: string;
    envVars: EnvVar[];
    newEnvKey: string;
    newEnvValue: string;
    newEnvTarget: 'both' | 'build' | 'runtime';
    newEnvIsSecret: boolean;
    isDeploying: boolean;

    setProjectName: (name: string) => void;
    setFramework: (framework: string) => void;
    setRootDirectory: (dir: string) => void;
    setBuildCommand: (cmd: string) => void;
    setOutputDirectory: (dir: string) => void;
    setInstallCommand: (cmd: string) => void;
    setRegion: (region: string) => void;
    setEnvVars: (vars: EnvVar[]) => void;
    setNewEnvKey: (key: string) => void;
    setNewEnvValue: (value: string) => void;
    setNewEnvTarget: (target: 'both' | 'build' | 'runtime') => void;
    setNewEnvIsSecret: (isSecret: boolean) => void;
    setDeploying: (deploying: boolean) => void;
    resetImportState: () => void;
}

export const createImportSlice: StateCreator<ImportSlice> = (set) => ({
    projectName: '',
    framework: 'auto',
    rootDirectory: '',
    buildCommand: '',
    outputDirectory: '',
    installCommand: '',
    region: '',
    envVars: [],
    newEnvKey: '',
    newEnvValue: '',
    newEnvTarget: 'both',
    newEnvIsSecret: false,
    isDeploying: false,

    setProjectName: (name) => set({ projectName: name }),
    setFramework: (framework) => set({ framework }),
    setRootDirectory: (dir) => set({ rootDirectory: dir }),
    setBuildCommand: (cmd) => set({ buildCommand: cmd }),
    setOutputDirectory: (dir) => set({ outputDirectory: dir }),
    setInstallCommand: (cmd) => set({ installCommand: cmd }),
    setRegion: (region) => set({ region }),
    setEnvVars: (vars) => set({ envVars: vars }),
    setNewEnvKey: (key) => set({ newEnvKey: key }),
    setNewEnvValue: (value) => set({ newEnvValue: value }),
    setNewEnvTarget: (target) => set({ newEnvTarget: target }),
    setNewEnvIsSecret: (isSecret) => set({ newEnvIsSecret: isSecret }),
    setDeploying: (deploying) => set({ isDeploying: deploying }),
    resetImportState: () => set({
        projectName: '',
        framework: 'auto',
        rootDirectory: '',
        buildCommand: '',
        outputDirectory: '',
        installCommand: '',
        region: '',
        envVars: [],
        newEnvKey: '',
        newEnvValue: '',
        newEnvTarget: 'both',
        newEnvIsSecret: false,
        isDeploying: false,
    }),
});
