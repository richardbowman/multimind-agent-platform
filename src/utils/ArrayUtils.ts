import { FilterCriteria, FilterOperator } from '../types/FilterCriteria';

export namespace ArrayUtils {
    export function deduplicateById<T extends { id: any }>(array: T[]): T[] {
        const seenIds = new Set();
        const filtered = array.filter(item => {
            if (seenIds.has(item.id)) {
                return false;
            }
            seenIds.add(item.id);
            return true;
        });
    }

    export function isDefined(item: any) {
        return item !== undefined && item !== null;
    }

    type FilterOperatorMap = {
        [key in FilterOperator]?: FilterCriteria[keyof FilterCriteria]
    };

    export function filter<T extends Record<string, any>, U = T>(
        array: T[], 
        filter: FilterCriteria & { [key: string]: any },
        mapper?: (item: T) => U
    ): T[] {
        return array.filter(item => {
            return Object.entries(filter).every(([key, filterValue]) => {
                const mappedItem = mapper ? mapper(item) : item;
                const itemValue = key.split('.').reduce((obj, k) => obj?.[k], mappedItem);
                
                // Handle logical operators ($and, $or, $nor)
                if (key === '$and') {
                    return Array.isArray(filterValue) && 
                        filterValue.every((f: any) => this.filter([item], f).length > 0);
                }
                if (key === '$or') {
                    return Array.isArray(filterValue) && 
                        filterValue.some((f: any) => this.filter([item], f).length > 0);
                }
                if (key === '$nor') {
                    return Array.isArray(filterValue) && 
                        filterValue.every((f: any) => this.filter([item], f).length === 0);
                }
                if (key === '$not') {
                    return this.filter([item], filterValue).length === 0;
                }

                // Handle comparison operators
                if (typeof filterValue === 'object' && filterValue !== null && !Array.isArray(filterValue) && !(filterValue instanceof Date)) {
                    const operatorMap = filterValue as FilterOperatorMap;
                    return Object.entries(operatorMap).every(([operator, value]) => {
                        if (value === undefined) return false;
                        
                        switch (operator) {
                            case '$eq': return itemValue === value;
                            case '$ne': return itemValue !== value;
                            case '$gt': return itemValue > value;
                            case '$gte': return itemValue >= value;
                            case '$lt': return itemValue < value;
                            case '$lte': return itemValue <= value;
                            case '$in': return Array.isArray(value) && value.includes(itemValue);
                            case '$nin': return Array.isArray(value) && !value.includes(itemValue);
                            case '$exists': return value ? itemValue !== undefined : itemValue === undefined;
                            case '$regex': {
                                const regex = typeof value === 'string' ? new RegExp(value) : value;
                                return typeof itemValue === 'string' && regex.test(itemValue);
                            }
                            case '$all': 
                                return Array.isArray(itemValue) && 
                                    Array.isArray(value) &&
                                    value.every(v => itemValue.includes(v));
                            case '$elemMatch':
                                return Array.isArray(itemValue) && 
                                    itemValue.some(v => this.filter([v], value).length > 0);
                            default: return false;
                        }
                    });
                }

                // Handle simple equality
                if (Array.isArray(filterValue)) {
                    return filterValue.includes(itemValue);
                }
                return itemValue === filterValue;
            });
        });
    }
}

Array.prototype.defined = function() {
    return this.filter(ArrayUtils.isDefined);
}
