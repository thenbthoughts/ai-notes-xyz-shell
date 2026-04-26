import { Router, Request, Response } from 'express';

import routesShellEngineShell from './shellEngine/shellEngineShell.route';
import routesShellEngineFile from './shellEngine/shellEngineFile.route';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
    return res.send('Welcome to ai notes shell engine.');
});

// shell engine: shell and file ops are separate mounts (requires API_TOKEN)
router.use('/shell-engine/run-shell', routesShellEngineShell);
router.use('/shell-engine/file', routesShellEngineFile);

export default router;
