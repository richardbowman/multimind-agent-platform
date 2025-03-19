import Logger from '../helpers/logger';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

export interface CSVContents {
    metadata: Record<string, any>;
    rows: Record<string, any>[];
}

export class CSVUtils {
    static getSheet(csvContent: string) : Record<string, any> {
        try {
            const sheet = parse(csvContent, {
                columns: true,
                skip_empty_lines: true,
                trim: true,
                relax_quotes: true,
                relax_column_count: true,
                bom: true
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

    static async fromCSV(csvContents: string) : Promise<CSVContents> {
        // Read current processed CSV
        const rows: any[] = [];
        const parser = parse(csvContents.toString(), {
            columns: true,
            skip_empty_lines: true,
            trim: true,
            relax_quotes: true,
            relax_column_count: true,
            bom: true
        });
        for await (const record of parser) {
            rows.push(record);
        }
        const csv : CSVContents = {
            metadata: {},
            rows
        }
        return csv;
    }

    static getColumnHeadersFromData(csv: CSVContents) : string[] {
        // Collect all unique column names from all rows
        const allColumns = new Set<string>();
        for (const row of csv.rows) {
            Object.keys(row).forEach(col => allColumns.add(col));
        }
        return [...allColumns];        
    }

    static async toCSV(csv: CSVContents, headers?: string[]) : Promise<string> {
        const allColumns = headers || this.getColumnHeadersFromData(csv);

        // Update the processed artifact with all columns
        const stringifier = stringify(csv.rows, { 
            header: true,
            columns: Array.from(allColumns) // Explicitly specify all columns
        });
        
        // Collect the stream output
        const fullOutput: string[] = [];
        for await (const chunk of stringifier) {
            fullOutput.push(chunk);
        }

        return fullOutput.join("");
    }
}
