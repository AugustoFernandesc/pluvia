import { PedidoReserva, Recurso, escolherRecurso, janelaDoTurno, sobrepoe } from './frota';

const caminhao: Recurso = {
  id: 'c1',
  tipo: 'VEICULO',
  categoria: 'CAMINHAO_HIDROJATO',
  identificacao: 'HJT1A23',
  descricao: null,
  situacao: 'OPERACIONAL',
  emManutencaoAgora: false,
  criadoEm: '2026-11-25T00:00:00Z',
};

const pedido: PedidoReserva = {
  sagaId: 's1',
  acaoId: 'a1',
  categoria: 'CAMINHAO_HIDROJATO',
  data: '2026-11-26',
  turno: 'TARDE',
};

describe('janelaDoTurno', () => {
  it('usa o horário de Lavras (UTC-3)', () => {
    const { inicio, fim } = janelaDoTurno('2026-11-26', 'TARDE');
    expect(inicio.toISOString()).toBe('2026-11-26T15:00:00.000Z');
    expect(fim.toISOString()).toBe('2026-11-26T21:00:00.000Z');
  });

  it('a noite termina à meia-noite local', () => {
    expect(janelaDoTurno('2026-11-26', 'NOITE').fim.toISOString()).toBe('2026-11-27T03:00:00.000Z');
  });
});

describe('sobrepoe', () => {
  const tarde = janelaDoTurno('2026-11-26', 'TARDE');

  it('manutenção dentro do turno bloqueia', () => {
    expect(sobrepoe({ inicio: '2026-11-26T13:00:00-03:00', fim: '2026-11-26T14:00:00-03:00' }, tarde)).toBe(true);
  });

  it('manutenção que termina quando o turno começa não bloqueia', () => {
    expect(sobrepoe({ inicio: '2026-11-26T08:00:00-03:00', fim: '2026-11-26T12:00:00-03:00' }, tarde)).toBe(false);
  });
});

describe('escolherRecurso', () => {
  it('reserva o recurso livre da categoria', () => {
    expect(escolherRecurso([caminhao], new Set(), new Set(), pedido)).toEqual({ recurso: caminhao });
  });

  it('recusa com o motivo quando o único recurso está em manutenção', () => {
    expect(escolherRecurso([caminhao], new Set(), new Set(['c1']), pedido)).toEqual({
      motivo: 'Nenhum recurso da categoria CAMINHAO_HIDROJATO disponível em 2026-11-26, turno TARDE: HJT1A23 em manutenção.',
    });
  });

  it('recusa quando o recurso já está reservado no turno', () => {
    const escolha = escolherRecurso([caminhao], new Set(['c1']), new Set(), pedido);
    expect(escolha).toEqual({ motivo: expect.stringContaining('HJT1A23 já reservado') });
  });

  it('ignora recurso inativo', () => {
    const inativo = { ...caminhao, situacao: 'INATIVO' as const };
    expect('motivo' in escolherRecurso([inativo], new Set(), new Set(), pedido)).toBe(true);
  });
});
