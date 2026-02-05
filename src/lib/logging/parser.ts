export interface LogEntry {
    timestamp: string;
    severity: string;
    textPayload?: string;
    jsonPayload?: Record<string, unknown>;
    resource: {
        type: string;
        labels: Record<string, string>;
    };
    logName: string;
    insertId?: string;
}

export function parseLogEntry(dataString: string): LogEntry | { error: string } | null {
    try {
        const data = JSON.parse(dataString);
        if (data.error) {
            return { error: data.error };
        }
        return data as LogEntry;
    } catch {
        return null;
    }
}
