export namespace ArrayUtils {
    export function deduplicateById<T extends { id: any }>(array: T[]): T[] {
        const seenIds = new Set();
        return array.filter(item => {
            if (seenIds.has(item.id)) {
                return false;
            }
            seenIds.add(item.id);
            return true;
        });
    }

    export function isDefined(item: any) {
        return item !== undefined;
    }
}