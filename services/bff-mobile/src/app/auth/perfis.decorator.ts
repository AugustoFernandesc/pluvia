import { SetMetadata } from '@nestjs/common';

export const PERFIS_PERMITIDOS = 'pluvia.perfis-permitidos';
export type Perfil = 'GESTOR' | 'TECNICO' | 'AGENTE';
export const Perfis = (...perfis: Perfil[]) =>
  SetMetadata(PERFIS_PERMITIDOS, perfis);
