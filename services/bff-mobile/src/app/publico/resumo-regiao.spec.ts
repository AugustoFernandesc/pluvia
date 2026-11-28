import { criarResumoRegiao } from './resumo-regiao';

describe('criarResumoRegiao', () => {
  const regiao = { id: 'centro', nome: 'Centro' };

  it('resume um nível real de atenção em linguagem pública sem dados técnicos', () => {
    const resumo = criarResumoRegiao(regiao, {
      nivelAtencao: 'ATENCAO',
      atualizadoEm: '2026-11-26T12:00:00.000Z',
    });

    expect(resumo).toMatchObject({
      regiao: 'Centro',
      nivel: 'ATENCAO',
      rotulo: 'Atenção',
      atualizadoEm: '2026-11-26T12:00:00.000Z',
    });
    expect(JSON.stringify(resumo)).not.toMatch(/percentil|geometria|vulnerabilidade|equipe/i);
  });

  it('não classifica uma região sem nível de Risco nem inventa a data de atualização', () => {
    expect(() => criarResumoRegiao(regiao, { nivelAtencao: 'DESCONHECIDO' })).toThrow(
      'nível de atenção desconhecido',
    );
    expect(() => criarResumoRegiao(regiao, { nivelAtencao: 'NORMAL' })).toThrow(
      'não informaram a data',
    );
  });
});
