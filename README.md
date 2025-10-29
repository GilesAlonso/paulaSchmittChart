# Paula Schmitt Articles Network

## Project overview
This repository hosts interactive network visualizations that map how Brazilian journalist Paula Schmitt interconnects her opinion pieces. Each article is represented as a node and edges highlight references and thematic relationships between the texts. The default experience is the second-generation interface (V2) served from `index.html`, while the original HTML-only graph is preserved as `index-v1.html` for archival access.

## Available visualizations
- `index.html` — Visualização principal (V2) com filtros por tema, busca textual, metadados, exportações e um layout responsivo construído com JavaScript modular.
- `index-v1.html` — Visualização legada (V1) que mantém o dataset embutido em HTML e a experiência original utilizada nas primeiras versões do projeto.

## Tech stack
### Front-end
- **vis-network** (v9.1.2) renderiza os grafos force-directed interativos.
- **JavaScript moderno (ES modules)** localizado em `assets/js/` para orquestrar carregamento de dados, filtros, estatísticas, UI e rede.
- **CSS personalizado** (`assets/css/v2.css`) oferece o layout responsivo, controles e melhorias de acessibilidade da V2.
- **Bootstrap 5** continua presente na visualização legada V1 para o layout da legenda e componentes originais.

### Data collection & automation
- **Python 3, BeautifulSoup 4 e Requests** alimentam o scraper (`scripts/paula_schmitt_scraper.py`) que constrói o dataset canônico.
- **GitHub Actions** (`.github/workflows/paula-schmitt-scraper.yml`) executa o scraper toda segunda-feira às 05:00 UTC (e sob demanda), commitando alterações em `data/paula-schmitt-network-v2.json` quando novos artigos ou relações são encontrados.

## Architecture

### V2 (index.html)
A interface promovida é estruturada como um aplicativo modular:

```
index.html
assets/
  css/v2.css
  js/
    dataLoader.js      // busca e normaliza o dataset e suas cores
    graph.js           // encapsula a configuração do vis-network
    filters.js         // lógica de filtros por tema, busca e período
    statistics.js      // contadores e métricas derivadas
    ui.js              // binding de DOM, eventos e acessibilidade
    utils.js           // utilitários compartilhados (formatação, truncamento, etc.)
data/
  paula-schmitt-network-v2.json  // dataset canônico gerado pelo scraper
```

`index.html` carrega a folha de estilos, inicializa os módulos e requisita o dataset via `fetch`. `GraphManager` aplica a física do vis-network, `FiltersManager` controla filtros e foco temático, `StatisticsManager` deriva contagens, e `UIController` sincroniza o DOM, a legenda, o painel de metadados e as ações de exportação.

### Legacy V1 (index-v1.html)
O arquivo legado mantém a implementação original em uma única página com arrays embutidos de nós e arestas, funções de destaque de vizinhança/filtragem e inicialização direta do vis-network. Ele permanece funcionalmente inalterado, exceto pelo banner que aponta para a visualização principal.

## Key V2 features
- Filtros por tema com modo de foco, seleção/limpeza rápidas e busca dentro da lista de temas.
- Busca textual e filtro por intervalo de anos que podem ser combinados com as seleções de temas.
- Estatísticas dinâmicas para contagem de artigos, citações, distribuição por tema e linha do tempo de publicações.
- Visualização das fontes externas mais citadas pela autora como nós quadrados, com estatísticas dedicadas e painel informativo.
- Painel de metadados com tema, datas de publicação, status de disponibilidade, contagem de citações e link direto para o artigo.
- Exportação do conjunto filtrado em JSON e captura do grafo como PNG.
- Layout responsivo com legenda adaptativa, indicações de scroll para dispositivos touch e tamanhos sensíveis ao viewport.
- Exposição de metadados do dataset (fonte, totais, timestamp de geração) diretamente na interface.
- Atualização automática semanal dos dados através do workflow do GitHub Actions.

## Legacy V1 capabilities
A visualização legada preserva:
- A legenda estática com cores associadas aos temas editoriais.
- Funções de destaque de vizinhança que esmaecem nós não relacionados e restauram rótulos ao redor do artigo selecionado.
- Utilitários de filtragem programática e handlers que abrem artigos em novas abas.
- Configuração do ForceAtlas2 exposta pelo painel de ajustes do vis-network.

## Dataset reference
O dataset da V2 salvo em `data/paula-schmitt-network-v2.json` segue esta estrutura:

```json
{
  "metadata": {
    "generated_at": "2025-10-24T04:12:49Z",
    "source": "https://www.poder360.com.br/author/paula-schmitt/",
    "total_nodes": 298,
    "total_edges": 312,
    "total_articles": 214,
    "total_external_sources": 84,
    "min_external_citation_threshold": 2,
    "max_external_coverage_threshold": 0.8
  },
  "nodes": [
    {
      "id": "https://www.poder360.com.br/opiniao/exemplo/",
      "type": "article",
      "title": "Título do artigo",
      "url": "https://www.poder360.com.br/opiniao/exemplo/",
      "published_at": "2024-08-14T05:50:00-03:00",
      "listed_date": "2024-08-14",
      "theme": "Brasil",
      "available": true,
      "status_code": 200
    },
    {
      "id": "https://www.youtube.com/watch?v=abcd1234",
      "type": "external_source",
      "title": "Entrevista com XYZ",
      "domain": "youtube.com",
      "source_name": "YouTube",
      "citation_count": 5,
      "coverage": 0.18,
      "summary": "Texto frequente utilizado nas citações: “Assista à íntegra”",
      "url": "https://www.youtube.com/watch?v=abcd1234"
    }
  ],
  "edges": [
    {
      "source": "https://www.poder360.com.br/opiniao/exemplo/",
      "target": "https://www.poder360.com.br/opiniao/outro-exemplo/"
    }
  ]
}
```

- Artigos (`type: "article"`) preservam os campos clássicos de tema, datas, disponibilidade e URL canônico.
- Fontes externas (`type: "external_source"`) incluem o domínio normalizado, um rótulo amigável (`source_name`), o número de artigos que a citam (`citation_count`), a cobertura percentual no corpus (`coverage`), além de `anchor_text` e a lista `cited_by` com os artigos associados.

`assets/js/dataLoader.js` transforma o JSON na estrutura esperada pelo vis-network (incluindo cores derivadas, rótulos truncados e extração do ano). A visualização legada V1 continua a consumir seus próprios arrays estáticos embutidos em `index-v1.html`.

## Updating the dataset manually
1. Garanta o Python 3.11+ e instale as dependências: `pip install -r requirements.txt`.
2. Execute o scraper a partir da raiz do repositório: `python scripts/paula_schmitt_scraper.py --log-level INFO --min-external-citations 2 --max-external-coverage 0.8` (os parâmetros adicionais são opcionais e permitem ajustar os filtros de fontes externas).
3. Revise o arquivo `data/paula-schmitt-network-v2.json`, faça o staging das mudanças e crie o commit.

O workflow agendado repetirá os mesmos passos toda semana e fará push automático quando detectar diferenças.

## Local development
- Como a V2 faz `fetch` do dataset, sirva o projeto em um servidor HTTP estático (por exemplo, `python -m http.server 8000`) e abra `http://localhost:8000/index.html` em um navegador moderno.
- A visualização legada V1 ainda pode ser aberta diretamente via filesystem (`index-v1.html`) se necessário.
- Não há etapa de build: ambas as visualizações são ativos estáticos que podem ser hospedados no GitHub Pages ou em qualquer serviço de arquivos estáticos.
