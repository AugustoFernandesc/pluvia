import { Acao, EstadoAcao } from './acao';
import { Envelope } from './mensagem';
import { PassoSaga, Saga } from './saga';

/** O que uma transação pode fazer no banco de Operações. */
export interface TransacaoOperacoes {
  /** Lê a ação travando a linha até o fim da transação. */
  acao(id: string): Promise<Acao | null>;
  /** Lê a SAGA travando a linha até o fim da transação. */
  saga(id: string): Promise<Saga | null>;
  sagaDaAcao(acaoId: string): Promise<Saga | null>;
  criarAcao(acao: Acao): Promise<void>;
  salvarAcao(acao: Acao): Promise<void>;
  criarSaga(saga: Saga): Promise<void>;
  salvarSaga(saga: Saga): Promise<void>;
  registrarPasso(sagaId: string, passo: Omit<PassoSaga, 'registradoEm'>): Promise<void>;
  /** Grava na outbox uma mensagem para `pluvia.comandos`. */
  enviarComando(routingKey: string, mensagem: Envelope): Promise<void>;
  /** Grava na outbox uma mensagem para `pluvia.eventos`. */
  publicarEvento(routingKey: string, mensagem: Envelope): Promise<void>;
}

export const UNIDADE_DE_TRABALHO = Symbol('UnidadeDeTrabalho');

export interface UnidadeDeTrabalho {
  executar<T>(trabalho: (tx: TransacaoOperacoes) => Promise<T>): Promise<T>;
  /**
   * Roda `trabalho` numa transação e registra a mensagem como processada.
   * Devolve false, sem rodar nada, se a mensagem já tinha sido processada.
   */
  processar(mensagem: Envelope, trabalho: (tx: TransacaoOperacoes) => Promise<void>): Promise<boolean>;
}

export interface FiltroAcoes {
  estado?: EstadoAcao;
  regiaoId?: string;
  pagina: number;
  tamanho: number;
}

export const REPOSITORIO_ACOES = Symbol('RepositorioAcoes');

export interface RepositorioAcoes {
  listar(filtro: FiltroAcoes): Promise<{ itens: Acao[]; total: number }>;
  obter(id: string): Promise<Acao | null>;
  sagaDaAcao(acaoId: string): Promise<{ saga: Saga; passos: PassoSaga[] } | null>;
  /** Ids das SAGAs que passaram do prazo esperando resposta. */
  sagasVencidas(agora: Date): Promise<string[]>;
}

/** Quanto a SAGA espera cada resposta antes de compensar, em ms. */
export const PRAZO_SAGA_MS = Symbol('PrazoSagaMs');
