import { validarAmbiente } from './validar-ambiente';

const ambienteCompleto: Record<string, string> = {
  POSTGRES_ESCRITA_HOST: 'risco-escrita-db',
  POSTGRES_ESCRITA_PORT: '5432',
  POSTGRES_ESCRITA_DB: 'risco_escrita',
  POSTGRES_ESCRITA_USER: 'risco_escrita',
  POSTGRES_ESCRITA_PASSWORD: 'senha-escrita',
  POSTGRES_LEITURA_HOST: 'risco-leitura-db',
  POSTGRES_LEITURA_PORT: '5432',
  POSTGRES_LEITURA_DB: 'risco_leitura',
  POSTGRES_LEITURA_USER: 'risco_leitura',
  POSTGRES_LEITURA_PASSWORD: 'senha-leitura',
  PORT: '3000',
};

describe('validarAmbiente', () => {
  it('aceita um ambiente completo e converte as portas para número', () => {
    const ambiente = validarAmbiente(ambienteCompleto);

    expect(ambiente).toEqual({
      POSTGRES_ESCRITA_HOST: 'risco-escrita-db',
      POSTGRES_ESCRITA_PORT: 5432,
      POSTGRES_ESCRITA_DB: 'risco_escrita',
      POSTGRES_ESCRITA_USER: 'risco_escrita',
      POSTGRES_ESCRITA_PASSWORD: 'senha-escrita',
      POSTGRES_LEITURA_HOST: 'risco-leitura-db',
      POSTGRES_LEITURA_PORT: 5432,
      POSTGRES_LEITURA_DB: 'risco_leitura',
      POSTGRES_LEITURA_USER: 'risco_leitura',
      POSTGRES_LEITURA_PASSWORD: 'senha-leitura',
      PORT: 3000,
    });
  });

  it.each(Object.keys(ambienteCompleto))(
    'falha nomeando %s quando a variável está ausente',
    (variavel) => {
      const { [variavel]: _removida, ...semVariavel } = ambienteCompleto;

      expect(() => validarAmbiente(semVariavel)).toThrow(variavel);
    },
  );

  it('trata variável vazia como ausente', () => {
    expect(() =>
      validarAmbiente({ ...ambienteCompleto, POSTGRES_LEITURA_HOST: '' }),
    ).toThrow('POSTGRES_LEITURA_HOST');
  });

  it('nomeia todas as variáveis ausentes de uma vez, escrita antes de leitura', () => {
    expect(() => validarAmbiente({})).toThrow(
      /POSTGRES_ESCRITA_HOST.*POSTGRES_ESCRITA_PASSWORD.*POSTGRES_LEITURA_HOST.*POSTGRES_LEITURA_PASSWORD.*PORT/s,
    );
  });

  it.each(['POSTGRES_ESCRITA_PORT', 'POSTGRES_LEITURA_PORT', 'PORT'])(
    'rejeita %s não numérico',
    (variavel) => {
      expect(() =>
        validarAmbiente({ ...ambienteCompleto, [variavel]: 'abc' }),
      ).toThrow(variavel);
    },
  );

  it.each(['0', '-1', '70000', '30.5'])(
    'rejeita PORT fora do intervalo de portas: %s',
    (valor) => {
      expect(() =>
        validarAmbiente({ ...ambienteCompleto, PORT: valor }),
      ).toThrow('PORT');
    },
  );
});
