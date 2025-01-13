import* as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import Logger from 'src/helpers/logger';
import { getDataPath } from 'src/helpers/paths';

export async function saveToFile(projectId: string, contentType: string, contentId: string, content: string): Promise<string> {
    const filePath = path.join(getDataPath(), projectId, contentType, `${contentId}.md`);
    Logger.info(`Saving to file: ${filePath}`);
    const dir = path.dirname(filePath);

    try {
        await fs.mkdir(dir, { recursive: true });
    } catch (error) {
        //ignore
        Logger.error('Error creating directory:', error);
    }

    await fs.writeFile(filePath, content);
    return filePath;
}