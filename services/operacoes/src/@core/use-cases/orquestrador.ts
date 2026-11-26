import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

import {
  Acao,
  AcaoNaoEncontrada,
  AcaoNaoProcessavel,
  NovaAcao,
  TransicaoInvalida,
  hojeEmLavras,
} from '@domain/acao';
import { Envelope, MensagemInvalida, criarEnvelope, texto } from '@domain/mensagem';
import { PRAZO_SAGA_MS, TransacaoOperacoes, UNIDADE_DE_TRABALHO, UnidadeDeTrabalho } from '@domain/portas';
import {
  Comando,
  Desfecho,
  PARTICIPANTE_DA_RESPOSTA,
  PARTICIPANTE_DO_COMANDO,
  ROTA_DO_PARTICIPANTE,
  Resposta,
  RespostaFora,
  Saga,
  aplicarResposta,
  iniciarSaga,
  vencerPrazo,
} from '@domain/saga';

const ORIGEM = 'operacoes';

function dadosDoComando(comando: Comando, acao: Acao, saga: Saga): object {
  switch (comando) {
    case 'ReservarEquipe':
      return {
        sagaId: saga.id,
        acaoId: acao.id,
        especialidade: acao.especialidade,
        equipeId: acao.equipeSolicitadaId,
        data: acao.data,
        turno: acao.turno,
      };
    case 'ReservarRecurso':
      return { sagaId: saga.id, acaoId: acao.id, categoria: acao.categoriaRecurso, data: acao.data, turno: acao.turno };
    case 'LiberarEquipe':
    case 'LiberarRecurso':
      return { sagaId: saga.id };
  }
}

function lerResposta(mensagem: Envelope): Resposta {
  const d = mensagem.dados;
  switch (mensagem.tipo) {
    case 'EquipeReservada':
      return { tipo: mensagem.tipo, equipeId: texto(d, 'equipeId') };
    case 'RecursoReservado':
      return { tipo: mensagem.tipo, recursoId: texto(d, 'recursoId') };
    case 'ReservaEquipeRecusada':
    case 'ReservaRecursoRecusada':
      return { tipo: mensagem.tipo, motivo: texto(d, 'motivo') };
    case 'EquipeLiberada':
    case 'RecursoLiberado':
      return { tipo: mensagem.tipo };
    default:
      throw new MensagemInvalida(`Tipo de resposta desconhecido: ${mensagem.tipo}.`);
  }
}

/**
 * Orquestrador da SAGA de abertura de ação preventiva. Toda mudança de estado
 * e toda mensagem que ela gera vão para o banco na mesma transação; quem leva
 * as mensagens ao RabbitMQ é o publicador da outbox.
 */
@Injectable()
export class Orquestrador {
  private readonly logger = new Logger(Orquestrador.name);

  constructor(
    @Inject(UNIDADE_DE_TRABALHO) private readonly unidade: UnidadeDeTrabalho,
    @Inject(PRAZO_SAGA_MS) private readonly prazoMs: number,
  ) {}

  /** T1: cria a ação PENDENTE, inicia a SAGA e envia ReservarEquipe. */
  async solicitar(nova: NovaAcao): Promise<Acao> {
    if (nova.data < hojeEmLavras()) {
      throw new AcaoNaoProcessavel('A data da ação não pode estar no passado.');
    }
    const agora = new Date().toISOString();
    const acao: Acao = {
      id: randomUUID(),
      regiaoId: nova.regiaoId,
      sinalizacaoId: nova.sinalizacaoId,
      tipo: nova.tipo,
      descricao: nova.descricao,
      data: nova.data,
      turno: nova.turno,
      especialidade: nova.especialidade,
      categoriaRecurso: nova.categoriaRecurso,
      equipeSolicitadaId: nova.equipeId,
      estado: 'PENDENTE',
      equipeId: null,
      recursoId: null,
      motivoRejeicao: null,
      motivoCancelamento: null,
      criadaEm: agora,
      atualizadaEm: agora,
    };
    const saga = iniciarSaga(randomUUID(), acao, this.novoPrazo());
    await this.unidade.executar(async (tx) => {
      await tx.criarAcao(acao);
      await tx.criarSaga(saga);
      await this.enviar(tx, 'ReservarEquipe', acao, saga, null, null);
    });
    this.logger.log(`Ação ${acao.id}: SAGA ${saga.id} iniciada.`);
    return acao;
  }

  /** Trata uma resposta de Equipes ou Frota vinda da fila operacoes.respostas. */
  async responder(mensagem: Envelope): Promise<void> {
    const resposta = lerResposta(mensagem);
    const sagaId = texto(mensagem.dados, 'sagaId');
    const processada = await this.unidade.processar(mensagem, async (tx) => {
      const saga = await tx.saga(sagaId);
      if (!saga) {
        this.logger.warn(`${mensagem.tipo} para SAGA desconhecida ${sagaId}, ignorada.`);
        return;
      }
      const participante = PARTICIPANTE_DA_RESPOSTA[resposta.tipo];
      let desfecho: Desfecho;
      try {
        desfecho = aplicarResposta(saga, resposta, this.novoPrazo());
      } catch (erro) {
        if (!(erro instanceof RespostaFora)) throw erro;
        this.logger.log(`SAGA ${saga.id}: ${erro.message}`);
        await tx.registrarPasso(saga.id, { mensagem: mensagem.tipo, direcao: 'RECEBIDA', participante, detalhe: erro.message });
        return;
      }
      const detalhe = 'motivo' in resposta ? resposta.motivo : null;
      await tx.registrarPasso(saga.id, { mensagem: mensagem.tipo, direcao: 'RECEBIDA', participante, detalhe });
      await tx.salvarSaga(saga);
      await this.efetuar(tx, saga, desfecho, mensagem.id);
      this.logger.log(`SAGA ${saga.id}: ${mensagem.tipo} → ${saga.estado}.`);
    });
    if (!processada) this.logger.log(`Mensagem ${mensagem.id} (${mensagem.tipo}) repetida, ignorada.`);
  }

  /** Compensa uma SAGA cujo participante não respondeu dentro do prazo. */
  async vencerPrazo(sagaId: string): Promise<void> {
    await this.unidade.executar(async (tx) => {
      const saga = await tx.saga(sagaId);
      if (!saga || !saga.prazo || Date.parse(saga.prazo) > Date.now()) return;
      let desfecho: Desfecho;
      try {
        desfecho = vencerPrazo(saga);
      } catch (erro) {
        if (erro instanceof RespostaFora) return;
        throw erro;
      }
      await tx.salvarSaga(saga);
      await this.efetuar(tx, saga, desfecho, null);
      this.logger.warn(`SAGA ${saga.id}: ${saga.motivo} Compensando.`);
    });
  }

  /** Cancelamento de ação já confirmada. Não é compensação: a SAGA já acabou. */
  async cancelar(acaoId: string, motivo: string): Promise<Acao> {
    return this.unidade.executar(async (tx) => {
      const acao = await tx.acao(acaoId);
      if (!acao) throw new AcaoNaoEncontrada(acaoId);
      if (acao.estado === 'PENDENTE') {
        throw new TransicaoInvalida('A SAGA desta ação ainda está em curso; aguarde a confirmação ou a rejeição.');
      }
      if (acao.estado !== 'CONFIRMADA') {
        throw new TransicaoInvalida(`Só ação CONFIRMADA pode ser cancelada; esta está ${acao.estado}.`);
      }
      const saga = await tx.sagaDaAcao(acao.id);
      acao.estado = 'CANCELADA';
      acao.motivoCancelamento = motivo;
      acao.atualizadaEm = new Date().toISOString();
      await tx.salvarAcao(acao);
      await tx.publicarEvento(
        'operacoes.acao.cancelada',
        criarEnvelope(ORIGEM, 'AcaoPreventivaCancelada', {
          acaoId: acao.id,
          sagaId: saga?.id ?? null,
          regiaoId: acao.regiaoId,
          motivo,
        }, saga?.id ?? acao.id),
      );
      return acao;
    });
  }

  private async efetuar(tx: TransacaoOperacoes, saga: Saga, desfecho: Desfecho, causa: string | null): Promise<void> {
    const acao = await tx.acao(saga.acaoId);
    if (!acao) throw new Error(`Ação ${saga.acaoId} da SAGA ${saga.id} não existe.`);

    if (desfecho.tipo === 'enviar') {
      const compensacao = saga.estado === 'COMPENSANDO' ? saga.motivo : null;
      for (const comando of desfecho.comandos) {
        await this.enviar(tx, comando, acao, saga, causa, compensacao);
      }
      return;
    }
    if (desfecho.tipo === 'confirmar') {
      // T4, o pivô.
      acao.estado = 'CONFIRMADA';
      acao.equipeId = saga.equipeId;
      acao.recursoId = saga.recursoId;
      acao.atualizadaEm = new Date().toISOString();
      await tx.salvarAcao(acao);
      await tx.publicarEvento(
        'operacoes.acao.confirmada',
        criarEnvelope(ORIGEM, 'AcaoPreventivaConfirmada', {
          acaoId: acao.id,
          sagaId: saga.id,
          regiaoId: acao.regiaoId,
          equipeId: acao.equipeId,
          recursoId: acao.recursoId,
          data: acao.data,
          turno: acao.turno,
        }, saga.id, causa),
      );
      return;
    }
    if (desfecho.tipo === 'rejeitar') {
      acao.estado = 'REJEITADA';
      acao.motivoRejeicao = desfecho.motivo;
      acao.atualizadaEm = new Date().toISOString();
      await tx.salvarAcao(acao);
      await tx.publicarEvento(
        'operacoes.acao.rejeitada',
        criarEnvelope(ORIGEM, 'AcaoPreventivaRejeitada', {
          acaoId: acao.id,
          regiaoId: acao.regiaoId,
          solicitanteId: null,
          motivo: desfecho.motivo,
        }, saga.id, causa),
      );
    }
  }

  private async enviar(
    tx: TransacaoOperacoes,
    comando: Comando,
    acao: Acao,
    saga: Saga,
    causa: string | null,
    detalhe: string | null,
  ): Promise<void> {
    const participante = PARTICIPANTE_DO_COMANDO[comando];
    const mensagem = criarEnvelope(ORIGEM, comando, dadosDoComando(comando, acao, saga), saga.id, causa);
    await tx.enviarComando(ROTA_DO_PARTICIPANTE[participante], mensagem);
    await tx.registrarPasso(saga.id, { mensagem: comando, direcao: 'ENVIADA', participante, detalhe });
  }

  private novoPrazo(): Date {
    return new Date(Date.now() + this.prazoMs);
  }
}
