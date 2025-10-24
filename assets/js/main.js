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

function updateLayoutMetrics() {
  if (typeof window === 'undefined') {
    return;
  }

  const root = document.documentElement;
  if (!root) {
    return;
  }

  const header = document.querySelector('.top-bar');
  const layout = document.querySelector('.v2-layout');
  const graphContainer = document.getElementById('network-container');
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;

  let availableHeight = viewportHeight;

  if (graphContainer && typeof graphContainer.getBoundingClientRect === 'function') {
    const rect = graphContainer.getBoundingClientRect();
    const offsetTop = Math.max(rect.top, 0);
    availableHeight = Math.max(360, viewportHeight - offsetTop - 32);
  } else {
    const headerHeight = header ? header.getBoundingClientRect().height : 0;
    let layoutPadding = 0;
    if (layout && typeof window.getComputedStyle === 'function') {
      const layoutStyles = window.getComputedStyle(layout);
      layoutPadding += parseFloat(layoutStyles.paddingTop || '0') || 0;
      layoutPadding += parseFloat(layoutStyles.paddingBottom || '0') || 0;
    }
    availableHeight = Math.max(360, viewportHeight - headerHeight - layoutPadding - 24);
  }

  root.style.setProperty('--graph-available-height', `${availableHeight}px`);

  const themeMaxHeight = Math.max(240, availableHeight - 190);
  root.style.setProperty('--theme-panel-max-height', `${themeMaxHeight}px`);
}

function handleViewportMetricsUpdate() {
  updateViewportUnit();
  updateLayoutMetrics();
}

function initializeViewportUnitWatcher() {
  if (typeof window === 'undefined') {
    return;
  }

  handleViewportMetricsUpdate();

  window.addEventListener('resize', handleViewportMetricsUpdate);
  window.addEventListener('orientationchange', handleViewportMetricsUpdate);

  if (window.visualViewport && typeof window.visualViewport.addEventListener === 'function') {
    window.visualViewport.addEventListener('resize', handleViewportMetricsUpdate);
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
    updateLayoutMetrics();
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
