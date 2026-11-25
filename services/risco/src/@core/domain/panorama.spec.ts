import { DocumentoPanorama, aplicarReconhecimento, contarAbertas } from './panorama';

const documento: DocumentoPanorama = {
  fatores: [],
  sinalizacoes: [
    { id: 'a', estado: 'ABERTA', nivel: 'ATENCAO' },
    { id: 'b', estado: 'ABERTA', nivel: 'OBSERVACAO' },
  ],
};

describe('aplicarReconhecimento', () => {
  it('troca só a sinalização reconhecida e não altera o original', () => {
    const novo = aplicarReconhecimento(documento, 'a', '2026-11-25T12:00:00Z');

    expect(novo.sinalizacoes).toEqual([
      { id: 'a', estado: 'RECONHECIDA', nivel: 'ATENCAO', reconhecidaEm: '2026-11-25T12:00:00Z' },
      { id: 'b', estado: 'ABERTA', nivel: 'OBSERVACAO' },
    ]);
    expect(contarAbertas(novo)).toBe(1);
    expect(contarAbertas(documento)).toBe(2);
  });

  it('acrescenta a sinalização se o panorama ainda não a conhecia', () => {
    const novo = aplicarReconhecimento(documento, 'c', '2026-11-25T12:00:00Z');

    expect(novo.sinalizacoes).toHaveLength(3);
    expect(novo.sinalizacoes[2]).toMatchObject({ id: 'c', estado: 'RECONHECIDA' });
  });
});
