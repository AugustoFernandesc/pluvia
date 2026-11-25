# Ações preventivas contra alagamento

Uma ação preventiva é uma tarefa de campo planejada antes da chuva para reduzir a chance de alagamento numa região. No Pluvia, ela é solicitada pelo gestor e só é confirmada quando o sistema consegue reservar uma equipe e um veículo para a data e o turno pedidos.

## Tipos de ação

| Tipo | Quando usar | Recurso típico |
|---|---|---|
| LIMPEZA_DRENAGEM | Bocas de lobo e galerias com acúmulo de folhas, lixo ou areia | Caminhão hidrojato ou bomba de sucção |
| DESOBSTRUCAO | Canais e córregos com galhos, entulho ou assoreamento | Retroescavadeira |
| VISTORIA | Ocorrências relatadas que ainda não foram confirmadas | Caminhonete e kit de vistoria |
| INSPECAO_PONTO_CRITICO | Pontos que alagam com frequência, conferidos antes da chuva | Caminhonete e kit de vistoria |

Cada ação é marcada para uma data e um turno: MANHA, TARDE ou NOITE.

## Quando priorizar

1. Regiões em ATENCAO ou ALTA_ATENCAO com previsão de mais chuva nas próximas 72 horas.
2. Regiões próximas a curso d'água e com baixa declividade, onde a água escoa devagar.
3. Pontos com ocorrência confirmada nos últimos 30 dias, como bueiros entupidos ou ruas alagadas.

A limpeza da drenagem rende mais quando é feita antes do período chuvoso e logo depois de chuvas fortes, porque a enxurrada arrasta lixo e sedimentos que entopem as bocas de lobo.

## Ciclo de vida de uma ação

1. **PENDENTE:** o gestor pediu a ação e o sistema está reservando a equipe e o veículo.
2. **CONFIRMADA:** a equipe e o veículo foram reservados.
3. **EM_EXECUCAO:** a equipe chegou ao local e iniciou o trabalho.
4. **CONCLUIDA:** o trabalho terminou, com o resultado registrado pelo agente.
5. **REJEITADA:** não havia equipe ou veículo disponível; as reservas feitas no meio do caminho foram desfeitas.
6. **CANCELADA:** o gestor cancelou uma ação confirmada, e as reservas foram liberadas.

Uma ação PENDENTE não pode ser cancelada, porque a reserva ainda está em andamento. Cancelar nesse momento poderia deixar uma equipe reservada sem tarefa.
