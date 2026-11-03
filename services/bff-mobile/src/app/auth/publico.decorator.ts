import { SetMetadata } from '@nestjs/common';

export const ROTA_PUBLICA = 'pluvia.rota-publica';
export const Publico = () => SetMetadata(ROTA_PUBLICA, true);
