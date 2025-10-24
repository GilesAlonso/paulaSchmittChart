import { lightenColor } from './utils.js';

function normalizeId(value) {
  if (value === null || value === undefined) {
    return null;
  }
  return String(value);
}

export class FiltersManager {
  constructor(nodes = [], edges = []) {
    this.allNodes = Array.isArray(nodes) ? nodes : [];
    this.allEdges = Array.isArray(edges) ? edges : [];

    this.nodeMap = new Map();
    this.allNodes.forEach((node) => {
      const id = normalizeId(node.id);
      if (id !== null) {
        this.nodeMap.set(id, node);
      }
    });

    this.themeNodeMap = this.buildThemeNodeMap(this.allNodes);
    this.neighborMap = this.buildNeighborMap(this.allNodes, this.allEdges);

    const themes = new Set(this.allNodes.map((node) => node.theme || 'Sem tema'));
    this.allThemes = Array.from(themes).sort((a, b) => a.localeCompare(b));

    this.activeThemes = new Set(this.allThemes);
    this.searchTerm = '';
    this.startYear = null;
    this.endYear = null;
    this.smartTheme = null;
    this.lastSmartSelectionMeta = null;
  }

  buildThemeNodeMap(nodes = []) {
    const map = new Map();
    nodes.forEach((node) => {
      const theme = node.theme || 'Sem tema';
      const id = normalizeId(node.id);
      if (id === null) {
        return;
      }
      if (!map.has(theme)) {
        map.set(theme, new Set());
      }
      map.get(theme).add(id);
    });
    return map;
  }

  buildNeighborMap(nodes = [], edges = []) {
    const map = new Map();

    nodes.forEach((node) => {
      const id = normalizeId(node.id);
      if (id !== null && !map.has(id)) {
        map.set(id, new Set());
      }
    });

    edges.forEach((edge) => {
      const fromId = normalizeId(edge.from);
      const toId = normalizeId(edge.to);
      if (fromId === null || toId === null) {
        return;
      }
      if (!map.has(fromId)) {
        map.set(fromId, new Set());
      }
      if (!map.has(toId)) {
        map.set(toId, new Set());
      }
      map.get(fromId).add(toId);
      map.get(toId).add(fromId);
    });

    return map;
  }

  getThemes() {
    return this.allThemes;
  }

  getActiveThemes() {
    if (this.smartTheme) {
      return [this.smartTheme];
    }
    return Array.from(this.activeThemes);
  }

  isThemeActive(theme) {
    if (this.smartTheme) {
      return this.smartTheme === theme;
    }
    return this.activeThemes.has(theme);
  }

  setThemeState(theme, isActive) {
    this.clearSmartTheme();
    if (isActive) {
      this.activeThemes.add(theme);
    } else {
      this.activeThemes.delete(theme);
    }
  }

  setAllThemes(isActive) {
    this.clearSmartTheme();
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

  setSmartTheme(theme) {
    if (theme && this.themeNodeMap.has(theme)) {
      this.smartTheme = theme;
    } else {
      this.smartTheme = null;
    }
  }

  clearSmartTheme() {
    this.smartTheme = null;
    this.lastSmartSelectionMeta = null;
  }

  hasSmartThemeSelection() {
    return Boolean(this.smartTheme);
  }

  getSmartTheme() {
    return this.smartTheme;
  }

  getSmartSelectionMeta() {
    return this.lastSmartSelectionMeta;
  }

  reset() {
    this.activeThemes = new Set(this.allThemes);
    this.searchTerm = '';
    this.startYear = null;
    this.endYear = null;
    this.smartTheme = null;
    this.lastSmartSelectionMeta = null;
  }

  passesBaseFilters(node) {
    if (!node) {
      return false;
    }

    if ((this.startYear || this.endYear) && !Number.isFinite(node.year)) {
      return false;
    }

    if (this.startYear && Number.isFinite(node.year) && node.year < this.startYear) {
      return false;
    }

    if (this.endYear && Number.isFinite(node.year) && node.year > this.endYear) {
      return false;
    }

    if (this.searchTerm && !node.title.toLowerCase().includes(this.searchTerm)) {
      return false;
    }

    return true;
  }

  apply(nodes = this.allNodes, edges = this.allEdges) {
    const baseNodes = Array.isArray(nodes) && nodes.length ? nodes : this.allNodes;
    const baseEdges = Array.isArray(edges) && edges.length ? edges : this.allEdges;

    const passesFilters = (node) => this.passesBaseFilters(node);

    if (this.smartTheme) {
      const themeIds = this.themeNodeMap.get(this.smartTheme) || new Set();
      if (!themeIds.size) {
        const emptyMeta = {
          theme: this.smartTheme,
          primaryCount: 0,
          contextCount: 0,
          totalCount: 0,
          filtersApplied: {
            searchTerm: this.searchTerm,
            startYear: this.startYear,
            endYear: this.endYear
          },
          fallbackApplied: false
        };
        this.lastSmartSelectionMeta = emptyMeta;
        return { nodes: [], edges: [], meta: { smartSelection: emptyMeta } };
      }

      const filteredPrimaryIds = new Set();
      const fallbackPrimaryIds = new Set();

      themeIds.forEach((id) => {
        fallbackPrimaryIds.add(id);
        const node = this.nodeMap.get(id);
        if (!node) {
          return;
        }
        if (passesFilters(node)) {
          filteredPrimaryIds.add(id);
        }
      });

      const primaryIds = filteredPrimaryIds.size ? filteredPrimaryIds : fallbackPrimaryIds;

      const contextIds = new Set();
      primaryIds.forEach((id) => {
        const neighbors = this.neighborMap.get(id);
        if (!neighbors) {
          return;
        }
        neighbors.forEach((neighborId) => {
          if (primaryIds.has(neighborId)) {
            return;
          }
          const neighborNode = this.nodeMap.get(neighborId);
          if (!neighborNode) {
            return;
          }
          contextIds.add(neighborId);
        });
      });

      const allowedIds = new Set([...primaryIds, ...contextIds]);

      const filteredNodes = Array.from(allowedIds)
        .map((id) => {
          const original = this.nodeMap.get(id);
          if (!original) {
            return null;
          }
          const matchesFilters = passesFilters(original);
          const role = primaryIds.has(id) ? 'primary' : 'context';
          let displayColor = original.color;

          if (role === 'context') {
            displayColor = lightenColor(original.color, matchesFilters ? 0.38 : 0.55);
          }

          return {
            ...original,
            role,
            displayColor,
            matchesFilters
          };
        })
        .filter(Boolean);

      const filteredEdges = baseEdges.filter((edge) => {
        const fromId = normalizeId(edge.from);
        const toId = normalizeId(edge.to);
        return fromId !== null && toId !== null && allowedIds.has(fromId) && allowedIds.has(toId);
      });

      const meta = {
        theme: this.smartTheme,
        primaryCount: primaryIds.size,
        contextCount: contextIds.size,
        totalCount: filteredNodes.length,
        filtersApplied: {
          searchTerm: this.searchTerm,
          startYear: this.startYear,
          endYear: this.endYear
        },
        fallbackApplied: !filteredPrimaryIds.size && fallbackPrimaryIds.size > 0
      };

      this.lastSmartSelectionMeta = meta;

      return {
        nodes: filteredNodes,
        edges: filteredEdges,
        meta: { smartSelection: meta }
      };
    }

    const filteredNodes = baseNodes
      .filter((node) => {
        const theme = node.theme || 'Sem tema';
        if (!this.activeThemes.has(theme)) {
          return false;
        }
        return passesFilters(node);
      })
      .map((node) => ({
        ...node,
        role: null,
        displayColor: node.color,
        matchesFilters: true
      }));

    const activeIds = new Set(filteredNodes.map((node) => normalizeId(node.id)));
    const filteredEdges = baseEdges.filter((edge) => {
      const fromId = normalizeId(edge.from);
      const toId = normalizeId(edge.to);
      return fromId !== null && toId !== null && activeIds.has(fromId) && activeIds.has(toId);
    });

    this.lastSmartSelectionMeta = null;

    return {
      nodes: filteredNodes,
      edges: filteredEdges,
      meta: { smartSelection: null }
    };
  }
}
