import { Router, Request, Response } from 'express';

import middlewareShellEngineKey from '../../middleware/middlewareVerifyToken';

const router = Router();

router.get('/', (req: Request, res: Response) => {
    return res.json({ app: 'ai-notes-xyz-shell' });
});

router.get('/private', middlewareShellEngineKey, (req: Request, res: Response) => {
    return res.json({ app: 'ai-notes-xyz-shell', validateToken: true });
});

export default router;
