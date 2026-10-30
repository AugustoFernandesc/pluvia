import { validarAmbiente } from './validar-ambiente';

const ambienteCompleto: Record<string, string> = {
  POSTGRES_HOST: 'localhost',
  POSTGRES_PORT: '5432',
  POSTGRES_DB: 'servico',
  POSTGRES_USER: 'servico',
  POSTGRES_PASSWORD: 'troque-esta-senha',
  PORT: '3000',
};

describe('validarAmbiente', () => {
  it('aceita um ambiente completo e converte as portas para número', () => {
    const ambiente = validarAmbiente(ambienteCompleto);

    expect(ambiente).toEqual({
      POSTGRES_HOST: 'localhost',
      POSTGRES_PORT: 5432,
      POSTGRES_DB: 'servico',
      POSTGRES_USER: 'servico',
      POSTGRES_PASSWORD: 'troque-esta-senha',
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
      validarAmbiente({ ...ambienteCompleto, POSTGRES_HOST: '' }),
    ).toThrow('POSTGRES_HOST');
  });

  it('nomeia todas as variáveis ausentes de uma vez', () => {
    expect(() => validarAmbiente({})).toThrow(
      /POSTGRES_HOST.*POSTGRES_PORT.*POSTGRES_DB.*POSTGRES_USER.*POSTGRES_PASSWORD.*PORT/s,
    );
  });

  it.each(['POSTGRES_PORT', 'PORT'])(
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
