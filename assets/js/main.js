import { buildThemeColorMap, loadNetworkData, transformDataset } from './dataLoader.js';
import { GraphManager } from './graph.js';
import { FiltersManager } from './filters.js';
import { StatisticsManager } from './statistics.js';
import { UIController } from './ui.js';

const DATA_URL = 'data/paula-schmitt-network-v2.json';

async function bootstrapVisualization() {
  try {
    const rawData = await loadNetworkData(DATA_URL);
    const themeColors = buildThemeColorMap(rawData.nodes || []);
    const dataset = transformDataset(rawData, themeColors);

    const graphManager = new GraphManager('network-container');
    const filtersManager = new FiltersManager(dataset.nodes);
    const statisticsManager = new StatisticsManager(dataset.nodes, dataset.edges);

    const uiController = new UIController({
      graphManager,
      filtersManager,
      statisticsManager,
      themeColors,
      datasetMetadata: dataset.metadata
    });

    uiController.initialize(dataset);
  } catch (error) {
    console.error('[Visualização V2]', error);
    const errorBanner = document.getElementById('app-error');
    if (errorBanner) {
      errorBanner.hidden = false;
      errorBanner.textContent = `Ocorreu um erro ao carregar os dados: ${error.message}`;
    } else {
      alert(`Erro ao carregar a visualização: ${error.message}`);
    }
  }
}

document.addEventListener('DOMContentLoaded', bootstrapVisualization);
