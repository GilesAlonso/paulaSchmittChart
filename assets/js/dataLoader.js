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

  nodes.forEach(({ theme }) => {
    const key = theme || 'Sem tema';
    if (!map[key]) {
      map[key] = FALLBACK_PALETTE[fallbackIndex % FALLBACK_PALETTE.length];
      fallbackIndex += 1;
    }
  });

  return map;
}

export function transformDataset(rawData, themeColors) {
  const nodes = (rawData.nodes || []).map((node) => {
    const theme = node.theme ? String(node.theme).trim() : 'Sem tema';
    const rawDate = node.listed_date || node.published_at || null;
    const parsedDate = rawDate ? new Date(rawDate) : null;
    const year = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.getFullYear() : null;

    return {
      id: node.id,
      label: truncateText(node.title, 38),
      title: node.title,
      url: node.url,
      theme,
      publishedAt: node.published_at || null,
      listedDate: node.listed_date || null,
      year,
      color: themeColors[theme] || '#64748b',
      available: node.available ?? true,
      statusCode: node.status_code || null
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
