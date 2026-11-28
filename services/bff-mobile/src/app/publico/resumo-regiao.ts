export interface PanoramaRegiao {
  nivelAtencao: string;
  atualizadoEm?: string;
}

export interface RegiaoTerritorio {
  id: string;
  nome: string;
  atualizadaEm?: string;
}

export interface ResumoRegiao {
  regiao: string;
  nivel: 'NORMAL' | 'OBSERVACAO' | 'ATENCAO' | 'ALTA_ATENCAO';
  rotulo: string;
  cor: string;
  mensagem: string;
  atualizadoEm: string;
}

const APRESENTACAO: Record<ResumoRegiao['nivel'], Omit<ResumoRegiao, 'regiao' | 'nivel' | 'atualizadoEm'>> = {
  NORMAL: {
    rotulo: 'Acompanhamento regular',
    cor: '#16845B',
    mensagem: 'O panorama mais recente classifica a região no nível normal de atenção. Continue acompanhando os canais oficiais.',
  },
  OBSERVACAO: {
    rotulo: 'Em observação',
    cor: '#B7791F',
    mensagem: 'Os dados disponíveis colocam a região em observação. Consulte os canais oficiais para orientações atualizadas.',
  },
  ATENCAO: {
    rotulo: 'Atenção',
    cor: '#C65D12',
    mensagem: 'O panorama disponível indica que esta região merece atenção. Acompanhe as orientações das autoridades locais.',
  },
  ALTA_ATENCAO: {
    rotulo: 'Atenção elevada',
    cor: '#B42332',
    mensagem: 'Os indicadores disponíveis apontam atenção elevada para a região. Acompanhe os canais oficiais e siga as orientações locais.',
  },
};

export function criarResumoRegiao(regiao: RegiaoTerritorio, panorama: PanoramaRegiao): ResumoRegiao {
  const nivel = panorama.nivelAtencao as ResumoRegiao['nivel'];
  const apresentacao = APRESENTACAO[nivel];
  if (!apresentacao) throw new Error('Risco retornou um nível de atenção desconhecido.');

  const atualizadoEm = panorama.atualizadoEm ?? regiao.atualizadaEm;
  if (!atualizadoEm || !Number.isFinite(Date.parse(atualizadoEm))) {
    throw new Error('Território e Risco não informaram a data da última atualização.');
  }

  return {
    regiao: regiao.nome,
    nivel,
    ...apresentacao,
    atualizadoEm,
  };
}
