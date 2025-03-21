export type FilterOperator = 
    | '$eq' 
    | '$ne' 
    | '$gt' 
    | '$gte' 
    | '$lt' 
    | '$lte' 
    | '$in' 
    | '$nin' 
    | '$exists' 
    | '$regex';

export type FilterValue = 
    | string 
    | number 
    | boolean 
    | Date 
    | null 
    | string[] 
    | number[];

export interface FilterCriteria {
    [key: string]: FilterValue | { [operator in FilterOperator]?: FilterValue } | FilterCriteria[];
    $and?: FilterCriteria[];
    $or?: FilterCriteria[];
    $nor?: FilterCriteria[];
    $not?: FilterCriteria;
}
