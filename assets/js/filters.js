export class FiltersManager {
  constructor(nodes = []) {
    const themes = new Set(nodes.map((node) => node.theme || 'Sem tema'));
    this.allThemes = Array.from(themes).sort((a, b) => a.localeCompare(b));
    this.activeThemes = new Set(this.allThemes);
    this.searchTerm = '';
    this.startYear = null;
    this.endYear = null;
  }

  getThemes() {
    return this.allThemes;
  }

  getActiveThemes() {
    return Array.from(this.activeThemes);
  }

  isThemeActive(theme) {
    return this.activeThemes.has(theme);
  }

  setThemeState(theme, isActive) {
    if (isActive) {
      this.activeThemes.add(theme);
    } else {
      this.activeThemes.delete(theme);
    }
  }

  setAllThemes(isActive) {
    if (isActive) {
      this.allThemes.forEach((theme) => this.activeThemes.add(theme));
    } else {
      this.activeThemes.clear();
    }
  }

  setSearchTerm(term) {
    this.searchTerm = (term || '').trim().toLowerCase();
  }

  setDateRange(startYear, endYear) {
    this.startYear = Number.isFinite(startYear) ? startYear : null;
    this.endYear = Number.isFinite(endYear) ? endYear : null;
    if (this.startYear && this.endYear && this.startYear > this.endYear) {
      [this.startYear, this.endYear] = [this.endYear, this.startYear];
    }
  }

  getSearchTerm() {
    return this.searchTerm;
  }

  getDateRange() {
    return { start: this.startYear, end: this.endYear };
  }

  reset() {
    this.activeThemes = new Set(this.allThemes);
    this.searchTerm = '';
    this.startYear = null;
    this.endYear = null;
  }

  apply(nodes = [], edges = []) {
    const filteredNodes = nodes.filter((node) => {
      if (!this.activeThemes.has(node.theme)) {
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
    });

    const activeIds = new Set(filteredNodes.map((node) => node.id));
    const filteredEdges = edges.filter(
      (edge) => activeIds.has(edge.from) && activeIds.has(edge.to)
    );

    return { nodes: filteredNodes, edges: filteredEdges };
  }
}
