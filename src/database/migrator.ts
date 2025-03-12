import { Sequelize } from 'sequelize';
import * as path from 'path';
import * as fs from 'fs/promises';
import Logger from '../helpers/logger';

export class DatabaseMigrator {
    private sequelize: Sequelize;
    private migrationsDir: string;

    constructor(sequelize: Sequelize, migrationsDir: string) {
        this.sequelize = sequelize;
        this.migrationsDir = migrationsDir;
    }

    async migrate() {
        // Ensure migrations directory exists
        await fs.mkdir(this.migrationsDir, { recursive: true });

        // Get applied migrations
        const [results] = await this.sequelize.query(
            "SELECT name FROM SequelizeMeta"
        );
        const appliedMigrations = new Set(
            results.map((row: any) => row.name)
        );

        // Get available migrations
        const migrationFiles = await fs.readdir(this.migrationsDir);
        const pendingMigrations = migrationFiles
            .filter(file => file.endsWith('.js') || file.endsWith('.ts'))
            .filter(file => !appliedMigrations.has(file.replace(/\.(js|ts)$/, '')));

        // Execute pending migrations in order
        for (const migrationFile of pendingMigrations) {
            try {
                Logger.info(`Applying migration: ${migrationFile}`);
                const migrationPath = path.join(this.migrationsDir, migrationFile);
                const migration = require(migrationPath);
                
                if (typeof migration.up === 'function') {
                    await migration.up(this.sequelize.getQueryInterface(), Sequelize);
                    await this.sequelize.query(
                        "INSERT INTO SequelizeMeta (name) VALUES (:name)",
                        { replacements: { name: migrationFile.replace(/\.(js|ts)$/, '') } }
                    );
                    Logger.info(`Successfully applied migration: ${migrationFile}`);
                }
            } catch (error) {
                Logger.error(`Failed to apply migration ${migrationFile}:`, error);
                throw error;
            }
        }
    }
}
