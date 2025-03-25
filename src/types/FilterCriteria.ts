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
    | number[]
    | { [key: string]: string | number }; // Allow enum-like objects

export type FilterCriteria = {
    [key: string]: FilterValue | { [operator in FilterOperator]?: FilterValue } | FilterCriteria | undefined;
} & {
    $and?: FilterCriteria[];
    $or?: FilterCriteria[];
    $nor?: FilterCriteria[];
    $not?: FilterCriteria;
};
