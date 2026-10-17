import { sampleProjectFiles, type Result, type Workspace, type WorkspaceCommand } from '@glasshouse/domain';

/**
 * What "Load sample" dispatches. A server workspace is replayed by many copies of apply(), so it gets
 * the projects already built (fixed IDs) as plain imports; a browser-local one lets apply() build them.
 */
export function sampleCommands(ws: Workspace, at: string, serverMode: boolean): Result<WorkspaceCommand[]> {
  if (!serverMode) return { ok: true, value: [{ type: 'sample/load', at }] };
  const files = sampleProjectFiles(ws, at);
  if (!files.ok) return files;
  return { ok: true, value: files.value.map((file) => ({ type: 'project/import', file, resolution: { mode: 'merge', takeIncoming: [] } })) };
}
