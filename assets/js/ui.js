import { downloadBlob, formatDate, toLocaleNumber } from './utils.js';

export class UIController {
  constructor({
    graphManager,
    filtersManager,
    statisticsManager,
    themeColors,
    datasetMetadata = {}
  }) {
    this.graphManager = graphManager;
    this.filtersManager = filtersManager;
    this.statisticsManager = statisticsManager;
    this.themeColors = themeColors;
    this.datasetMetadata = datasetMetadata;

    this.allNodes = [];
    this.allEdges = [];
    this.themeTotals = new Map();
    this.themeElements = new Map();
    this.legendLabelRefs = new Map();
    this.lastFiltered = { nodes: [], edges: [] };
    this.currentSmartSelectionMeta = null;
  }

  initialize(dataset) {
    this.allNodes = dataset.nodes || [];
    this.allEdges = dataset.edges || [];
    this.themeTotals = this.computeThemeTotals(this.allNodes);

    this.cacheDomElements();
    this.renderThemeFilters();
    this.renderLegend();
    this.attachEventListeners();
    this.renderDatasetMetadata();

    this.graphManager.onNodeSelect = (node) => this.showMetadata(node);
    this.graphManager.onNodeDeselect = () => this.hideMetadata();

    this.refreshView();
  }

  cacheDomElements() {
    this.searchForm = document.getElementById('search-form');
    this.searchInput = document.getElementById('search-input');
    this.searchClearButton = document.getElementById('search-clear');
    this.resultsIndicator = document.getElementById('results-indicator');

    this.themeFiltersContainer = document.getElementById('theme-filters');
    this.themeSummary = document.getElementById('theme-selection-summary');
    this.themeClearButton = document.getElementById('theme-clear-selection');
    this.legendContainer = document.getElementById('legend-items');

    this.startYearInput = document.getElementById('start-year-input');
    this.endYearInput = document.getElementById('end-year-input');
    this.resetButton = document.getElementById('reset-filters');

    this.togglePhysics = document.getElementById('toggle-physics');
    this.toggleLabels = document.getElementById('toggle-labels');

    this.statTotalArticles = document.getElementById('stat-total-articles');
    this.statTotalCitations = document.getElementById('stat-total-citations');
    this.statMostCited = document.getElementById('stat-most-cited');
    this.statByTheme = document.getElementById('stat-by-theme');
    this.statTimeline = document.getElementById('stat-timeline');

    this.exportJsonButton = document.getElementById('export-json');
    this.exportPngButton = document.getElementById('export-png');

    this.metadataPanel = document.getElementById('metadata-panel');
    this.metadataContent = document.getElementById('metadata-content');
    this.metadataTitle = document.getElementById('metadata-title');
    this.metadataTheme = document.getElementById('metadata-theme');
    this.metadataDate = document.getElementById('metadata-date');
    this.metadataDescription = document.getElementById('metadata-description');
    this.metadataCitations = document.getElementById('metadata-citations');
    this.metadataStatus = document.getElementById('metadata-status');
    this.metadataLink = document.getElementById('metadata-link');
    this.metadataClose = document.getElementById('metadata-close');
    this.metadataPlaceholder = document.getElementById('metadata-placeholder');

    this.datasetInfo = document.getElementById('dataset-info');
  }

  attachEventListeners() {
    if (this.searchForm) {
      this.searchForm.addEventListener('submit', (event) => {
        event.preventDefault();
        this.filtersManager.setSearchTerm(this.searchInput.value);
        this.refreshView(true);
      });
    }

    if (this.searchInput) {
      this.searchInput.addEventListener('input', () => {
        if (!this.searchInput.value) {
          this.filtersManager.setSearchTerm('');
          this.refreshView();
        }
      });
    }

    if (this.searchClearButton) {
      this.searchClearButton.addEventListener('click', () => {
        this.searchInput.value = '';
        this.filtersManager.setSearchTerm('');
        this.refreshView();
      });
    }

    if (this.startYearInput) {
      this.startYearInput.addEventListener('change', () => {
        const startYear = parseInt(this.startYearInput.value, 10);
        const endYear = this.filtersManager.getDateRange().end;
        this.filtersManager.setDateRange(Number.isInteger(startYear) ? startYear : null, endYear);
        this.refreshView();
      });
    }

    if (this.endYearInput) {
      this.endYearInput.addEventListener('change', () => {
        const endYear = parseInt(this.endYearInput.value, 10);
        const startYear = this.filtersManager.getDateRange().start;
        this.filtersManager.setDateRange(startYear, Number.isInteger(endYear) ? endYear : null);
        this.refreshView();
      });
    }

    if (this.resetButton) {
      this.resetButton.addEventListener('click', () => {
        this.filtersManager.reset();

        if (this.startYearInput) this.startYearInput.value = '';
        if (this.endYearInput) this.endYearInput.value = '';
        if (this.searchInput) this.searchInput.value = '';

        this.refreshView();
      });
    }

    if (this.themeClearButton) {
      this.themeClearButton.addEventListener('click', () => {
        this.filtersManager.clearSmartTheme();
        this.refreshView();
      });
    }

    if (this.togglePhysics) {
      this.togglePhysics.addEventListener('change', () => {
        this.graphManager.setPhysicsEnabled(this.togglePhysics.checked);
      });
    }

    if (this.toggleLabels) {
      this.toggleLabels.addEventListener('change', () => {
        this.graphManager.setLabelsVisible(this.toggleLabels.checked);
      });
    }

    if (this.exportJsonButton) {
      this.exportJsonButton.addEventListener('click', () => this.handleExportJson());
    }

    if (this.exportPngButton) {
      this.exportPngButton.addEventListener('click', () => this.handleExportPng());
    }

    if (this.metadataClose) {
      this.metadataClose.addEventListener('click', () => this.hideMetadata());
    }

    window.addEventListener('resize', () => this.graphManager.resize());
  }

  renderThemeFilters() {
    if (!this.themeFiltersContainer) {
      return;
    }

    this.themeFiltersContainer.innerHTML = '';
    this.themeElements.clear();

    const themes = this.filtersManager.getThemes();
    if (!themes.length) {
      const emptyMessage = document.createElement('p');
      emptyMessage.className = 'theme-empty-state';
      emptyMessage.textContent = 'Nenhum tema disponível.';
      this.themeFiltersContainer.appendChild(emptyMessage);
      this.updateThemeClearButtonState();
      this.updateThemeSummary(null);
      return;
    }

    themes.forEach((theme) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'theme-chip';
      button.dataset.theme = theme;
      button.setAttribute('aria-pressed', 'false');

      const swatch = document.createElement('span');
      swatch.className = 'theme-chip__swatch';
      swatch.style.backgroundColor = this.themeColors[theme] || '#94a3b8';

      const label = document.createElement('span');
      label.className = 'theme-chip__label';
      label.textContent = theme;

      const count = document.createElement('span');
      count.className = 'theme-chip__count';
      const total = this.themeTotals.get(theme) || 0;
      count.textContent = toLocaleNumber(total);
      count.title = `${toLocaleNumber(total)} artigos no total`;

      button.appendChild(swatch);
      button.appendChild(label);
      button.appendChild(count);

      button.addEventListener('click', () => {
        const currentTheme = this.filtersManager.getSmartTheme();
        if (currentTheme === theme) {
          this.filtersManager.clearSmartTheme();
        } else {
          this.filtersManager.setSmartTheme(theme);
        }
        this.refreshView();
      });

      this.themeFiltersContainer.appendChild(button);
      this.themeElements.set(theme, { button, label, count });
    });

    this.updateThemeClearButtonState();
    this.updateThemeSummary(this.currentSmartSelectionMeta);
  }

  renderLegend() {
    if (!this.legendContainer) {
      return;
    }

    this.legendContainer.innerHTML = '';
    this.legendLabelRefs.clear();

    const themes = Object.keys(this.themeColors).sort((a, b) => a.localeCompare(b));
    themes.forEach((theme) => {
      const item = document.createElement('div');
      item.className = 'legend-item';

      const swatch = document.createElement('span');
      swatch.className = 'legend-swatch';
      swatch.style.backgroundColor = this.themeColors[theme];

      const label = document.createElement('span');
      label.className = 'legend-label';
      label.textContent = theme;

      item.appendChild(swatch);
      item.appendChild(label);

      this.legendContainer.appendChild(item);
      this.legendLabelRefs.set(theme, label);
    });
  }

  updateThemeClearButtonState() {
    if (!this.themeClearButton) {
      return;
    }

    const hasSmartSelection = this.filtersManager.hasSmartThemeSelection();
    this.themeClearButton.disabled = !hasSmartSelection;
    this.themeClearButton.setAttribute('aria-disabled', hasSmartSelection ? 'false' : 'true');
  }

  updateThemeSummary(meta) {
    if (!this.themeSummary) {
      return;
    }

    if (meta) {
      if (!meta.totalCount) {
        this.themeSummary.textContent = `Tema "${meta.theme}" sem artigos nos filtros atuais.`;
        return;
      }

      const contextFragment = meta.contextCount
        ? ` e ${toLocaleNumber(meta.contextCount)} conexões diretas`
        : '';
      const fallbackFragment = meta.fallbackApplied
        ? ' Alguns artigos fora dos filtros de busca foram mantidos para preservar o contexto.'
        : '';

      this.themeSummary.textContent = `Tema "${meta.theme}": ${toLocaleNumber(
        meta.primaryCount
      )} artigos${contextFragment}. ${toLocaleNumber(meta.totalCount)} nós visíveis.${fallbackFragment}`;
      return;
    }

    this.themeSummary.textContent =
      'Todos os temas visíveis. Clique em um tema para destacar os artigos e as conexões relacionadas.';
  }

  renderDatasetMetadata() {
    if (!this.datasetInfo) {
      return;
    }

    const generatedAt = this.datasetMetadata.generated_at
      ? formatDate(this.datasetMetadata.generated_at)
      : 'data não informada';

    const source = this.datasetMetadata.source || 'Fonte original não informada';

    this.datasetInfo.textContent = `Dados atualizados em ${generatedAt} · Fonte: ${source}`;
  }

  refreshView(focusFirst = false) {
    const filtered = this.filtersManager.apply(this.allNodes, this.allEdges);
    const stats = this.statisticsManager.compute(filtered.nodes, filtered.edges);

    this.lastFiltered = { nodes: filtered.nodes, edges: filtered.edges };
    this.currentSmartSelectionMeta = filtered.meta?.smartSelection || null;

    this.graphManager.updateData(filtered.nodes, filtered.edges, stats.incomingMap);
    this.updateResultsIndicator(filtered.nodes.length);
    this.updateThemeCounts(stats.articlesByTheme);
    this.updateLegendCounts(stats.articlesByTheme);
    this.renderStats(stats);
    this.updateThemeSummary(this.currentSmartSelectionMeta);
    this.updateThemeClearButtonState();

    if (focusFirst && filtered.nodes.length) {
      this.graphManager.focusOnNode(filtered.nodes[0].id);
    }

    if (!filtered.nodes.length) {
      this.hideMetadata();
    }
  }

  updateResultsIndicator(filteredCount) {
    if (!this.resultsIndicator) {
      return;
    }

    const smartMeta = this.currentSmartSelectionMeta;
    if (smartMeta) {
      if (!smartMeta.totalCount) {
        this.resultsIndicator.textContent = `Tema "${smartMeta.theme}" sem resultados combinados para os filtros atuais.`;
        return;
      }

      const contextFragment = smartMeta.contextCount
        ? ` + ${toLocaleNumber(smartMeta.contextCount)} conexões diretas`
        : '';
      const fallbackFragment = smartMeta.fallbackApplied
        ? ' (incluindo artigos fora da busca para preservar o contexto).'
        : '.';

      this.resultsIndicator.textContent = `Tema "${smartMeta.theme}" ativo: ${toLocaleNumber(
        smartMeta.primaryCount
      )} artigos${contextFragment}. ${toLocaleNumber(smartMeta.totalCount)} nós exibidos${fallbackFragment}`;
      return;
    }

    const total = this.allNodes.length;
    const term = this.filtersManager.getSearchTerm();
    const { start, end } = this.filtersManager.getDateRange();
    const hasThemeFilter =
      this.filtersManager.getActiveThemes().length !== this.filtersManager.getThemes().length;

    const filtersActive =
      filteredCount !== total ||
      term.length > 0 ||
      (start !== null && start !== undefined) ||
      (end !== null && end !== undefined) ||
      hasThemeFilter;

    if (!filtersActive) {
      this.resultsIndicator.textContent = `Exibindo ${toLocaleNumber(total)} artigos (visualização completa).`;
      return;
    }

    this.resultsIndicator.textContent = `Exibindo ${toLocaleNumber(filteredCount)} de ${toLocaleNumber(
      total
    )} artigos com os filtros aplicados.`;
  }

  updateThemeCounts(filteredThemeStats) {
    const filteredMap = new Map(filteredThemeStats.map((item) => [item.theme, item.count]));
    const selectedTheme = this.filtersManager.getSmartTheme();

    this.themeElements.forEach((elements, theme) => {
      const { button, label, count } = elements;
      const total = this.themeTotals.get(theme) || 0;
      const filteredCount = filteredMap.get(theme) || 0;

      if (label) {
        label.textContent = theme;
      }

      if (count) {
        const formattedFiltered = toLocaleNumber(filteredCount);
        const formattedTotal = toLocaleNumber(total);
        count.textContent = `${formattedFiltered}/${formattedTotal}`;
        count.title = `${formattedFiltered} de ${formattedTotal} artigos visíveis`;
      }

      if (button) {
        const isSelected = selectedTheme === theme;
        button.classList.toggle('is-selected', isSelected);
        button.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
        button.classList.toggle('has-results', filteredCount > 0);
      }
    });
  }

  updateLegendCounts(filteredThemeStats) {
    const filteredMap = new Map(filteredThemeStats.map((item) => [item.theme, item.count]));

    this.legendLabelRefs.forEach((label, theme) => {
      if (!label) return;
      const count = filteredMap.get(theme);
      if (count) {
        label.textContent = `${theme} (${toLocaleNumber(count)})`;
      } else {
        label.textContent = theme;
      }
    });
  }

  renderStats(stats) {
    if (this.statTotalArticles) {
      this.statTotalArticles.textContent = toLocaleNumber(stats.totalArticles);
    }

    if (this.statTotalCitations) {
      this.statTotalCitations.textContent = toLocaleNumber(stats.totalCitations);
    }

    if (this.statMostCited) {
      this.renderMostCited(stats.mostCited);
    }

    if (this.statByTheme) {
      this.renderThemeStats(stats.articlesByTheme);
    }

    if (this.statTimeline) {
      this.renderTimeline(stats.timeline);
    }
  }

  renderMostCited(items = []) {
    this.statMostCited.innerHTML = '';
    if (!items.length) {
      const li = document.createElement('li');
      li.textContent = 'Sem citações disponíveis no filtro atual.';
      this.statMostCited.appendChild(li);
      return;
    }

    items.forEach((item) => {
      const li = document.createElement('li');
      const year = item.year ? ` · ${item.year}` : '';
      li.textContent = `${item.title}${year} — ${toLocaleNumber(item.count)} citações`;
      this.statMostCited.appendChild(li);
    });
  }

  renderThemeStats(items = []) {
    this.statByTheme.innerHTML = '';
    if (!items.length) {
      const li = document.createElement('li');
      li.textContent = 'Sem artigos para os filtros selecionados.';
      this.statByTheme.appendChild(li);
      return;
    }

    items.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = `${item.theme}: ${toLocaleNumber(item.count)}`;
      this.statByTheme.appendChild(li);
    });
  }

  renderTimeline(items = []) {
    this.statTimeline.innerHTML = '';
    if (!items.length) {
      const li = document.createElement('li');
      li.textContent = 'Nenhum ano correspondente aos filtros.';
      this.statTimeline.appendChild(li);
      return;
    }

    items.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = `${item.year}: ${toLocaleNumber(item.count)} artigos`;
      this.statTimeline.appendChild(li);
    });
  }

  showMetadata(node) {
    if (!this.metadataPanel) {
      return;
    }

    this.metadataPanel.classList.add('is-visible');
    if (this.metadataPlaceholder) {
      this.metadataPlaceholder.hidden = true;
    }
    if (this.metadataContent) {
      this.metadataContent.hidden = false;
    }

    if (this.metadataTitle) this.metadataTitle.textContent = node.title;
    if (this.metadataTheme) this.metadataTheme.textContent = node.theme;
    if (this.metadataDate) this.metadataDate.textContent = formatDate(node.publishedAt || node.listedDate);
    if (this.metadataCitations) this.metadataCitations.textContent = `${toLocaleNumber(node.citations || 0)} citações recebidas`;

    if (this.metadataStatus) {
      const availability = node.available === false ? 'Indisponível' : 'Disponível';
      const statusCode = node.statusCode ? ` · HTTP ${node.statusCode}` : '';
      this.metadataStatus.textContent = `${availability}${statusCode}`;
    }

    if (this.metadataDescription) {
      this.metadataDescription.textContent = 'Descrição não fornecida no dataset. Consulte o artigo para mais detalhes.';
    }

    if (this.metadataLink) {
      this.metadataLink.href = node.url;
      this.metadataLink.textContent = 'Abrir artigo no Poder360';
    }
  }

  hideMetadata() {
    if (!this.metadataPanel) {
      return;
    }
    this.metadataPanel.classList.remove('is-visible');
    if (this.metadataPlaceholder) {
      this.metadataPlaceholder.hidden = false;
    }
    if (this.metadataContent) {
      this.metadataContent.hidden = true;
    }
  }

  handleExportJson() {
    const smartSelection = this.filtersManager.getSmartSelectionMeta();
    const payload = {
      exported_at: new Date().toISOString(),
      metadata: this.datasetMetadata,
      active_filters: {
        themes: this.filtersManager.getActiveThemes(),
        search: this.filtersManager.getSearchTerm(),
        dateRange: this.filtersManager.getDateRange(),
        smartSelection
      },
      nodes: this.lastFiltered.nodes,
      edges: this.lastFiltered.edges
    };

    downloadBlob(
      JSON.stringify(payload, null, 2),
      `paula-schmitt-network-v2-${Date.now()}.json`,
      'application/json'
    );
  }

  handleExportPng() {
    const dataUrl = this.graphManager.capturePng();
    if (!dataUrl) {
      alert('Não foi possível exportar a visualização no momento.');
      return;
    }

    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `paula-schmitt-network-v2-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  computeThemeTotals(nodes) {
    const map = new Map();
    nodes.forEach((node) => {
      const theme = node.theme || 'Sem tema';
      map.set(theme, (map.get(theme) || 0) + 1);
    });
    return map;
  }
}
