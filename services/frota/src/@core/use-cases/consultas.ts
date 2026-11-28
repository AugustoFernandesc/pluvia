import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

import {
  Categoria,
  Disponibilidade,
  Manutencao,
  ManutencaoInvalida,
  REPOSITORIO_FROTA,
  Recurso,
  RecursoNaoEncontrado,
  RepositorioFrota,
  janelaDoTurno,
  montarDisponibilidade,
} from '@domain/frota';

@Injectable()
export class ListarRecursos {
  constructor(@Inject(REPOSITORIO_FROTA) private readonly frota: RepositorioFrota) {}

  executar(categoria?: Categoria): Promise<Recurso[]> {
    return this.frota.listar(categoria);
  }
}

@Injectable()
export class ConsultarDisponibilidade {
  constructor(@Inject(REPOSITORIO_FROTA) private readonly frota: RepositorioFrota) {}

  async executar(data: string, categoria?: Categoria): Promise<Disponibilidade[]> {
    const dia = { inicio: janelaDoTurno(data, 'MANHA').inicio, fim: janelaDoTurno(data, 'NOITE').fim };
    const [recursos, reservas, manutencoes] = await Promise.all([
      this.frota.listar(categoria),
      this.frota.reservasNaData(data),
      this.frota.manutencoesNoPeriodo(dia.inicio, dia.fim),
    ]);
    return montarDisponibilidade(recursos, reservas, manutencoes, data);
  }
}

export interface NovaManutencao {
  inicio: string;
  fim: string;
  motivo: string;
}

@Injectable()
export class RegistrarManutencao {
  constructor(@Inject(REPOSITORIO_FROTA) private readonly frota: RepositorioFrota) {}

  async executar(recursoId: string, nova: NovaManutencao): Promise<Manutencao> {
    if (!(await this.frota.obter(recursoId))) throw new RecursoNaoEncontrado(recursoId);
    if (Date.parse(nova.inicio) >= Date.parse(nova.fim)) {
      throw new ManutencaoInvalida('inicio deve ser anterior a fim.');
    }
    const manutencao: Manutencao = {
      id: randomUUID(),
      recursoId,
      inicio: new Date(nova.inicio).toISOString(),
      fim: new Date(nova.fim).toISOString(),
      motivo: nova.motivo,
    };
    await this.frota.registrarManutencao(manutencao);
    return manutencao;
  }
}
