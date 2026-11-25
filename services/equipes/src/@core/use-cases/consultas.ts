import { Inject, Injectable } from '@nestjs/common';

import {
  Disponibilidade,
  Equipe,
  Especialidade,
  REPOSITORIO_EQUIPES,
  RepositorioEquipes,
  montarDisponibilidade,
} from '@domain/equipe';

@Injectable()
export class ListarEquipes {
  constructor(@Inject(REPOSITORIO_EQUIPES) private readonly equipes: RepositorioEquipes) {}

  executar(especialidade?: Especialidade): Promise<Equipe[]> {
    return this.equipes.listar(especialidade);
  }
}

@Injectable()
export class ConsultarDisponibilidade {
  constructor(@Inject(REPOSITORIO_EQUIPES) private readonly equipes: RepositorioEquipes) {}

  async executar(data: string, especialidade?: Especialidade): Promise<Disponibilidade[]> {
    const [equipes, reservas] = await Promise.all([
      this.equipes.listar(especialidade),
      this.equipes.reservasNaData(data),
    ]);
    return montarDisponibilidade(equipes, reservas, data);
  }
}
