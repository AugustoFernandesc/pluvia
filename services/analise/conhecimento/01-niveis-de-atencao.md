# Níveis de atenção do Pluvia

O Pluvia classifica cada região monitorada em quatro níveis de atenção. O nível não é um alerta à população: é um sinal de planejamento para a equipe técnica da prefeitura e para os agentes de campo.

## Como o nível é calculado

O nível compara a chuva acumulada nas últimas 72 horas com o histórico da própria região. Por padrão, o sistema usa os últimos 10 anos de registros. O mesmo volume de chuva tem significados diferentes em lugares diferentes, então não existe um limite fixo em milímetros válido para toda a cidade.

- **Percentil de atenção:** por padrão, o percentil 85 do acumulado de 72 horas da região.
- **Percentil de alta atenção:** por padrão, o percentil 95.
- **Peso da vulnerabilidade:** por padrão, 0,30. Regiões próximas a curso d'água, com baixa declividade ou com ocupação densa sobem de nível mais cedo.

Os técnicos podem ajustar esses parâmetros por região, porque cada território responde de um jeito à chuva.

## Os quatro níveis

| Nível | Significado | O que a equipe faz |
|---|---|---|
| NORMAL | A chuva está dentro do comportamento habitual da região | Rotina de manutenção |
| OBSERVACAO | A chuva se aproxima do percentil de atenção ou há previsão de chuva forte | Acompanhar a previsão e conferir a drenagem crítica |
| ATENCAO | O acumulado passou do percentil de atenção | Programar ações preventivas, como a limpeza de bocas de lobo e a desobstrução de canais |
| ALTA_ATENCAO | O acumulado passou do percentil de alta atenção | Priorizar a região, deixar equipe e veículo de prontidão e avisar a Defesa Civil municipal |

## Sinalizações

Quando uma região cruza um limiar, o Pluvia emite uma sinalização. Ela fica no estado ABERTA até que um técnico a reconheça (RECONHECIDA) e depois a encerre (ENCERRADA). Cada sinalização registra a origem (OBSERVADO, quando vem de chuva medida, ou PREVISTO, quando vem da previsão do tempo), o motivo e os fatores que levaram à mudança de nível.

## Limites do sistema

O Pluvia não substitui os alertas oficiais da Defesa Civil nem do CEMADEN. Em caso de risco à vida, a orientação é seguir as autoridades e ligar para a Defesa Civil (199) ou para o Corpo de Bombeiros (193).
