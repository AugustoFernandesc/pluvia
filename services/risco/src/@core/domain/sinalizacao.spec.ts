import { Sinalizacao, TransicaoInvalida, reconhecer } from './sinalizacao';

const aberta: Sinalizacao = {
  id: '7a3e5b20-0000-4000-8000-000000000001',
  regiaoId: '6f1c2a10-0000-4000-8000-000000000001',
  origem: 'OBSERVADO',
  nivelAtencao: 'ATENCAO',
  motivo: 'teste',
  fatores: [],
  estado: 'ABERTA',
  emitidaEm: new Date('2026-11-01T00:00:00Z'),
  reconhecidaPor: null,
  reconhecidaEm: null,
  encerradaEm: null,
};

describe('reconhecer', () => {
  it('muda ABERTA para RECONHECIDA e grava quando e quem', () => {
    const agora = new Date('2026-11-25T12:00:00Z');
    const tecnico = '11111111-1111-4111-8111-111111111111';

    const resultado = reconhecer(aberta, agora, tecnico);

    expect(resultado).toMatchObject({ estado: 'RECONHECIDA', reconhecidaEm: agora, reconhecidaPor: tecnico });
    expect(aberta.estado).toBe('ABERTA');
  });

  it.each(['RECONHECIDA', 'ENCERRADA'] as const)('recusa sinalização %s', (estado) => {
    expect(() => reconhecer({ ...aberta, estado }, new Date(), null)).toThrow(TransicaoInvalida);
  });
});
