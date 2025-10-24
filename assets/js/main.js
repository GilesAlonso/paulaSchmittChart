import { buildThemeColorMap, loadNetworkData, transformDataset } from './dataLoader.js';
import { GraphManager } from './graph.js';
import { FiltersManager } from './filters.js';
import { StatisticsManager } from './statistics.js';
import { UIController } from './ui.js';

const DATA_URL = 'data/paula-schmitt-network-v2.json';
const PASSIVE_OPTIONS = { passive: true };

function updateViewportUnit() {
  if (typeof window === 'undefined') {
    return;
  }

  const vh = window.innerHeight ? window.innerHeight * 0.01 : 1;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}

function initializeViewportUnitWatcher() {
  if (typeof window === 'undefined') {
    return;
  }

  updateViewportUnit();

  window.addEventListener('resize', updateViewportUnit);
  window.addEventListener('orientationchange', updateViewportUnit);

  if (window.visualViewport && typeof window.visualViewport.addEventListener === 'function') {
    window.visualViewport.addEventListener('resize', updateViewportUnit);
  }
}

function setupScrollHintDismiss() {
  if (typeof window === 'undefined') {
    return;
  }

  const hint = document.getElementById('mobile-scroll-hint');
  if (!hint) {
    return;
  }

  const smallViewport = !window.matchMedia || window.matchMedia('(max-width: 1024px)').matches;
  if (!smallViewport) {
    hint.classList.add('is-hidden');
    return;
  }

  hint.classList.remove('is-hidden');

  let dismissed = false;
  const networkContainer = document.getElementById('network-container');
  const pointerEvents = ['touchstart', 'pointerdown', 'mousedown', 'wheel'];

  function onScroll() {
    dismiss();
  }

  function onKeyboardInteraction() {
    dismiss();
  }

  function removeListeners() {
    window.removeEventListener('scroll', onScroll, PASSIVE_OPTIONS);
    pointerEvents.forEach((eventName) => {
      document.removeEventListener(eventName, dismiss, PASSIVE_OPTIONS);
    });
    document.removeEventListener('keydown', onKeyboardInteraction);
    if (networkContainer) {
      networkContainer.removeEventListener('touchstart', dismiss, PASSIVE_OPTIONS);
      networkContainer.removeEventListener('pointerdown', dismiss, PASSIVE_OPTIONS);
    }
  }

  function dismiss() {
    if (dismissed) {
      return;
    }

    dismissed = true;
    hint.classList.add('is-hidden');
    removeListeners();
  }

  window.addEventListener('scroll', onScroll, PASSIVE_OPTIONS);
  pointerEvents.forEach((eventName) => {
    document.addEventListener(eventName, dismiss, PASSIVE_OPTIONS);
  });
  document.addEventListener('keydown', onKeyboardInteraction);

  if (networkContainer) {
    networkContainer.addEventListener('touchstart', dismiss, PASSIVE_OPTIONS);
    networkContainer.addEventListener('pointerdown', dismiss, PASSIVE_OPTIONS);
  }

  window.setTimeout(dismiss, 9000);
}

async function bootstrapVisualization() {
  try {
    const rawData = await loadNetworkData(DATA_URL);
    const themeColors = buildThemeColorMap(rawData.nodes || []);
    const dataset = transformDataset(rawData, themeColors);

    const graphManager = new GraphManager('network-container');
    const filtersManager = new FiltersManager(dataset.nodes, dataset.edges);
    const statisticsManager = new StatisticsManager(dataset.nodes, dataset.edges);

    const uiController = new UIController({
      graphManager,
      filtersManager,
      statisticsManager,
      themeColors,
      datasetMetadata: dataset.metadata
    });

    uiController.initialize(dataset);
    requestAnimationFrame(() => graphManager.resize());
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

initializeViewportUnitWatcher();

document.addEventListener('DOMContentLoaded', () => {
  setupScrollHintDismiss();
  bootstrapVisualization();
});
