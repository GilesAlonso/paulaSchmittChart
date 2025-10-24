export class FiltersManager {
  constructor(nodes = [], edges = []) {
    this.themeTotals = this.computeThemeTotals(nodes);
    this.allThemes = this.sortThemesByCount(this.themeTotals);
    this.activeThemes = new Set(this.allThemes);
    this.focusedTheme = null;
    this.adjacencyByNode = this.buildAdjacencyMap(edges);

    this.searchTerm = '';
    this.startYear = null;
    this.endYear = null;
  }

  computeThemeTotals(nodes = []) {
    const totals = new Map();
    nodes.forEach((node) => {
      const theme = node.theme || 'Sem tema';
      totals.set(theme, (totals.get(theme) || 0) + 1);
    });
    return totals;
  }

  sortThemesByCount(themeTotals) {
    return Array.from(themeTotals.entries())
      .sort((a, b) => {
        if (b[1] === a[1]) {
          return a[0].localeCompare(b[0]);
        }
        return b[1] - a[1];
      })
      .map(([theme]) => theme);
  }

  buildAdjacencyMap(edges = []) {
    const adjacency = new Map();

    const addNeighbor = (source, target) => {
      if (!source || !target) {
        return;
      }
      if (!adjacency.has(source)) {
        adjacency.set(source, new Set());
      }
      adjacency.get(source).add(target);
    };

    edges.forEach((edge) => {
      addNeighbor(edge.from, edge.to);
      addNeighbor(edge.to, edge.from);
    });

    return adjacency;
  }

  getThemes() {
    return [...this.allThemes];
  }

  getThemeTotals() {
    return new Map(this.themeTotals);
  }

  getTotalForTheme(theme) {
    return this.themeTotals.get(theme) || 0;
  }

  getActiveThemes() {
    return Array.from(this.activeThemes);
  }

  getFocusedTheme() {
    return this.focusedTheme;
  }

  isThemeActive(theme) {
    return this.activeThemes.has(theme);
  }

  setThemeState(theme, isActive) {
    if (!this.themeTotals.has(theme)) {
      return;
    }

    if (isActive) {
      this.activeThemes.add(theme);
    } else {
      this.activeThemes.delete(theme);
      if (this.focusedTheme === theme) {
        this.focusedTheme = null;
      }
    }
  }

  setActiveThemes(themes = []) {
    this.activeThemes.clear();
    themes.forEach((theme) => {
      if (this.themeTotals.has(theme)) {
        this.activeThemes.add(theme);
      }
    });

    if (this.focusedTheme && !this.activeThemes.has(this.focusedTheme)) {
      this.focusedTheme = null;
    }
  }

  setAllThemes(isActive) {
    if (isActive) {
      this.allThemes.forEach((theme) => this.activeThemes.add(theme));
    } else {
      this.activeThemes.clear();
      this.focusedTheme = null;
    }
  }

  toggleFocus(theme) {
    if (!this.themeTotals.has(theme)) {
      return this.focusedTheme;
    }

    if (this.focusedTheme === theme) {
      this.focusedTheme = null;
    } else {
      this.focusedTheme = theme;
      this.activeThemes.add(theme);
    }

    return this.focusedTheme;
  }

  setFocusedTheme(theme) {
    if (theme && this.themeTotals.has(theme)) {
      this.focusedTheme = theme;
      this.activeThemes.add(theme);
    } else {
      this.focusedTheme = null;
    }
  }

  clearFocus() {
    this.focusedTheme = null;
  }

  setSearchTerm(term) {
    this.searchTerm = (term || '').trim().toLowerCase();
  }

  getSearchTerm() {
    return this.searchTerm;
  }

  setDateRange(startYear, endYear) {
    this.startYear = Number.isFinite(startYear) ? startYear : null;
    this.endYear = Number.isFinite(endYear) ? endYear : null;

    if (this.startYear && this.endYear && this.startYear > this.endYear) {
      [this.startYear, this.endYear] = [this.endYear, this.startYear];
    }
  }

  getDateRange() {
    return { start: this.startYear, end: this.endYear };
  }

  reset() {
    this.activeThemes = new Set(this.allThemes);
    this.focusedTheme = null;
    this.searchTerm = '';
    this.startYear = null;
    this.endYear = null;
  }

  matchesCommonFilters(node) {
    if (!node) {
      return false;
    }

    if ((this.startYear || this.endYear) && !Number.isFinite(node.year)) {
      return false;
    }

    if (this.startYear && node.year < this.startYear) {
      return false;
    }

    if (this.endYear && node.year > this.endYear) {
      return false;
    }

    if (this.searchTerm && !node.title.toLowerCase().includes(this.searchTerm)) {
      return false;
    }

    return true;
  }

  apply(nodes = [], edges = []) {
    const matchingNodes = [];

    nodes.forEach((node) => {
      if (this.matchesCommonFilters(node)) {
        matchingNodes.push(node);
      }
    });

    const primaryIds = new Set();
    const neighborIds = new Set();
    const visibleIds = new Set();

    if (this.focusedTheme) {
      matchingNodes.forEach((node) => {
        if (node.theme !== this.focusedTheme) {
          return;
        }

        primaryIds.add(node.id);
        visibleIds.add(node.id);

        const neighbors = this.adjacencyByNode.get(node.id);
        if (!neighbors) {
          return;
        }

        neighbors.forEach((neighborId) => {
          if (!visibleIds.has(neighborId)) {
            neighborIds.add(neighborId);
            visibleIds.add(neighborId);
          }
        });
      });
    } else {
      matchingNodes.forEach((node) => {
        if (this.activeThemes.has(node.theme)) {
          primaryIds.add(node.id);
          visibleIds.add(node.id);
        }
      });
    }

    const filteredNodes = nodes.filter((node) => visibleIds.has(node.id));
    const filteredEdges = edges.filter(
      (edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to)
    );

    return {
      nodes: filteredNodes,
      edges: filteredEdges,
      context: {
        focusTheme: this.focusedTheme,
        primaryIds,
        neighborIds,
        activeThemes: new Set(this.activeThemes)
      }
    };
  }
}
