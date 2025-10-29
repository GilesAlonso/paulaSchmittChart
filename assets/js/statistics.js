import { toLocaleNumber } from './utils.js';

export class StatisticsManager {
  constructor(allNodes = [], allEdges = []) {
    this.allNodes = allNodes;
    this.allEdges = allEdges;
  }

  compute(nodes = [], edges = []) {
    const incomingMap = this.buildIncomingMap(edges);

    const articleNodes = nodes.filter((node) => node.type !== 'external_source');
    const externalNodes = nodes.filter((node) => node.type === 'external_source');

    const totalArticles = articleNodes.length;
    const totalExternalSources = externalNodes.length;
    const totalCitations = edges.length;

    const mostCitedArticles = this.rankNodesByIncoming(articleNodes, incomingMap, (node, count) => ({
      id: node.id,
      title: node.title,
      theme: node.theme,
      year: node.year,
      count
    })).slice(0, 5);

    const topExternalSources = this.rankNodesByIncoming(externalNodes, incomingMap, (node, count) => ({
      id: node.id,
      title: node.title,
      sourceName: node.sourceName || node.domain || node.rawHost || 'Fonte externa',
      domain: node.domain || null,
      count,
      coverage: typeof node.coverage === 'number' ? node.coverage : null
    })).slice(0, 5);

    const articlesByTheme = this.countByTheme(articleNodes);
    const timeline = this.countByYear(articleNodes);

    return {
      totalArticles,
      totalExternalSources,
      totalCitations,
      incomingMap,
      mostCitedArticles,
      topExternalSources,
      articlesByTheme,
      timeline
    };
  }

  buildIncomingMap(edges = []) {
    const map = new Map();
    edges.forEach((edge) => {
      const current = map.get(edge.to) || 0;
      map.set(edge.to, current + 1);
    });
    return map;
  }

  rankNodesByIncoming(nodes = [], incomingMap, formatter) {
    return [...nodes]
      .map((node) => ({ node, count: incomingMap.get(node.id) || 0 }))
      .sort((a, b) => {
        if (b.count === a.count) {
          const yearA = Number.isFinite(a.node.year) ? a.node.year : 0;
          const yearB = Number.isFinite(b.node.year) ? b.node.year : 0;
          if (yearB !== yearA) {
            return yearB - yearA;
          }
          const titleA = a.node.title || '';
          const titleB = b.node.title || '';
          return titleA.localeCompare(titleB);
        }
        return b.count - a.count;
      })
      .map(({ node, count }) => formatter(node, count));
  }

  countByTheme(nodes = []) {
    const themeMap = new Map();

    nodes.forEach((node) => {
      const theme = node.theme || 'Sem tema';
      themeMap.set(theme, (themeMap.get(theme) || 0) + 1);
    });

    return Array.from(themeMap.entries())
      .map(([theme, count]) => ({ theme, count, label: `${theme}: ${toLocaleNumber(count)}` }))
      .sort((a, b) => b.count - a.count);
  }

  countByYear(nodes = []) {
    const yearMap = new Map();

    nodes.forEach((node) => {
      if (Number.isFinite(node.year)) {
        yearMap.set(node.year, (yearMap.get(node.year) || 0) + 1);
      }
    });

    return Array.from(yearMap.entries())
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => a.year - b.year);
  }
}
