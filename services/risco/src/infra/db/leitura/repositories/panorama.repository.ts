import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import {
  DocumentoPanorama,
  FiltroPanoramas,
  Panorama,
  RepositorioPanoramas,
  ResultadoDaProjecao,
} from '@domain/panorama';
import { NIVEIS_POR_GRAVIDADE, Pagina } from '@domain/sinalizacao';
import { BANCO_LEITURA } from '@infra/db/conn/data-source';

import { PanoramaSchema } from './panorama.schema';

// ALTA_ATENCAO = 0, ATENCAO = 1, OBSERVACAO = 2, NORMAL = 3.
const ORDEM_DO_NIVEL = `CASE p.nivel_atencao ${NIVEIS_POR_GRAVIDADE.map(
  (nivel, i) => `WHEN '${nivel}' THEN ${i}`,
).join(' ')} END`;

@Injectable()
export class RepositorioPanoramasTypeorm implements RepositorioPanoramas {
  constructor(@InjectDataSource(BANCO_LEITURA) private readonly leitura: DataSource) {}

  async listar(filtro: FiltroPanoramas): Promise<Pagina<Panorama>> {
    const consulta = this.leitura
      .getRepository(PanoramaSchema)
      .createQueryBuilder('p')
      .orderBy(ORDEM_DO_NIVEL, 'ASC')
      .addOrderBy('p.regiao_nome', 'ASC')
      .skip((filtro.pagina - 1) * filtro.tamanho)
      .take(filtro.tamanho);
    if (filtro.municipio) consulta.where('p.municipio = :municipio', { municipio: filtro.municipio });

    const [itens, total] = await consulta.getManyAndCount();
    return { itens, pagina: filtro.pagina, tamanho: filtro.tamanho, total };
  }

  obter(regiaoId: string): Promise<Panorama | null> {
    return this.leitura.getRepository(PanoramaSchema).findOneBy({ regiaoId });
  }

  projetar(
    evento: { id: string; tipo: string },
    regiaoId: string,
    mudanca: (documento: DocumentoPanorama) => DocumentoPanorama,
  ): Promise<{ resultado: ResultadoDaProjecao; versao?: number }> {
    return this.leitura.transaction(async (m) => {
      // Idempotência: se o id já está na tabela, o evento já foi aplicado.
      const novos: unknown[] = await m.query(
        `INSERT INTO mensagens_processadas (id, tipo) VALUES ($1, $2)
         ON CONFLICT (id) DO NOTHING RETURNING id`,
        [evento.id, evento.tipo],
      );
      if (novos.length === 0) return { resultado: 'repetido' as const };

      const linhas: { documento: DocumentoPanorama }[] = await m.query(
        'SELECT documento FROM panorama_regiao WHERE regiao_id = $1 FOR UPDATE',
        [regiaoId],
      );
      if (linhas.length === 0) return { resultado: 'sem-panorama' as const };

      // Em UPDATE ... RETURNING, o TypeORM devolve [linhas, quantidade].
      const [atualizadas]: [{ versao: string }[], number] = await m.query(
        `UPDATE panorama_regiao
            SET documento = $2, versao = versao + 1, atualizado_em = now()
          WHERE regiao_id = $1
        RETURNING versao`,
        [regiaoId, JSON.stringify(mudanca(linhas[0].documento))],
      );
      return { resultado: 'aplicado' as const, versao: Number(atualizadas[0].versao) };
    });
  }
}
