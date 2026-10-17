import { messagesFor, useLangStore } from '../i18n';

/** Generous: a large workspace backup is well under 5 MB. */
const MAX_IMPORT_BYTES = 50_000_000;
/** What the server's body limit lets through (25 MiB), rounded down to a figure people can read. */
const SERVER_MAX_BYTES = 25 * 1_000_000;

export function downloadText(filename: string, text: string, type: string): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export const downloadJson = (filename: string, data: unknown): void => downloadText(filename, JSON.stringify(data, null, 2), 'application/json');

export async function readJsonFile(file: File): Promise<{ ok: true; value: unknown } | { ok: false; message: string }> {
  const mb = Math.round(file.size / 1_000_000);
  // A file the server would refuse is stopped here, with its limit named, instead of failing after the upload.
  if (import.meta.env.VITE_GLASSHOUSE_SERVER === '1' && file.size > SERVER_MAX_BYTES) {
    return { ok: false, message: messagesFor(useLangStore.getState().lang).common.fileTooBigForServer(mb, SERVER_MAX_BYTES / 1_000_000) };
  }
  if (file.size > MAX_IMPORT_BYTES) return { ok: false, message: `This file is ${Math.round(file.size / 1_000_000)} MB. Glasshouse files are far smaller, so it isn't one.` };
  let text: string;
  try {
    text = await file.text();
  } catch (e) {
    return { ok: false, message: `Couldn't read the file: ${e instanceof Error ? e.message : String(e)}` };
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, message: "This file isn't valid JSON." };
  }
}

export const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'glasshouse';
