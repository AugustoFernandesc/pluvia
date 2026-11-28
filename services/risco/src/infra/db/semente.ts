/**
 * Dados iniciais dos dois bancos. Os ids das regiões são os mesmos do
 * Território. Os ids das sinalizações são fixos para que a demo e os testes
 * possam chamá-las sem procurar antes. As sinalizações são coerentes com o
 * nível de cada região: as regiões fora de NORMAL têm sinalizações ABERTA, e
 * o restante é histórico (RECONHECIDA e ENCERRADA).
 */
export const REGIOES_SEMENTE = [
  { id: '6f1c2a10-0000-4000-8000-000000000001', codigo: 'LAV-CENTRO', nome: 'Centro', nivel: 'ATENCAO' },
  { id: '6f1c2a10-0000-4000-8000-000000000002', codigo: 'LAV-NORTE', nome: 'Zona Norte', nivel: 'NORMAL' },
  { id: '6f1c2a10-0000-4000-8000-000000000003', codigo: 'LAV-SUL', nome: 'Zona Sul', nivel: 'OBSERVACAO' },
  { id: '6f1c2a10-0000-4000-8000-000000000004', codigo: 'LAV-LESTE', nome: 'Zona Leste', nivel: 'NORMAL' },
  { id: '6f1c2a10-0000-4000-8000-000000000005', codigo: 'LAV-OESTE', nome: 'Zona Oeste', nivel: 'NORMAL' },
] as const;

export const REGIAO_CENTRO = REGIOES_SEMENTE[0].id;
const REGIAO_NORTE = REGIOES_SEMENTE[1].id;
const REGIAO_SUL = REGIOES_SEMENTE[2].id;
const REGIAO_OESTE = REGIOES_SEMENTE[4].id;

/** Técnico fictício que consta como autor dos reconhecimentos do seed. */
export const TECNICO_SEMENTE = '00000000-0000-4000-8000-0000000000a1';

type NivelSemente = 'OBSERVACAO' | 'ATENCAO';

interface SinalizacaoSemente {
  id: string;
  regiaoId: string;
  origem: 'OBSERVADO' | 'PREVISTO';
  nivel: NivelSemente;
  estado: 'ABERTA' | 'RECONHECIDA' | 'ENCERRADA';
  motivo: string;
  fatores: { tipo: string; descricao: string; fonte: string }[];
  /** Há quantas horas a sinalização foi emitida, reconhecida e encerrada. */
  emitidaHaHoras: number;
  reconhecidaHaHoras?: number;
  encerradaHaHoras?: number;
}

export const SINALIZACAO_CENTRO = {
  id: '7a3e5b20-0000-4000-8000-000000000001',
  regiaoId: REGIAO_CENTRO,
  origem: 'OBSERVADO',
  nivel: 'ATENCAO',
  estado: 'ABERTA',
  motivo: 'Acumulado de 72 h acima do percentil 85 histórico do Centro.',
  fatores: [
    {
      tipo: 'CHUVA_ACIMA_PADRAO',
      descricao: 'Acumulado de 72 h acima do padrão local.',
      fonte: 'CEMADEN',
    },
  ],
  emitidaHaHoras: 0,
} as const satisfies SinalizacaoSemente;

export const SINALIZACOES_SEMENTE: readonly SinalizacaoSemente[] = [
  SINALIZACAO_CENTRO,
  {
    id: '7a3e5b20-0000-4000-8000-000000000002',
    regiaoId: REGIAO_CENTRO,
    origem: 'PREVISTO',
    nivel: 'ATENCAO',
    estado: 'ABERTA',
    motivo: 'Previsão de chuva forte nas próximas 24 h sobre solo já saturado no Centro.',
    fatores: [
      {
        tipo: 'PREVISAO_CHUVA_FORTE',
        descricao: 'Previsão de mais de 50 mm em 24 h.',
        fonte: 'INMET',
      },
    ],
    emitidaHaHoras: 1,
  },
  {
    id: '7a3e5b20-0000-4000-8000-000000000003',
    regiaoId: REGIAO_CENTRO,
    origem: 'OBSERVADO',
    nivel: 'OBSERVACAO',
    estado: 'RECONHECIDA',
    motivo: 'Nível do córrego do Centro acima da cota de observação.',
    fatores: [
      {
        tipo: 'NIVEL_CORREGO_ELEVADO',
        descricao: 'Nível do córrego acima da cota de observação.',
        fonte: 'CEMADEN',
      },
    ],
    emitidaHaHoras: 30,
    reconhecidaHaHoras: 28,
  },
  {
    id: '7a3e5b20-0000-4000-8000-000000000004',
    regiaoId: REGIAO_CENTRO,
    origem: 'OBSERVADO',
    nivel: 'OBSERVACAO',
    estado: 'ENCERRADA',
    motivo: 'Chuva moderada concentrada no Centro durante a madrugada.',
    fatores: [
      {
        tipo: 'CHUVA_ACIMA_PADRAO',
        descricao: 'Chuva moderada em poucas horas.',
        fonte: 'CEMADEN',
      },
    ],
    emitidaHaHoras: 120,
    reconhecidaHaHoras: 118,
    encerradaHaHoras: 96,
  },
  {
    id: '7a3e5b20-0000-4000-8000-000000000005',
    regiaoId: REGIAO_SUL,
    origem: 'OBSERVADO',
    nivel: 'OBSERVACAO',
    estado: 'ABERTA',
    motivo: 'Acumulado de 24 h acima do padrão para a Zona Sul.',
    fatores: [
      {
        tipo: 'CHUVA_ACIMA_PADRAO',
        descricao: 'Acumulado de 24 h acima do padrão local.',
        fonte: 'CEMADEN',
      },
    ],
    emitidaHaHoras: 3,
  },
  {
    id: '7a3e5b20-0000-4000-8000-000000000006',
    regiaoId: REGIAO_SUL,
    origem: 'PREVISTO',
    nivel: 'OBSERVACAO',
    estado: 'RECONHECIDA',
    motivo: 'Previsão de chuva moderada para a Zona Sul nas próximas 48 h.',
    fatores: [
      {
        tipo: 'PREVISAO_CHUVA_MODERADA',
        descricao: 'Previsão de chuva moderada em 48 h.',
        fonte: 'INMET',
      },
    ],
    emitidaHaHoras: 20,
    reconhecidaHaHoras: 18,
  },
  {
    id: '7a3e5b20-0000-4000-8000-000000000007',
    regiaoId: REGIAO_NORTE,
    origem: 'OBSERVADO',
    nivel: 'OBSERVACAO',
    estado: 'ENCERRADA',
    motivo: 'Chuva isolada na Zona Norte, já dissipada.',
    fatores: [
      {
        tipo: 'CHUVA_ACIMA_PADRAO',
        descricao: 'Chuva isolada acima do padrão por poucas horas.',
        fonte: 'CEMADEN',
      },
    ],
    emitidaHaHoras: 200,
    reconhecidaHaHoras: 198,
    encerradaHaHoras: 170,
  },
  {
    id: '7a3e5b20-0000-4000-8000-000000000008',
    regiaoId: REGIAO_OESTE,
    origem: 'PREVISTO',
    nivel: 'OBSERVACAO',
    estado: 'ENCERRADA',
    motivo: 'Previsão de chuva para a Zona Oeste que não se confirmou.',
    fatores: [
      {
        tipo: 'PREVISAO_CHUVA_MODERADA',
        descricao: 'Previsão de chuva moderada que não se confirmou.',
        fonte: 'INMET',
      },
    ],
    emitidaHaHoras: 150,
    reconhecidaHaHoras: 148,
    encerradaHaHoras: 130,
  },
];

/** Instante de `horas` atrás, para as datas relativas do seed. */
export function haHoras(horas: number): Date {
  return new Date(Date.now() - horas * 3_600_000);
}
