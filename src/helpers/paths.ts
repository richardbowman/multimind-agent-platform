import { app } from 'electron';
import path from 'path';

export function getDataPath(): string {
    try {
        // Check if we're running in Electron
        if (process.versions['electron'] && app) {
            return app.getPath('userData');
        }
    } catch (error) {
        // Not running in Electron
    }
    // Fallback to .output in current directory
    return path.join(process.cwd(), '.output');
}
