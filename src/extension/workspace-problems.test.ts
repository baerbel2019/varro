/* oxlint-disable anti-slop/no-module-mocking, anti-slop/require-safety-comment-for-type-assertion -- These fixtures model the VS Code diagnostics boundary. */
import { beforeEach, expect, it, vi } from 'vitest';
import { DiagnosticSeverity } from 'vscode';
import type { Diagnostic, Uri } from 'vscode';

const mocks = vi.hoisted(() => ({
  enabled: true,
  getDiagnostics: vi.fn<() => Array<[Uri, Diagnostic[]]>>(() => []),
}));
vi.mock('vscode', () => ({
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  languages: { getDiagnostics: mocks.getDiagnostics },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/repo' } }, { uri: { fsPath: '/sibling' } }],
    getWorkspaceFolder: (uri: Uri) =>
      uri.fsPath.startsWith('/repo/')
        ? { uri: { fsPath: '/repo' } }
        : uri.fsPath.startsWith('/sibling/')
          ? { uri: { fsPath: '/sibling' } }
          : undefined,
    getConfiguration: () => ({ get: () => mocks.enabled }),
  },
}));
import { getWorkspaceProblems } from './workspace-problems';

beforeEach(() => {
  mocks.enabled = true;
  mocks.getDiagnostics.mockReset();
});

const diagnostic = (severity: DiagnosticSeverity): Diagnostic =>
  ({
    severity,
    message: 'Problem detail',
    source: 'ts',
    code: 2307,
    range: { start: { line: 1, character: 2 }, end: { line: 1, character: 9 } },
  }) as Diagnostic;

it('collects all current-workspace errors and warnings, excluding other roots and external files', () => {
  mocks.getDiagnostics.mockReturnValue([
    [
      { fsPath: '/repo/a.ts' } as Uri,
      Array.from({ length: 25 }, () => diagnostic(DiagnosticSeverity.Error)),
    ],
    [
      { fsPath: '/repo/b.ts' } as Uri,
      [diagnostic(DiagnosticSeverity.Warning), diagnostic(DiagnosticSeverity.Information)],
    ],
    [{ fsPath: '/sibling/c.ts' } as Uri, [diagnostic(DiagnosticSeverity.Error)]],
    [{ fsPath: '/outside/d.ts' } as Uri, [diagnostic(DiagnosticSeverity.Error)]],
  ]);
  const snapshot = getWorkspaceProblems('/repo');
  expect(snapshot.total).toBe(26);
  expect(new Set(snapshot.diagnostics.map((item) => item.path))).toEqual(
    new Set(['/repo/a.ts', '/repo/b.ts'])
  );
  expect(snapshot.diagnostics[0]).toMatchObject({ line: 2, column: 3, source: 'ts', code: 2307 });
});

it('requires an open workspace and respects the integration opt-out', () => {
  expect(() => getWorkspaceProblems('/outside')).toThrow('Select an open workspace');
  mocks.enabled = false;
  expect(() => getWorkspaceProblems('/repo')).toThrow('disabled in settings');
  expect(mocks.getDiagnostics).not.toHaveBeenCalled();
});
