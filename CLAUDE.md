# CLAUDE.md — GeoQuote (Lypsyos)

Fonte de verdade sobre arquitetura e decisões de projeto. Para instruções de setup/instalação, ver `README.md`.

## Stack

- **Backend**: FastAPI + SQLAlchemy 2.x + SQLite (`backend-orcamentos/geoquote.db`, arquivo local, não versionado). Modelos/rotas CRUD/motor de cálculo/DXF (`ezdxf`) em `main.py`; nesting 2D (`rectpack`) isolado em `nesting.py`.
- **Frontend**: React 19 + Vite + Tailwind v4. Componente único `front-orcamentos/src/App.jsx` (~1300+ linhas, sem roteador — 3 "telas" controladas por state: `formulario`, `parametrizacao`, `resultado`). Estilos utilitários Tailwind + um punhado de classes customizadas em `App.css`.
- Não há autenticação, é uma ferramenta interna de orçamento para uma máquina de corte a laser/plasma.

## Rodando localmente

```bash
cd backend-orcamentos && source venv/bin/activate && uvicorn main:app --reload   # http://localhost:8000
cd front-orcamentos && npm run dev                                              # http://localhost:5173
```

O frontend chama a API via URL hardcoded `http://localhost:8000` (constante `API_BASE` em `App.jsx`).

## Schema do banco de dados

Três tabelas independentes, propositalmente separadas (ver "Decisões arquiteturais" abaixo):

- **`materiais`** (`MaterialDB`): `id, nome, espessura, precoKg, densidade`. Chave natural de upsert: `(nome, espessura)`.
- **`maquinas_params`** (`MaquinaParamDB`): `id, maquina, material, espessura, velocidadeCorte, tempoPiercing, tempoSetup, valorHora`. Chave natural de upsert: `(maquina, material, espessura)`. O campo `material` é um link "fraco" (string) para `materiais.nome` — não há FK real.
- **`perfis_tributarios`** (`PerfilTributarioDB`): `id, nome, imposto_perc`. Chave natural de upsert: `nome`.

Todas as rotas `POST /materiais`, `POST /maquinas-params`, `POST /perfis-tributarios` fazem upsert pela chave natural (busca por essa chave; se existe, atualiza; senão, cria). `Base.metadata.create_all()` roda no import do módulo, seguido de `seed_dados_iniciais()` — que só insere dados de exemplo se a tabela correspondente estiver vazia (idempotente, seguro rodar toda vez que o processo sobe).

As dimensões de chapa (`largura`/`comprimento`, e agora `margem`/`offsetPeca` — ver seção Nesting) **não são persistidas**: são digitadas no modal "Dimensões de Chapa" a cada orçamento e viajam no payload de `/calcular-orcamento`. Isso é intencional, mesmo padrão usado desde antes deste documento existir — chapa/margem/offset são tratados como parâmetros por-orçamento, não cadastro fixo.

## Decisões arquiteturais

- **Por que 3 tabelas de parâmetros em vez de uma:** o cadastro original misturava Preço/Kg (muda toda semana, é decisão de compras) com Velocidade/R$-hora (quase fixos, decisão de engenharia) num único registro por combinação máquina+material+espessura. Isso obrigava reeditar registro por registro sempre que o aço mudava de preço. Separar em Material (mercado) / Máquina-Corte (engenharia) / Perfil Tributário (faturamento) deixa cada tabela mudar no seu próprio ritmo. O join entre `materiais` e `maquinas_params` acontece no frontend (`parametroAtual` em `App.jsx`), não no backend.
- **Por que o dropdown de Espessura às vezes aparece vazio:** ele reflete apenas combinações Máquina+Material que já têm uma linha em `maquinas_params`. Cadastrar uma espessura só em `materiais` (aba Matéria-prima) não a torna selecionável até existir também o parâmetro de corte correspondente em `maquinas_params` (aba Máquina & Corte). O frontend avisa quando essa lacuna existe (ver aba "Máquina & Corte" e mensagens de estado vazio no formulário de peça).
- **Nesting é retangular na camada de bin-packing, não poligonal genérico:** a alocação de itens na chapa (`rectpack`) continua operando só sobre bounding boxes (mesmo quando a peça é importada de DXF — o backend só extrai perímetro/área/bounding box do DXF, não guarda o contorno real). NFP (No-Fit-Polygon) genérico — colisão polígono-a-polígono arbitrária, via Shapely/pyclipper — foi avaliado e descartado de novo por complexidade/tempo (é um projeto de pesquisa em si). **Exceção parcial, deliberada:** triângulos (`tipoPeca == 'T'`) têm identidades geométricas EXATAS de ladrilhamento — dois triângulos "reto" pareados ao longo da hipotenusa ladrilham um retângulo `base x altura` com 0% de desperdício; triângulos "isósceles" ladrilham em fileira alternada (apex-up/apex-down, passo `base/2`) com aproveitamento exato `N/(N+1)` para N peças na fileira. Esse pré-processamento (`nesting.py::_compor_itens_triangulo`) roda ANTES do `rectpack` e entrega blocos compostos já densos — é matemática fechada, não busca/heurística, então não reabre a questão do NFP genérico. Ver `backend-orcamentos/nesting.py`.
- **Tema visual:** paleta definida em `App.css` (`--gq-dark-bg`, `--gq-navy-panel`, `--gq-orange-accent`, `--panel-gradient`) é o design system "oficial" da marca (laranja + preto). Historicamente só o header usava o tema escuro; a tela de inserção de peça foi migrada para usar `.panel-dark`/`.input-dark` (ver `App.css`) para ficar consistente com essa identidade. As telas "Parâmetros Globais" e "Resultado"/impressão permanecem no tema claro por enquanto.

## Motor de orçamento (`POST /calcular-orcamento`)

Recebe `cliente, imposto, comissao, margemLucro, frete, pecas[], configChapas{espessura: {largura, comprimento, margem, offsetPeca}}`. Para cada peça calcula tempo de corte (perímetro/velocidade + piercing por furo + setup único por espessura) e custo de material (peso × preço/kg). Agrupa por espessura, roda nesting real (`nestear_pecas` em `nesting.py`) para determinar quantas chapas são necessárias, e aplica markup/comissão/imposto sobre o custo de produção total. `imposto` chega pronto do frontend (já resolvido a partir do Perfil de Faturamento escolhido).

O campo `fatorNesting` do payload é herdado do modelo antigo (heurística área/eficiência) e não é mais usado — a contagem de chapas agora vem 100% do nesting real. Mantido no schema só para não quebrar o frontend; pode ser removido dos dois lados no futuro se ninguém mais depender dele.

Cada item de `detalhamento_espessuras` no retorno inclui, além dos totais de custo/tempo: `chapa_largura`, `chapa_comprimento`, `chapa_margem` (os valores efetivamente usados, já com fallback para 1200x3000/10mm se o frontend não mandou `configChapas` para aquela espessura), métricas de **Controle de Sobras** (`chapa_area_total_mm2`, `kerf_perda_area_mm2`, `sucata_area_mm2`, `sucata_peso_kg`, `utilizacao_pct` — informativas; o custo de material já fatura a chapa inteira, então a sobra já está paga, isso não gera cobrança nova) e `nesting: {chapas_necessarias, chapas: [{placements: [{id, x, y, width, height, rotated, invertido}]}]}` — coordenadas já absolutas na chapa real (mm), prontas para desenhar sem transformação adicional no frontend. `totais_globais` tem os agregados equivalentes: `sucata_peso_total_kg`, `sucata_area_total_mm2`, `utilizacao_media_pct`.

### Nesting (`backend-orcamentos/nesting.py`)

`nestear_pecas(pecas, largura_chapa, comprimento_chapa, margem, offset_peca)` — usa `rectpack` (`newPacker(rotation=True)`, multi-bin). Peças não-triângulo (R/Q/C) são expandidas em `qtd` retângulos individuais `(dimA + offset_peca) x (dimB + offset_peca)`, como sempre. Triângulos (`tipoPeca` em `pecas[i]`, precisa vir junto de `tipoTriangulo`) passam primeiro por `_compor_itens_triangulo`, que agrupa por `(tipoTriangulo, base, altura)` idênticos e devolve pares/fileiras compostos (ver decisão arquitetural acima) — só esses itens compostos (ou a sobra individual, se ímpar) chegam ao `packer.add_rect`. Depois do `packer.pack()`, um item composto é expandido de volta em N `placements` (um por triângulo membro), usando a mesma transformação de rotação 90° já usada para o item inteiro; cada placement de triângulo ganha `invertido: bool` (indica se o desenho deve usar o conjunto de vértices complementar — ver `verticesTriangulo` em `nestingUtils.js`). O padding (`offset_peca`) é subtraído de volta na posição final do item (par/fileira ou peça avulsa) para que o espaçamento visual entre itens seja exatamente `offset_peca` — mas NÃO existe padding entre os membros DENTRO de um item composto (eles interligam sem vão, por design). Levanta `NestingError` (capturada em `main.py` e convertida em `HTTPException 400`, nunca 500) quando: a margem é maior que a própria chapa, um item (peça avulsa ou par/fileira de triângulo) não cabe na área útil nem rotacionado, ou o total de itens pós-composição de uma espessura passa de `LIMITE_INSTANCIAS` (2000 — trava de segurança para não travar a API síncrona com lotes gigantes; pares/fileiras contam como 1 item cada, não pela contagem bruta de peças físicas). O frontend (`handleSalvar` em `App.jsx`) mostra o `detail` desse erro 400 direto num `alert()` e reabre o modal de configuração de chapa.

## Convenções de código

- Backend e frontend são monólitos de um arquivo por design até agora — só extrair módulo novo (como `nesting.py`) quando a lógica for autocontida o suficiente para não precisar ficar importando meio-a-meio com `main.py`.
- Nomes de variáveis/labels em português (domínio de negócio brasileiro: impostos, chapas, furos etc.), nomes de infraestrutura (funções fetch, constantes) em português também, seguindo o padrão já estabelecido no arquivo.
- CRUD upsert pela chave natural (não por id) é o padrão em todas as rotas de cadastro — mantenha essa convenção em rotas novas.
