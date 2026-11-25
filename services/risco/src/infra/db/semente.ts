/**
 * Dados iniciais dos dois bancos. Os ids das regiões são os mesmos do
 * Território. O id da sinalização é fixo para que a demo e os testes possam
 * chamá-la sem procurar antes.
 */
export const REGIOES_SEMENTE = [
  { id: '6f1c2a10-0000-4000-8000-000000000001', codigo: 'LAV-CENTRO', nome: 'Centro', nivel: 'ATENCAO' },
  { id: '6f1c2a10-0000-4000-8000-000000000002', codigo: 'LAV-NORTE', nome: 'Zona Norte', nivel: 'NORMAL' },
  { id: '6f1c2a10-0000-4000-8000-000000000003', codigo: 'LAV-SUL', nome: 'Zona Sul', nivel: 'OBSERVACAO' },
  { id: '6f1c2a10-0000-4000-8000-000000000004', codigo: 'LAV-LESTE', nome: 'Zona Leste', nivel: 'NORMAL' },
  { id: '6f1c2a10-0000-4000-8000-000000000005', codigo: 'LAV-OESTE', nome: 'Zona Oeste', nivel: 'NORMAL' },
] as const;

export const REGIAO_CENTRO = REGIOES_SEMENTE[0].id;

export const SINALIZACAO_CENTRO = {
  id: '7a3e5b20-0000-4000-8000-000000000001',
  regiaoId: REGIAO_CENTRO,
  origem: 'OBSERVADO',
  nivel: 'ATENCAO',
  motivo: 'Acumulado de 72 h acima do percentil 85 histórico do Centro.',
  fatores: [
    {
      tipo: 'CHUVA_ACIMA_PADRAO',
      descricao: 'Acumulado de 72 h acima do padrão local.',
      fonte: 'CEMADEN',
    },
  ],
} as const;
