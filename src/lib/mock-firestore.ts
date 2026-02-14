class MockTimestamp {
    constructor(private date: Date) {}
    toDate() { return this.date; }
}

function convertDatesToTimestamps(obj: any): any {
    if (obj instanceof Date) return new MockTimestamp(obj);
    if (Array.isArray(obj)) return obj.map(convertDatesToTimestamps);
    if (obj && typeof obj === 'object') {
        const newObj: any = {};
        for (const key in obj) {
            newObj[key] = convertDatesToTimestamps(obj[key]);
        }
        return newObj;
    }
    return obj;
}

export class MockFirestore {
    data: any = {};

    constructor() {
        this.data = {};
    }

    collection(name: string) {
        if (!this.data[name]) this.data[name] = {};
        return new MockCollection(this.data[name]);
    }

    batch() {
        return {
            set: (ref: any, data: any) => ref.set(data),
            update: (ref: any, data: any) => ref.update(data),
            delete: (ref: any) => ref.delete(),
            commit: async () => {},
        };
    }

    getAll(...refs: any[]) {
        return Promise.all(refs.map(ref => ref.get()));
    }
}

class MockCollection {
    constructor(private data: any) {}

    doc(id: string) {
        return new MockDoc(this.data, id);
    }

    where(field: string, op: string, value: any) {
        return new MockQuery(this.data, [{ field, op, value }]);
    }

    orderBy() { return new MockQuery(this.data, []); }
    limit(n: number) { return new MockQuery(this.data, [], n); }

    async get() {
        const docs = Object.keys(this.data).map(key => ({
            id: key,
            exists: true,
            data: () => this.data[key],
            ref: { delete: async () => { delete this.data[key]; } }
        }));
        return { empty: docs.length === 0, docs };
    }

    async add(data: any) {
        const id = Math.random().toString(36).substring(7);
        this.data[id] = convertDatesToTimestamps(data);
        return { id };
    }
}

class MockQuery {
    constructor(private data: any, private filters: any[], private limitCount?: number) {}

    where(field: string, op: string, value: any) {
        this.filters.push({ field, op, value });
        return this;
    }

    orderBy() { return this; }
    limit(n: number) {
        this.limitCount = n;
        return this;
    }

    async get() {
        let docs = Object.keys(this.data).map(key => ({
            id: key,
            exists: true,
            data: () => this.data[key],
            ref: { delete: async () => { delete this.data[key]; } }
        }));

        for (const filter of this.filters) {
            docs = docs.filter(doc => {
                const d = doc.data();
                if (!d) return false;

                // Handle Timestamp comparison if value is Date
                let val = d[filter.field];
                let filterVal = filter.value;

                if (val instanceof MockTimestamp) val = val.toDate().getTime();
                if (filterVal instanceof Date) filterVal = filterVal.getTime();

                if (filter.op === '==') return val === filterVal;
                if (filter.op === 'array-contains') return Array.isArray(val) && val.includes(filterVal);
                return true;
            });
        }

        if (this.limitCount !== undefined) {
            docs = docs.slice(0, this.limitCount);
        }

        return { empty: docs.length === 0, docs };
    }
}

class MockDoc {
    constructor(private data: any, private id: string) {}

    async get() {
        const d = this.data[this.id];
        return {
            exists: !!d,
            data: () => d,
            id: this.id,
            ref: this
        };
    }

    async set(data: any) {
        this.data[this.id] = convertDatesToTimestamps(data);
    }

    async update(data: any) {
        if (this.data[this.id]) {
            this.data[this.id] = { ...this.data[this.id], ...convertDatesToTimestamps(data) };
        }
    }

    async delete() {
        delete this.data[this.id];
    }
}
