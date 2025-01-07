import* as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import Logger from 'src/helpers/logger';

export async function saveToFile(projectId: string, contentType: string, contentId: string, content: string): Promise<string> {
    // const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const filePath = path.join(__dirname, `../../.output/${projectId}/${contentType}`, `${contentId}.md`);
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