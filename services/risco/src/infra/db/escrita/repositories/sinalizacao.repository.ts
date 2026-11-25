import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere } from 'typeorm';

import {
  FiltroSinalizacoes,
  Pagina,
  RepositorioSinalizacoes,
  ResultadoDaMudanca,
  Sinalizacao,
} from '@domain/sinalizacao';
import { BANCO_ESCRITA } from '@infra/db/conn/data-source';

import { SinalizacaoSchema } from './sinalizacao.schema';

@Injectable()
export class RepositorioSinalizacoesTypeorm implements RepositorioSinalizacoes {
  constructor(@InjectDataSource(BANCO_ESCRITA) private readonly escrita: DataSource) {}

  async listar(filtro: FiltroSinalizacoes): Promise<Pagina<Sinalizacao>> {
    const where: FindOptionsWhere<Sinalizacao> = {};
    if (filtro.estado) where.estado = filtro.estado;
    if (filtro.regiaoId) where.regiaoId = filtro.regiaoId;
    if (filtro.origem) where.origem = filtro.origem;

    const [itens, total] = await this.escrita.getRepository(SinalizacaoSchema).findAndCount({
      where,
      order: { emitidaEm: 'DESC' },
      skip: (filtro.pagina - 1) * filtro.tamanho,
      take: filtro.tamanho,
    });
    return { itens, pagina: filtro.pagina, tamanho: filtro.tamanho, total };
  }

  obter(id: string): Promise<Sinalizacao | null> {
    return this.escrita.getRepository(SinalizacaoSchema).findOneBy({ id });
  }

  alterar(
    id: string,
    mudanca: (atual: Sinalizacao) => ResultadoDaMudanca,
  ): Promise<Sinalizacao | null> {
    // Uma transação só: se o INSERT na outbox falhar, a mudança de estado
    // também é desfeita, e vice-versa. Isso evita o dual write.
    return this.escrita.transaction(async (m) => {
      const atual = await m.getRepository(SinalizacaoSchema).findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!atual) return null;

      const { sinalizacao, eventos } = mudanca(atual);
      await m.getRepository(SinalizacaoSchema).save(sinalizacao);
      for (const evento of eventos) {
        await m.query(
          'INSERT INTO outbox (id, routing_key, payload) VALUES ($1, $2, $3)',
          [evento.envelope.id, evento.routingKey, JSON.stringify(evento.envelope)],
        );
      }
      return sinalizacao;
    });
  }
}
