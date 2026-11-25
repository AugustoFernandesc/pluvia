import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseFilters,
} from '@nestjs/common';

import { ProblemaFilter } from '@app/problema.filter';
import { Pagina, Regiao } from '@domain/regiao';
import { ListarRegioes, ObterRegiao } from '@use-cases/regioes';

const TAMANHO_PADRAO = 20;
const TAMANHO_MAXIMO = 100;

function inteiro(valor: string | undefined, nome: string, padrao: number, maximo?: number): number {
  if (valor === undefined) return padrao;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 1 || (maximo !== undefined && numero > maximo)) {
    const limite = maximo ? ` e ${maximo}` : '';
    throw new BadRequestException(`${nome} deve ser um inteiro entre 1${limite}.`);
  }
  return numero;
}

@Controller('regioes')
@UseFilters(ProblemaFilter)
export class RegioesController {
  constructor(
    private readonly listarRegioes: ListarRegioes,
    private readonly obterRegiao: ObterRegiao,
  ) {}

  @Get()
  listar(
    @Query('municipio') municipio?: string,
    @Query('uf') uf?: string,
    @Query('pagina') pagina?: string,
    @Query('tamanho') tamanho?: string,
  ): Promise<Pagina<Regiao>> {
    if (uf !== undefined && uf.length !== 2) {
      throw new BadRequestException('uf deve ter 2 letras.');
    }
    return this.listarRegioes.executar({
      municipio,
      uf,
      pagina: inteiro(pagina, 'pagina', 1),
      tamanho: inteiro(tamanho, 'tamanho', TAMANHO_PADRAO, TAMANHO_MAXIMO),
    });
  }

  @Get(':regiaoId')
  obter(@Param('regiaoId', new ParseUUIDPipe()) regiaoId: string): Promise<Regiao> {
    return this.obterRegiao.executar(regiaoId);
  }
}
