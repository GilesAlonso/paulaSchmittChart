import { truncateText } from './utils.js';

const PRESET_THEME_COLORS = {
  'Agronegócio': '#e63946',
  'Brasil': '#2a9d8f',
  'Congresso': '#f4a261',
  'Coronavírus': '#f6bd60',
  'Economia': '#264653',
  'Educação': '#6a4c93',
  'Eleições': '#ef476f',
  'Governo': '#118ab2',
  'História': '#9c6644',
  'Infográficos': '#06d6a0',
  'Infra': '#8d99ae',
  'Internacional': '#1d3557',
  'Justiça': '#8ecae6',
  'Lava Jato': '#ff9f1c',
  'Literatura': '#f72585',
  'Mídia': '#8338ec',
  'Partidos políticos': '#ffd23f',
  'Saúde': '#52b788',
  'Segurança Pública': '#b5179e',
  'Tech': '#3a86ff'
};

const FALLBACK_PALETTE = [
  '#0ea5e9',
  '#22c55e',
  '#f97316',
  '#14b8a6',
  '#6366f1',
  '#84cc16',
  '#fb7185',
  '#38bdf8',
  '#facc15',
  '#a855f7',
  '#ec4899',
  '#f472b6',
  '#64748b',
  '#2dd4bf'
];

const EXTERNAL_NODE_COLOR = '#1f2937';
const EXTERNAL_NODE_THEME_LABEL = 'Fontes externas';

export async function loadNetworkData(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Não foi possível carregar o dataset: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export function buildThemeColorMap(nodes) {
  const map = { ...PRESET_THEME_COLORS };
  let fallbackIndex = 0;

  nodes.forEach(({ theme, type }) => {
    const nodeType = type || 'article';
    if (nodeType !== 'article') {
      return;
    }
    const key = theme ? String(theme).trim() : 'Sem tema';
    if (!map[key]) {
      map[key] = FALLBACK_PALETTE[fallbackIndex % FALLBACK_PALETTE.length];
      fallbackIndex += 1;
    }
  });

  return map;
}

export function transformDataset(rawData, themeColors) {
  const nodes = (rawData.nodes || []).map((node) => {
    const nodeType = node && node.type === 'external_source' ? 'external_source' : 'article';
    const rawTitle = typeof node.title === 'string' && node.title.trim().length > 0 ? node.title.trim() : node.id;
    const summary = typeof node.summary === 'string' && node.summary.trim().length > 0 ? node.summary.trim() : null;
    const labelLimit = nodeType === 'external_source' ? 34 : 38;

    let theme = 'Sem tema';
    let publishedAt = null;
    let listedDate = null;
    let year = null;
    let color = EXTERNAL_NODE_COLOR;
    let available = node.available ?? true;
    let statusCode = node.status_code || null;

    if (nodeType === 'article') {
      theme = node.theme ? String(node.theme).trim() : 'Sem tema';
      listedDate = node.listed_date || null;
      publishedAt = node.published_at || null;
      const rawDate = listedDate || publishedAt;
      if (rawDate) {
        const parsedDate = new Date(rawDate);
        if (!Number.isNaN(parsedDate.getTime())) {
          year = parsedDate.getFullYear();
        }
      }
      color = themeColors[theme] || '#64748b';
    } else {
      theme = EXTERNAL_NODE_THEME_LABEL;
      color = EXTERNAL_NODE_COLOR;
      available = true;
      statusCode = null;
    }

    const domain = typeof node.domain === 'string' && node.domain.length > 0 ? node.domain : null;
    const sourceName = typeof node.source_name === 'string' && node.source_name.length > 0
      ? node.source_name
      : domain
      ? domain.replace(/^www\./i, '')
      : null;
    const rawHost = typeof node.raw_host === 'string' && node.raw_host.length > 0 ? node.raw_host : null;
    const citationCount = typeof node.citation_count === 'number' ? node.citation_count : null;
    const coverage = typeof node.coverage === 'number' ? node.coverage : null;
    const anchorText = typeof node.anchor_text === 'string' && node.anchor_text.length > 0 ? node.anchor_text : null;
    const citedBy = Array.isArray(node.cited_by) ? node.cited_by : [];

    const baseDisplayCandidate = nodeType === 'external_source'
      ? (sourceName || rawTitle || domain || rawHost || 'Fonte externa')
      : rawTitle;

    const baseDisplayName = String(baseDisplayCandidate || '').trim()
      || String(domain || rawHost || rawTitle || node.id || '').trim();

    const includesDomain = domain
      ? baseDisplayName.toLowerCase().includes(domain.toLowerCase())
      : false;
    const displayName = nodeType === 'external_source' && domain && !includesDomain
      ? `${baseDisplayName} (${domain})`
      : baseDisplayName;

    const labelText = truncateText(
      nodeType === 'external_source' ? baseDisplayName : rawTitle,
      labelLimit
    );
    const nodeTitle = nodeType === 'external_source' ? displayName : rawTitle;

    return {
      id: node.id,
      type: nodeType,
      label: labelText,
      title: nodeTitle,
      displayName,
      url: node.url,
      theme,
      summary,
      publishedAt,
      listedDate,
      year,
      color,
      available,
      statusCode,
      domain,
      sourceName,
      citationCount,
      coverage,
      anchorText,
      citedBy,
      rawHost
    };
  });

  const edges = (rawData.edges || []).map((edge) => ({
    from: edge.source,
    to: edge.target,
    arrows: 'to'
  }));

  return {
    metadata: rawData.metadata || {},
    nodes,
    edges,
    themeColors
  };
}
