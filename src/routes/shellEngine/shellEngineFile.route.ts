import { Router, Request, Response } from 'express';
import fileUpload from 'express-fileupload';
import { lookup } from 'mime-types';
import path from 'path';
import fs from 'fs/promises';

import envKeys from '../../config/envKeys';
import middlewareShellEngineKey from '../../middleware/middlewareVerifyToken';

const MAX_LOCAL_FILE_BYTES = 50 * 1024 * 1024;

const REQUIRED_FILE_PATH_SEGMENT = 'ai-notes-xyz-shell-files';

function shellEngineDataRoot(): string {
    return envKeys.FILE_STORAGE_PATH;
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

function fileRelativePathMustIncludeShellSegment(
    relativePath: string,
): { ok: true } | { ok: false; message: string } {
    const segments = relativePath.split(/[/\\]/).filter((s) => s.length > 0);
    if (!segments.includes(REQUIRED_FILE_PATH_SEGMENT)) {
        return {
            ok: false,
            message: `relativePath must include the "${REQUIRED_FILE_PATH_SEGMENT}/" path segment`,
        };
    }
    return { ok: true };
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

router.use(
    fileUpload({
        limits: { fileSize: MAX_LOCAL_FILE_BYTES },
        abortOnLimit: true,
    }),
);

router.post('/write', middlewareShellEngineKey, async (req: Request, res: Response) => {
    try {
        const rel = sanitizeRelativePath(req.body?.relativePath as string);
        if (!rel.ok) {
            return res.status(400).json({ message: rel.message });
        }
        const segmentOk = fileRelativePathMustIncludeShellSegment(rel.value);
        if (!segmentOk.ok) {
            return res.status(400).json({ message: segmentOk.message });
        }
        const resolved = resolveUnderSandbox(rel.value);
        if (!resolved.ok) {
            return res.status(400).json({ message: resolved.message });
        }
        if (!req.files || Object.keys(req.files).length === 0) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
        const file = req.files.file as fileUpload.UploadedFile;
        if (Array.isArray(file)) {
            return res.status(400).json({ message: 'Only one file can be uploaded at a time' });
        }
        await fs.mkdir(path.dirname(resolved.abs), { recursive: true });
        await fs.writeFile(resolved.abs, file.data);
        const relativePath = rel.value.split(/[/\\]/).join('/');
        const absolutePath = path.resolve(resolved.abs);
        return res.status(201).json({
            message: `File written: ${relativePath}`,
            relativePath,
            absolutePath,
            size: file.size,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Server error' });
    }
});

router.get('/read', middlewareShellEngineKey, async (req: Request, res: Response) => {
    try {
        const rel = sanitizeRelativePath(req.query.relativePath as string);
        if (!rel.ok) {
            return res.status(400).json({ message: rel.message });
        }
        const segmentOk = fileRelativePathMustIncludeShellSegment(rel.value);
        if (!segmentOk.ok) {
            return res.status(400).json({ message: segmentOk.message });
        }
        const resolved = resolveUnderSandbox(rel.value);
        if (!resolved.ok) {
            return res.status(400).json({ message: resolved.message });
        }
        const data = await fs.readFile(resolved.abs);
        const contentType = lookup(resolved.abs) || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename="${path.basename(resolved.abs)}"`);
        return res.send(data);
    } catch (err: unknown) {
        if (err && typeof err === 'object' && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
            return res.status(404).json({ message: 'File not found' });
        }
        console.error(err);
        return res.status(500).json({ message: 'Server error' });
    }
});

export default router;
