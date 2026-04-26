import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

import envKeys from '../../config/envKeys';
import middlewareShellEngineKey from '../../middleware/middlewareVerifyToken';

const DEFAULT_SHELL_TIMEOUT_MS = 30_000;
const MAX_SHELL_TIMEOUT_MS = 120_000;

const REQUIRED_FILE_PATH_SEGMENT = 'ai-notes-xyz-shell-files';

function shellEngineDataRoot(): string {
    return envKeys.FILE_STORAGE_PATH;
}

function defaultShellWorkingDirectory(): string {
    return path.resolve(shellEngineDataRoot(), REQUIRED_FILE_PATH_SEGMENT);
}

function sanitizeRelativePath(
    raw: string | undefined,
): { ok: true; value: string } | { ok: false; message: string } {
    if (typeof raw !== 'string' || raw.trim() === '') {
        return { ok: false, message: 'relativePath is required' };
    }
    const normalized = path.normalize(raw.trim());
    if (path.isAbsolute(normalized)) {
        return { ok: false, message: 'relativePath must be relative' };
    }
    const segments = normalized.split(/[/\\]/).filter((s) => s.length > 0);
    if (segments.some((s) => s === '..')) {
        return { ok: false, message: 'relativePath must not contain ..' };
    }
    return { ok: true, value: normalized };
}

function resolveUnderSandbox(
    relativePath: string,
): { ok: true; abs: string } | { ok: false; message: string } {
    const base = path.resolve(shellEngineDataRoot());
    const abs = path.resolve(base, relativePath);
    const rel = path.relative(base, abs);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
        return { ok: false, message: 'Path escapes user sandbox' };
    }
    return { ok: true, abs };
}

const router = Router();
const execAsync = promisify(exec);

router.post('/execute', middlewareShellEngineKey, async (req: Request, res: Response) => {
    try {
        const command = req.body?.command;
        if (typeof command !== 'string' || command.trim() === '') {
            return res.status(400).json({ message: 'command must be a non-empty string' });
        }

        let timeoutMs = DEFAULT_SHELL_TIMEOUT_MS;
        if (req.body?.timeoutMs !== undefined) {
            const n = Number(req.body.timeoutMs);
            if (!Number.isFinite(n) || n < 1 || n > MAX_SHELL_TIMEOUT_MS) {
                return res.status(400).json({ message: `timeoutMs must be between 1 and ${MAX_SHELL_TIMEOUT_MS}` });
            }
            timeoutMs = Math.floor(n);
        }

        let cwd = defaultShellWorkingDirectory();
        if (req.body?.cwd !== undefined) {
            if (typeof req.body.cwd !== 'string') {
                return res.status(400).json({ message: 'cwd must be a string when provided' });
            }
            const rel = sanitizeRelativePath(req.body.cwd);
            if (!rel.ok) {
                return res.status(400).json({ message: rel.message });
            }
            const resolved = resolveUnderSandbox(rel.value);
            if (!resolved.ok) {
                return res.status(400).json({ message: resolved.message });
            }
            cwd = resolved.abs;
        }

        await fs.mkdir(defaultShellWorkingDirectory(), { recursive: true });

        try {
            const { stdout, stderr } = await execAsync(command, {
                cwd,
                timeout: timeoutMs,
                maxBuffer: 10 * 1024 * 1024,
                windowsHide: true,
            });
            return res.json({
                message: 'OK',
                exitCode: 0,
                stdout: stdout ?? '',
                stderr: stderr ?? '',
                timedOut: false,
            });
        } catch (err: unknown) {
            const e = err as NodeJS.ErrnoException & {
                stdout?: string;
                stderr?: string;
                code?: string | number;
                killed?: boolean;
                signal?: string;
            };
            const exitCode = typeof e.code === 'number' ? e.code : 1;
            return res.json({
                message: e.killed ? 'Command timed out' : 'OK',
                exitCode,
                stdout: e.stdout?.toString?.() ?? '',
                stderr: e.stderr?.toString?.() ?? '',
                signal: e.signal,
                timedOut: Boolean(e.killed),
            });
        }
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Server error' });
    }
});

export default router;
