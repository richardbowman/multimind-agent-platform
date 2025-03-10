import { parse } from 'csv-parse/sync';
import Logger from '../helpers/logger';

export class CSVUtils {
    static getSheet(csvContent: string) : Record<string, any> {
        try {
            const sheet = parse(csvContent, {
                columns: true,
                skip_empty_lines: true,
                trim: true,
                relax_quotes: true,
                relax_column_count: true,
                bom: true,
                to_line: 1
            });
            return sheet;
        } catch (error) {
            Logger.error('Error reading CSV', error);
            return [];
        }
    }

    
    /**
     * Extracts column headers from CSV content
     * @param csvContent The CSV content as a string
     * @returns Array of column headers
     */
    static getColumnHeaders(csvContent: string): string[] {
        try {
            const firstRow = parse(csvContent, {
                skip_empty_lines: true,
                trim: true,
                relax_quotes: true,
                relax_column_count: true,
                bom: true,
                to_line: 1
            })[0];
            return firstRow;
        } catch (error) {
            Logger.error('Error reading CSV headers:', error);
            return [];
        }
    }
}
