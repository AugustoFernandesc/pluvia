import { BadRequestException, Controller, Get, Query, UseFilters } from '@nestjs/common';

import { ProblemaFilter } from '@app/problema.filter';
import { Disponibilidade, Equipe, Especialidade, ehData, ehEspecialidade } from '@domain/equipe';
import { ConsultarDisponibilidade, ListarEquipes } from '@use-cases/consultas';

function lerEspecialidade(valor?: string): Especialidade | undefined {
  if (valor === undefined) return undefined;
  if (!ehEspecialidade(valor)) throw new BadRequestException('especialidade inválida.');
  return valor;
}

@Controller()
@UseFilters(ProblemaFilter)
export class EquipesController {
  constructor(
    private readonly listarEquipes: ListarEquipes,
    private readonly consultarDisponibilidade: ConsultarDisponibilidade,
  ) {}

  @Get('equipes')
  listar(@Query('especialidade') especialidade?: string): Promise<Equipe[]> {
    return this.listarEquipes.executar(lerEspecialidade(especialidade));
  }

  @Get('disponibilidade')
  disponibilidade(
    @Query('data') data?: string,
    @Query('especialidade') especialidade?: string,
  ): Promise<Disponibilidade[]> {
    if (!ehData(data)) throw new BadRequestException('data é obrigatória, no formato AAAA-MM-DD.');
    return this.consultarDisponibilidade.executar(data, lerEspecialidade(especialidade));
  }
}
