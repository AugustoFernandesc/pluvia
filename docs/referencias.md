# Fichamento das fontes institucionais

Documento de apoio ao README. Enquanto o README apresenta cada fonte e o que ela sustenta na proposta, este arquivo registra o que **não** cabe lá: o detalhe do que cada fonte oferece, suas limitações conhecidas e como será usada no projeto.

**Critério de seleção.** Fontes institucionais e dados oficiais brasileiros. Fontes jornalísticas, quando usadas, entram como complemento ilustrativo e nunca como base da fundamentação.

**Regra da equipe.** Nenhuma estatística é apresentada sem fonte, recorte territorial, período de referência e data de consulta. Número que não puder ser confirmado diretamente no portal da instituição não é usado.

---

## 1. CEMADEN

🔗 https://www.gov.br/cemaden/pt-br · https://mapainterativo.cemaden.gov.br

**O que oferece**
- Rede nacional de pluviômetros automáticos e semiautomáticos.
- Monitoramento de áreas de risco geo-hidrológico nos municípios mapeados.
- Cenários de risco que combinam condições observadas e previsão de chuva, incluindo situações em que a capacidade dos sistemas de drenagem pode ser ultrapassada.

**Limitações a reconhecer**
- A densidade da rede não é uniforme entre municípios. Regiões com menos estações produzem leitura menos precisa, limitação que a Pluvia declara na própria interface.
- O monitoramento cobre municípios mapeados como prioritários, não a totalidade do país: são 1.295 dos 5.570 municípios brasileiros, pouco menos de um quarto.
- **Atenção a fonte desatualizada.** A página institucional "Municípios Monitorados" (https://www.gov.br/cemaden/pt-br/paginas/municipios-monitorados) ainda informa 959 municípios, com atualização de 16/03/2022. O número corrente é 1.295, com referência de 17/03/2026, divulgado em notícia do próprio CEMADEN. Se alguém citar 959 na arguição, esta é a explicação.

**Como será usada.** Fonte de dados de chuva para o recorte piloto e referência conceitual para a linguagem de risco adotada, que é de cenário e não de previsão determinística.

**Consultado em:** 17/09/2026

---

## 2. MIDR / Atlas Digital de Desastres no Brasil / S2ID

🔗 https://atlasdigital.mdr.gov.br · https://s2id.mi.gov.br

**O que oferece**
- Consulta de ocorrências por município, período e tipologia de desastre, incluindo inundação, enxurrada e alagamento.
- Dados de danos e prejuízos associados aos registros.
- Séries históricas que permitem análise de recorrência.

**Limitações a reconhecer**
- **Sub-registro.** A base depende do registro feito pelo próprio município. Evento sem decretação ou sem registro formal não aparece. Afeta qualquer leitura histórica e precisa ser dito na apresentação, porque é o tipo de ressalva que separa quem leu a fonte de quem só citou o nome dela.
- O registro reflete o evento declarado, não necessariamente a extensão real do impacto.
- A qualidade do preenchimento varia entre municípios e entre períodos.
- **Os filtros do Mapa Interativo são rotulados por nome de tipo e não exibem os códigos COBRADE.** A correspondência entre os filtros usados e os códigos é plausível, mas não está escrita no portal. Não apresentar códigos COBRADE como se tivessem sido lidos ali.
- **Não confundir recortes.** O grupo "Hidrológico" de Lavras reúne cinco tipos (Alagamentos, Chuvas Intensas, Enxurradas, Inundações e Movimento de Massa) e soma 25 protocolos. Os três tipos que a Pluvia usa somam 11. O total de protocolos do município, todos os grupos, é 37.
- O S2ID bloqueia acesso automatizado, retornando 403 para robôs, mas abre normalmente em navegador.

**Como será usada.** Histórico de ocorrências por região no recorte piloto, e fundamentação da recorrência no pitch.

**Consultado em:** 17/09/2026

---

## 3. ANA

🔗 https://www.gov.br/ana/pt-br · https://www.snirh.gov.br/hidroweb/apresentacao

**O que oferece**
- Séries históricas de nível, vazão e precipitação das estações da Rede Hidrometeorológica Nacional (HidroWeb).
- Sistema Nacional de Informações sobre Recursos Hídricos (SNIRH).
- Relatórios de Conjuntura dos Recursos Hídricos no Brasil, com análise periódica que inclui eventos críticos.

**Limitações a reconhecer**
- Cobertura concentrada em bacias e cursos d'água de maior porte. A microdrenagem urbana, que é onde o alagamento urbano frequentemente ocorre, não é coberta por essa rede.
- Nem toda região do recorte piloto terá estação próxima o suficiente para leitura útil.
- O endereço https://www.snirh.gov.br/hidroweb redireciona para https://www.snirh.gov.br/hidroweb/apresentacao. Usar o endereço final nas citações.

**Como será usada.** Complemento hidrológico à leitura de chuva, quando houver estação relevante para a região analisada.

**Consultado em:** 17/09/2026

---

## 4. IBGE

🔗 https://www.ibge.gov.br · https://censo2022.ibge.gov.br · [MUNIC](https://www.ibge.gov.br/estatisticas/sociais/protecao-social/10586-pesquisa-de-informacoes-basicas-municipais.html)

**O que oferece**
- **Censo Demográfico 2022:** população, domicílios e características de ocupação, com desagregação fina por setor censitário.
- **Aglomerados subnormais:** classificação de áreas com ocupação precária e carência de serviços públicos.
- **Malhas territoriais:** geometria dos recortes, necessária para agregar dados por região.
- **MUNIC:** existência de instrumentos municipais de gestão, incluindo os relacionados a risco e desastres. A edição de 2017 é a que traz o percentual consolidado que usamos; a edição mais recente publicada é a de 2024.

**Limitações a reconhecer**
- Dados censitários são fotografias periódicas, não séries contínuas. Ocupações recentes podem não estar refletidas.
- A MUNIC registra a existência do instrumento, não sua efetividade.
- **Datar sempre a edição.** O dado de 59,4% dos 5.570 municípios sem instrumentos de planejamento e gerenciamento de riscos é da MUNIC 2017, divulgada em 05/07/2018. Não foi localizado percentual consolidado equivalente nas edições de 2020 ou 2024, portanto a afirmação precisa vir com a edição explícita, e não como retrato do presente.
- O setor censitário nem sempre coincide com o recorte operacional usado pela gestão municipal, o que exige decisão de agregação.

**Como será usada.** Indicadores de vulnerabilidade e recorte territorial da plataforma, além da fundamentação da motivação no pitch.

**Consultado em:** 17/09/2026

---

## 5. INMET _(etapa posterior)_

🔗 https://portal.inmet.gov.br

Dados de estações meteorológicas automáticas e convencionais, previsões e boletins. A incorporação está prevista para etapa posterior. A fonte é citada para registrar o caminho previsto, sem sustentar nenhuma afirmação da Parte 1.

---

## Quadro de dados verificados

Consultas realizadas em 17/09/2026. Só entram no pitch números que estejam completos aqui.

| # | Afirmação a sustentar | Valor | Fonte | Recorte territorial | Período |
|---|---|---|---|---|---|
| 1 | Participação dos desastres hidrológicos no total de protocolos | 38,52%, segundo grupo mais recorrente, atrás do climatológico (48,9%) | Atlas Digital de Desastres | Brasil | 1991 a 2025 |
| 2 | Ocorrências de alagamento, enxurrada e inundação no recorte piloto | 11 protocolos (1 óbito, 276 desabrigados ou desalojados, 3.077 afetados) | Atlas Digital de Desastres | Lavras/MG | 1991 a 2025 |
| 3 | Protocolos de desastre de todos os tipos no recorte piloto | 37, sendo 25 do grupo hidrológico | Atlas Digital de Desastres | Lavras/MG | 1991 a 2025 |
| 4 | População residente no recorte piloto | 104.761 | IBGE, Censo 2022 | Lavras/MG | 2022 |
| 5 | Municípios sem instrumentos de planejamento e gerenciamento de riscos | 59,4% de 5.570 | IBGE, MUNIC 2017 | Brasil | 2017 |
| 6 | Municípios monitorados pelo CEMADEN | 1.295 | CEMADEN/MCTI | Brasil | referência de 17/03/2026 |

**Endereços exatos dos dados acima**
- Atlas Digital de Desastres: https://atlasdigital.mdr.gov.br
- IBGE Cidades, panorama de Lavras: https://cidades.ibge.gov.br/brasil/mg/lavras/panorama
- CEMADEN, notícia com o número corrente: https://www.gov.br/cemaden/pt-br/assuntos/noticias-cemaden/cemaden-expande-rede-de-monitoramento-e-passa-a-monitorar-1-295-municipios
- IBGE, divulgação do dado da MUNIC 2017: https://agenciadenoticias.ibge.gov.br/agencia-noticias/2012-agencia-de-noticias/noticias/21633-desastres-naturais-59-4-dos-municipios-nao-tem-plano-de-gestao-de-riscos

---

## Checagem de links

Portais do governo federal mudam de endereço com alguma frequência. Conferir antes de cada apresentação.

| Fonte | Conferido em | Situação |
|---|---|---|
| CEMADEN, portal e mapa interativo | 17/09/2026 | No ar |
| Atlas Digital de Desastres | 17/09/2026 | No ar |
| S2ID | 17/09/2026 | No ar, bloqueia acesso automatizado |
| ANA, portal | 17/09/2026 | No ar |
| HidroWeb | 17/09/2026 | Redireciona para /apresentacao, endereço atualizado neste documento |
| IBGE, portal e Censo 2022 | 17/09/2026 | No ar |
| IBGE, MUNIC | 17/09/2026 | No ar, edição mais recente publicada é a de 2024 |
| INMET | 17/09/2026 | No ar |
