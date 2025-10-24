import { downloadBlob, formatDate, toLocaleNumber } from './utils.js';

const FILTERS_STORAGE_KEY = 'ps-v2-filters-state';

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
    this.nodeThemeMap = new Map();

    this.themeTotals = new Map();
    this.themeOptionRefs = new Map();
    this.legendLabelRefs = new Map();

    this.lastFiltered = { nodes: [], edges: [], context: null };

    this.storageKey = FILTERS_STORAGE_KEY;
    this.themeSearchTerm = '';
    this.isRestoringState = false;
  }

  initialize(dataset) {
    this.allNodes = dataset.nodes || [];
    this.allEdges = dataset.edges || [];
    this.nodeThemeMap = new Map(this.allNodes.map((node) => [node.id, node.theme]));
    this.themeTotals = this.filtersManager.getThemeTotals();

    const persistedState = this.loadPersistedFilters();
    if (persistedState) {
      this.isRestoringState = true;
      this.applyPersistedFilters(persistedState);
    }

    this.cacheDomElements();
    this.renderThemeFilters();
    this.renderLegend();
    this.attachEventListeners();
    this.renderDatasetMetadata();

    if (persistedState) {
      this.applyPersistedInputs(persistedState);
      this.isRestoringState = false;
    }

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
    this.themeSearchInput = document.getElementById('theme-search-input');
    this.themeSelectAllButton = document.getElementById('theme-select-all');
    this.themeClearAllButton = document.getElementById('theme-deselect-all');
    this.themeFocusIndicator = document.getElementById('theme-focus-indicator');
    this.themeFocusLabel = document.getElementById('theme-focus-label');
    this.themeFocusClearButton = document.getElementById('theme-focus-clear');
    this.themeEmptyState = document.getElementById('theme-empty-state');

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
        this.persistFilters();
      });
    }

    if (this.searchInput) {
      this.searchInput.addEventListener('input', () => {
        if (!this.searchInput.value) {
          this.filtersManager.setSearchTerm('');
          this.refreshView();
          this.persistFilters();
        }
      });
    }

    if (this.searchClearButton) {
      this.searchClearButton.addEventListener('click', () => {
        this.searchInput.value = '';
        this.filtersManager.setSearchTerm('');
        this.refreshView();
        this.persistFilters();
      });
    }

    if (this.themeSearchInput) {
      this.themeSearchInput.addEventListener('input', () => {
        this.themeSearchTerm = this.themeSearchInput.value.trim().toLowerCase();
        this.applyThemeSearchFilter();
      });
    }

    if (this.themeSelectAllButton) {
      this.themeSelectAllButton.addEventListener('click', () => {
        this.filtersManager.setAllThemes(true);
        this.themeOptionRefs.forEach((refs) => {
          refs.checkbox.checked = true;
          refs.checkbox.indeterminate = false;
          refs.element.dataset.active = 'true';
        });

        this.refreshView();
        this.persistFilters();
      });
    }

    if (this.themeClearAllButton) {
      this.themeClearAllButton.addEventListener('click', () => {
        this.filtersManager.setAllThemes(false);
        this.themeOptionRefs.forEach((refs) => {
          refs.checkbox.checked = false;
          refs.checkbox.indeterminate = false;
          refs.element.dataset.active = 'false';
          refs.element.dataset.focused = 'false';
          refs.element.dataset.related = 'false';
        });
        this.updateFocusIndicator(null);
        this.refreshView();
        this.persistFilters();
      });
    }

    if (this.themeFocusClearButton) {
      this.themeFocusClearButton.addEventListener('click', () => {
        this.filtersManager.clearFocus();
        this.updateFocusIndicator(null);
        this.refreshView();
        this.persistFilters();
      });
    }

    if (this.startYearInput) {
      this.startYearInput.addEventListener('change', () => {
        const startYear = parseInt(this.startYearInput.value, 10);
        const endYear = this.filtersManager.getDateRange().end;
        this.filtersManager.setDateRange(Number.isInteger(startYear) ? startYear : null, endYear);
        this.refreshView();
        this.persistFilters();
      });
    }

    if (this.endYearInput) {
      this.endYearInput.addEventListener('change', () => {
        const endYear = parseInt(this.endYearInput.value, 10);
        const startYear = this.filtersManager.getDateRange().start;
        this.filtersManager.setDateRange(startYear, Number.isInteger(endYear) ? endYear : null);
        this.refreshView();
        this.persistFilters();
      });
    }

    if (this.resetButton) {
      this.resetButton.addEventListener('click', () => {
        this.filtersManager.reset();

        if (this.startYearInput) this.startYearInput.value = '';
        if (this.endYearInput) this.endYearInput.value = '';
        if (this.searchInput) this.searchInput.value = '';
        if (this.themeSearchInput) {
          this.themeSearchInput.value = '';
          this.themeSearchTerm = '';
        }

        this.themeOptionRefs.forEach((refs) => {
          refs.checkbox.checked = true;
          refs.checkbox.indeterminate = false;
          refs.element.dataset.active = 'true';
          refs.element.dataset.focused = 'false';
          refs.element.dataset.related = 'false';
        });

        this.applyThemeSearchFilter();
        this.updateFocusIndicator(null);
        this.refreshView();
        this.persistFilters();
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
    this.themeOptionRefs.clear();

    const fragment = document.createDocumentFragment();

    this.filtersManager.getThemes().forEach((theme) => {
      const totalCount = this.themeTotals.get(theme) || 0;
      const option = this.createThemeOption(theme, totalCount);
      fragment.appendChild(option);
    });

    this.themeFiltersContainer.appendChild(fragment);
    this.applyThemeSearchFilter();
    this.updateFocusIndicator(this.filtersManager.getFocusedTheme());
  }

  createThemeOption(theme, totalCount) {
    const option = document.createElement('div');
    option.className = 'theme-option';
    option.dataset.theme = theme;
    option.dataset.active = this.filtersManager.isThemeActive(theme) ? 'true' : 'false';
    option.dataset.focused = 'false';
    option.dataset.related = 'false';

    const selectWrapper = document.createElement('div');
    selectWrapper.className = 'theme-option__select';

    const checkboxId = `theme-${theme.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = checkboxId;
    checkbox.checked = this.filtersManager.isThemeActive(theme);
    checkbox.dataset.theme = theme;

    const swatch = document.createElement('span');
    swatch.className = 'theme-swatch';
    swatch.style.backgroundColor = this.themeColors[theme] || '#94a3b8';

    const label = document.createElement('label');
    label.className = 'theme-label';
    label.setAttribute('for', checkboxId);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'theme-label__name';
    nameSpan.textContent = theme;

    const countSpan = document.createElement('span');
    countSpan.className = 'theme-label__count';
    countSpan.textContent = `(${toLocaleNumber(totalCount)})`;

    label.appendChild(nameSpan);
    label.appendChild(countSpan);

    selectWrapper.appendChild(checkbox);
    selectWrapper.appendChild(swatch);
    selectWrapper.appendChild(label);

    const focusButton = document.createElement('button');
    focusButton.type = 'button';
    focusButton.className = 'theme-option__focus';
    focusButton.dataset.theme = theme;
    focusButton.setAttribute('aria-pressed', 'false');
    focusButton.textContent = 'Focar';

    checkbox.addEventListener('change', () => this.handleThemeCheckboxChange(theme, checkbox.checked));
    focusButton.addEventListener('click', () => this.handleFocusToggle(theme));

    option.appendChild(selectWrapper);
    option.appendChild(focusButton);

    this.themeOptionRefs.set(theme, {
      element: option,
      checkbox,
      nameSpan,
      countSpan,
      focusButton,
      searchValue: theme.toLowerCase()
    });

    return option;
  }

  handleThemeCheckboxChange(theme, isChecked) {
    this.filtersManager.setThemeState(theme, isChecked);
    const refs = this.themeOptionRefs.get(theme);
    if (refs) {
      refs.element.dataset.active = isChecked ? 'true' : 'false';
      refs.checkbox.indeterminate = false;
    }

    this.refreshView();
    this.persistFilters();
  }

  handleFocusToggle(theme) {
    const previousFocus = this.filtersManager.getFocusedTheme();
    const newFocus = this.filtersManager.toggleFocus(theme);

    const refs = this.themeOptionRefs.get(theme);
    if (refs && newFocus === theme) {
      refs.checkbox.checked = true;
      refs.element.dataset.active = 'true';
    }

    if (previousFocus && previousFocus !== newFocus) {
      const previousRefs = this.themeOptionRefs.get(previousFocus);
      if (previousRefs) {
        previousRefs.element.dataset.focused = 'false';
        previousRefs.focusButton.setAttribute('aria-pressed', 'false');
        previousRefs.focusButton.textContent = 'Focar';
      }
    }

    this.updateFocusIndicator(newFocus);
    this.refreshView();
    this.persistFilters();
  }

  updateFocusIndicator(focusTheme) {
    if (!this.themeFocusIndicator) {
      return;
    }

    if (focusTheme) {
      if (this.themeFocusLabel) {
        this.themeFocusLabel.textContent = focusTheme;
      }
      this.themeFocusIndicator.hidden = false;
      if (this.themeFocusClearButton) {
        this.themeFocusClearButton.disabled = false;
      }
    } else {
      if (this.themeFocusLabel) {
        this.themeFocusLabel.textContent = '';
      }
      this.themeFocusIndicator.hidden = true;
      if (this.themeFocusClearButton) {
        this.themeFocusClearButton.disabled = true;
      }
    }
  }

  applyThemeSearchFilter() {
    const term = this.themeSearchTerm;
    let visibleCount = 0;

    this.themeOptionRefs.forEach((refs) => {
      const matches = !term || refs.searchValue.includes(term);
      refs.element.hidden = !matches;
      if (matches) {
        visibleCount += 1;
      }
    });

    if (this.themeEmptyState) {
      this.themeEmptyState.hidden = visibleCount !== 0;
    }
  }

  refreshView(focusFirst = false) {
    const filtered = this.filtersManager.apply(this.allNodes, this.allEdges);
    const stats = this.statisticsManager.compute(filtered.nodes, filtered.edges);

    this.lastFiltered = filtered;
    this.graphManager.updateData(
      filtered.nodes,
      filtered.edges,
      stats.incomingMap,
      filtered.context
    );
    this.updateResultsIndicator(filtered.nodes.length);
    this.updateThemeCounts(stats.articlesByTheme);
    this.updateLegendCounts(stats.articlesByTheme);
    this.updateThemeListVisualState(filtered.context);
    this.renderStats(stats);

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

    const total = this.allNodes.length;
    const term = this.filtersManager.getSearchTerm();
    const { start, end } = this.filtersManager.getDateRange();
    const focusTheme = this.filtersManager.getFocusedTheme();
    const filtersActive =
      filteredCount !== total ||
      term.length > 0 ||
      focusTheme !== null ||
      (start !== null && start !== undefined) ||
      (end !== null && end !== undefined) ||
      this.filtersManager.getActiveThemes().length !== this.filtersManager.getThemes().length;

    if (!filtersActive) {
      this.resultsIndicator.textContent = `Exibindo ${toLocaleNumber(total)} artigos (visualização completa).`;
      return;
    }

    const focusSuffix = focusTheme ? ` com foco em ${focusTheme}` : '';
    this.resultsIndicator.textContent = `Exibindo ${toLocaleNumber(filteredCount)} de ${toLocaleNumber(total)} artigos com os filtros aplicados${focusSuffix}.`;
  }

  updateThemeCounts(filteredThemeStats) {
    const filteredMap = new Map(filteredThemeStats.map((item) => [item.theme, item.count]));

    this.themeOptionRefs.forEach((refs, theme) => {
      const total = this.themeTotals.get(theme) || 0;
      const filteredCount = filteredMap.get(theme) || 0;
      if (refs.countSpan) {
        refs.countSpan.textContent = `(${toLocaleNumber(filteredCount)}/${toLocaleNumber(total)})`;
      }
      refs.element.dataset.active = this.filtersManager.isThemeActive(theme) ? 'true' : 'false';
    });
  }

  updateThemeListVisualState(context = {}) {
    const focusTheme = context.focusTheme || null;
    const neighborIds = context.neighborIds || new Set();
    const neighborThemes = new Set();

    neighborIds.forEach((nodeId) => {
      const theme = this.nodeThemeMap.get(nodeId);
      if (theme && theme !== focusTheme) {
        neighborThemes.add(theme);
      }
    });

    this.themeOptionRefs.forEach((refs, theme) => {
      const isActive = this.filtersManager.isThemeActive(theme);
      const isFocused = focusTheme === theme;
      const isNeighbor = neighborThemes.has(theme);

      refs.checkbox.checked = isActive;
      refs.checkbox.indeterminate = focusTheme !== null && isNeighbor && !isFocused && !isActive;
      refs.element.dataset.active = isActive ? 'true' : 'false';
      refs.element.dataset.focused = isFocused ? 'true' : 'false';
      refs.element.dataset.related = isNeighbor ? 'true' : 'false';

      if (refs.focusButton) {
        refs.focusButton.setAttribute('aria-pressed', isFocused ? 'true' : 'false');
        refs.focusButton.textContent = isFocused ? 'Remover foco' : 'Focar';
      }
    });

    this.updateFocusIndicator(focusTheme);
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
    if (this.metadataDate)
      this.metadataDate.textContent = formatDate(node.publishedAt || node.listedDate);
    if (this.metadataCitations)
      this.metadataCitations.textContent = `${toLocaleNumber(node.citations || 0)} citações recebidas`;

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
    const payload = {
      exported_at: new Date().toISOString(),
      metadata: this.datasetMetadata,
      active_filters: {
        themes: this.filtersManager.getActiveThemes(),
        search: this.filtersManager.getSearchTerm(),
        dateRange: this.filtersManager.getDateRange(),
        focusTheme: this.filtersManager.getFocusedTheme()
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

  loadPersistedFilters() {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }

    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) {
        return null;
      }
      return JSON.parse(raw);
    } catch (error) {
      console.warn('[Visualização V2] Não foi possível restaurar os filtros salvos.', error);
      return null;
    }
  }

  applyPersistedFilters(state) {
    if (!state || typeof state !== 'object') {
      return;
    }

    if (typeof state.searchTerm === 'string') {
      this.filtersManager.setSearchTerm(state.searchTerm);
    }

    const startYear = Number.isFinite(state.startYear) ? state.startYear : null;
    const endYear = Number.isFinite(state.endYear) ? state.endYear : null;
    this.filtersManager.setDateRange(startYear, endYear);

    if (Array.isArray(state.activeThemes)) {
      this.filtersManager.setActiveThemes(state.activeThemes);
    }

    if (state.focusTheme) {
      this.filtersManager.setFocusedTheme(state.focusTheme);
    }
  }

  applyPersistedInputs(state) {
    if (!state || typeof state !== 'object') {
      return;
    }

    if (this.searchInput && typeof state.searchTerm === 'string') {
      this.searchInput.value = state.searchTerm;
    }

    if (this.startYearInput && Number.isFinite(state.startYear)) {
      this.startYearInput.value = state.startYear;
    }

    if (this.endYearInput && Number.isFinite(state.endYear)) {
      this.endYearInput.value = state.endYear;
    }

    this.themeOptionRefs.forEach((refs, theme) => {
      const isActive = this.filtersManager.isThemeActive(theme);
      refs.checkbox.checked = isActive;
      refs.element.dataset.active = isActive ? 'true' : 'false';
    });

    this.updateFocusIndicator(this.filtersManager.getFocusedTheme());
  }

  persistFilters() {
    if (this.isRestoringState || typeof window === 'undefined' || !window.localStorage) {
      return;
    }

    const dateRange = this.filtersManager.getDateRange();
    const payload = {
      searchTerm: this.filtersManager.getSearchTerm(),
      activeThemes: this.filtersManager.getActiveThemes(),
      focusTheme: this.filtersManager.getFocusedTheme(),
      startYear: Number.isFinite(dateRange.start) ? dateRange.start : null,
      endYear: Number.isFinite(dateRange.end) ? dateRange.end : null
    };

    try {
      window.localStorage.setItem(this.storageKey, JSON.stringify(payload));
    } catch (error) {
      console.warn('[Visualização V2] Não foi possível salvar o estado dos filtros.', error);
    }
  }
}
