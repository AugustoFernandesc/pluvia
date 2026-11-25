# Avaliação bruta do RAG (qwen2.5:3b, embeddings bge-m3)

| Modo | Fatos encontrados | Latência mediana | Latência máxima |
|---|---|---|---|
| Sem recuperação | 1/11 | 5774 ms | 7869 ms |
| Com recuperação | 10/11 | 17314 ms | 19661 ms |

### 1. Qual percentil padrão faz uma região entrar no nível ATENCAO no Pluvia, e com qual janela de chuva?

Fatos esperados: 85, 72 horas

| | Sem recuperação | Com recuperação |
|---|---|---|
| Resposta | O Pluvia utiliza um percentil específico para determinar o nível de atenção. Normalmente, um percentil de 90 ou acima em uma janela de chuva de 1 hora é considerado o nível ATENÇÃO. Essa configuração é ajustada periodicamente para refletir as condições climáticas locais. | O percentil padrão que faz uma região entrar no nível ATENÇÃO no Pluvia é o 85º percentil de atenção. A janela de chuva considerada é a acumulada nas últimas 72 horas. |
| Fatos encontrados | 0/2 | 2/2 |
| Latência | 4841 ms | 8040 ms |

Trechos recuperados: Níveis de atenção do Pluvia (0.67), Níveis de atenção do Pluvia (0.62), Níveis de atenção do Pluvia (0.61), Níveis de atenção do Pluvia (0.58)

### 2. O que a equipe da prefeitura deve fazer quando uma região está em ALTA_ATENCAO?

Fatos esperados: prontidão, Defesa Civil

| | Sem recuperação | Com recuperação |
|---|---|---|
| Resposta | Quando uma região está em ALTA_ATENÇÃO, a equipe da prefeitura deve monitorar constantemente os raios de chuva e verificar a situação das redes de esgotamento. Também deve preparar e manter em estado de prontidão os equipamentos de evacuação de águas pluviais. Além disso, deve estar preparado para realizar ações de evacuação de emergência caso necessário. | Quando uma região está em ALTA_ATENCAO, a equipe da prefeitura deve priorizar a região, deixar a equipe e os veículos de prontidão e avisar a Defesa Civil municipal. |
| Fatos encontrados | 1/2 | 2/2 |
| Latência | 5866 ms | 17171 ms |

Trechos recuperados: Níveis de atenção do Pluvia (0.55), Ações preventivas contra alagamento (0.52), Níveis de atenção do Pluvia (0.50), Orientações à população em caso de chuva forte e alagamento (0.50)

### 3. Por que uma ação preventiva no estado PENDENTE não pode ser cancelada?

Fatos esperados: reserva, equipe

| | Sem recuperação | Com recuperação |
|---|---|---|
| Resposta | Uma ação preventiva no estado PENDENTE não pode ser cancelada porque já foi aprovada e está em andamento. Cancelar uma ação em andamento pode ter implicações legais e administrativas, além de comprometer os recursos já investidos. É importante seguir o processo até o final para garantir que o objetivo preventivo seja atingido. | Uma ação preventiva no estado PENDENTE não pode ser cancelada porque ainda há uma reserva em andamento. Cancelar nesse momento poderia deixar uma equipe reservada sem tarefa, o que não é apropriado. |
| Fatos encontrados | 0/2 | 2/2 |
| Latência | 5681 ms | 17458 ms |

Trechos recuperados: Ações preventivas contra alagamento (0.59), Ações preventivas contra alagamento (0.46), Ocorrências e validação técnica (0.39), Níveis de atenção do Pluvia (0.39)

### 4. Quantas ocorrências de alagamento, enxurrada e inundação Lavras registrou entre 1991 e 2025, e quantas pessoas foram afetadas?

Fatos esperados: 11, 3.077

| | Sem recuperação | Com recuperação |
|---|---|---|
| Resposta | Desculpe, mas não tenho os dados específicos sobre as ocorrências de alagamento, enxurrada e inundação em Lavras entre 1991 e 2025, nem sobre o número de pessoas afetadas. Esses dados precisos não estão disponíveis no meu banco de dados atual. Para obter essa informação precisa, seria necessário consultar os registros oficiais da prefeitura de Lavras ou do Instituto Nacional de Meteorologia (INMET). | Lavras/MG registrou 11 ocorrências de alagamento, enxurrada e inundação entre 1991 e 2025. Essas ocorrências resultaram em 1 óbito, 276 pessoas desabrigadas ou desalojadas e 3.077 pessoas afetadas. |
| Fatos encontrados | 0/2 | 2/2 |
| Latência | 6672 ms | 19661 ms |

Trechos recuperados: Recorte piloto: Lavras/MG (0.65), Ocorrências e validação técnica (0.52), Orientações à população em caso de chuva forte e alagamento (0.42), Orientações à população em caso de chuva forte e alagamento (0.40)

### 5. Quais cuidados tomar ao limpar a casa depois de um alagamento?

Fatos esperados: luvas, leptospirose

| | Sem recuperação | Com recuperação |
|---|---|---|
| Resposta | Após um alagamento, é importante limpar com cuidado para evitar riscos de infecção. Comece removendo materiais danificados, como carpete e tapetes. Em seguida, limpe as superfícies com produtos de limpeza adequados para remover resíduos de água. Certifique-se de secar completamente todos os objetos e superfícies antes de fazer manutenção. Finalmente, limpe as paredes e teto com produtos específicos para limpeza de alagamentos. | Ao limpar a casa depois de um alagamento, é importante usar luvas e botas para evitar contato direto com a água de enchente, que pode transmitir doenças. Lavar pisos e paredes com água sanitária diluída é uma medida preventiva. Além disso, descartar alimentos e remédios que tiveram contato com a água é essencial para evitar riscos de contaminação. Finalmente, procurar assistência médica se apresentarem sintomas de doenças após o contato com a água de enchente é crucial. |
| Fatos encontrados | 0/2 | 1/2 |
| Latência | 7869 ms | 19375 ms |

Trechos recuperados: Orientações à população em caso de chuva forte e alagamento (0.73), Orientações à população em caso de chuva forte e alagamento (0.67), Orientações à população em caso de chuva forte e alagamento (0.62), Ações preventivas contra alagamento (0.56)

### 6. Qual é a melhor época para plantar café no sul de Minas?

Fatos esperados: não cobre

| | Sem recuperação | Com recuperação |
|---|---|---|
| Resposta | A melhor época para plantar café no sul de Minas Gerais é geralmente entre outubro e dezembro, quando as condições climáticas são mais favoráveis para o plantio. | Base de conhecimento não cobre o assunto. |
| Fatos encontrados | 0/1 | 1/1 |
| Latência | 2454 ms | 15214 ms |

Trechos recuperados: Ações preventivas contra alagamento (0.35), Recorte piloto: Lavras/MG (0.33), Recorte piloto: Lavras/MG (0.30), Níveis de atenção do Pluvia (0.28)

