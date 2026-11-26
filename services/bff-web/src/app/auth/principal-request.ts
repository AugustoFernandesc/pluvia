import { Request } from 'express';

import { PrincipalJwt } from './jwt-verifier.service';

export type RequestComPrincipal = Request & { user?: PrincipalJwt };
