/**
 * Represents data for a bar chart visualization
 */
export interface BarChartData {
    /**
     * Title of the chart
     */
    title: string;
    
    /**
     * X-axis configuration
     */
    xAxis: {
        /**
         * Label for the x-axis
         */
        label: string;
        
        /**
         * Categories/labels for each bar
         */
        categories: string[];
    };
    
    /**
     * Y-axis configuration
     */
    yAxis: {
        /**
         * Label for the y-axis
         */
        label: string;
        
        /**
         * Minimum value for y-axis (optional)
         */
        min?: number;
        
        /**
         * Maximum value for y-axis (optional)
         */
        max?: number;
    };
    
    /**
     * Array of data series
     */
    series: {
        /**
         * Name of the data series
         */
        name: string;
        
        /**
         * Array of values for each category
         */
        data: number[];
        
        /**
         * Color for this series (optional)
         */
        color?: string;
    }[];
    
    /**
     * Optional styling configuration
     */
    style?: {
        /**
         * Chart width in pixels
         */
        width?: number;
        
        /**
         * Chart height in pixels
         */
        height?: number;
        
        /**
         * Background color
         */
        backgroundColor?: string;
    };
    
    /**
     * Optional metadata
     */
    metadata?: {
        /**
         * Source of the data
         */
        source?: string;
        
        /**
         * Timestamp of when data was generated
         */
        generatedAt?: Date;
    };
}
