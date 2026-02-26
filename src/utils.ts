import { writeFile, mkdir } from 'node:fs/promises';

export function sanitizeFilename(name: string): string {
  let safe = name.replace(/[^\w\-.]/g, '_');
  safe = safe.replace(/^[.\s]+|[.\s]+$/g, '');
  if (safe.length > 255) {
    safe = safe.slice(0, 255);
  }
  return safe;
}

export async function writeOutput(
  content: string,
  filePath?: string,
): Promise<void> {
  if (filePath) {
    await writeFile(filePath, content, 'utf-8');
  } else {
    process.stdout.write(content);
  }
}

export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}
