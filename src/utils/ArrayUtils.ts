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
        return item !== undefined && item !== null;
    }

    export function filter(array: arr) {
        // Match other metadata keys
      const metadataMatch = Object.keys(filter)
      .filter(key => key !== 'type' && key !== 'subtype')
      .every(key => {
        const filterValue = filter[key];
        const metadataValue = artifact.metadata?.[key];
        
        // Handle array values with $in operator
        if (Array.isArray(filterValue)) {
          return filterValue.includes(metadataValue);
        }
        
        // Handle object operators like $eq, $gt, etc.
        if (typeof filterValue === 'object' && filterValue !== null) {
          return Object.entries(filterValue).every(([operator, value]) => {
            switch (operator) {
              case '$eq': return metadataValue === value;
              case '$ne': return metadataValue !== value;
              case '$gt': return metadataValue > value;
              case '$gte': return metadataValue >= value;
              case '$lt': return metadataValue < value;
              case '$lte': return metadataValue <= value;
              case '$in': return Array.isArray(value) && value.includes(metadataValue);
              case '$nin': return Array.isArray(value) && !value.includes(metadataValue);
              case '$exists': return value ? metadataValue !== undefined : metadataValue === undefined;
              default: return false;
            }
          });
        }
        
        // Simple equality match
        return metadataValue === filterValue;
      });
    }
}

Array.prototype.defined = function() {
    return this.filter(ArrayUtils.isDefined);
}