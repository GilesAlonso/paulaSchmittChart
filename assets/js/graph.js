import { clamp, formatDate, lightenColor } from './utils.js';

export class GraphManager {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      throw new Error(`Container com id "${containerId}" não foi encontrado.`);
    }

    if (typeof vis === 'undefined' || !vis.Network) {
      throw new Error('vis-network não está carregado. Garanta que o script CDN foi importado antes do módulo.');
    }

    this.nodesDataSet = new vis.DataSet([]);
    this.edgesDataSet = new vis.DataSet([]);
    this.network = new vis.Network(
      this.container,
      { nodes: this.nodesDataSet, edges: this.edgesDataSet },
      this.defaultOptions()
    );

    this.labelsVisible = true;
    this.currentIncoming = new Map();
    this.currentNodes = [];
    this.currentEdges = [];
    this.currentContext = { focusTheme: null, primaryIds: new Set(), neighborIds: new Set() };
    this.initialized = false;
    this.onNodeSelect = null;
    this.onNodeDeselect = null;

    this.registerEvents();
    this.removeFallbackTextNodes();

    if (typeof this.network.once === 'function') {
      this.network.once('afterDrawing', () => this.removeFallbackTextNodes());
    }
  }

  defaultOptions() {
    const hasWindow = typeof window !== 'undefined';
    const canMatchMedia = hasWindow && typeof window.matchMedia === 'function';
    const prefersFinePointer = !canMatchMedia || window.matchMedia('(pointer: fine)').matches;
    const prefersCoarsePointer = canMatchMedia && window.matchMedia('(pointer: coarse)').matches;

    return {
      autoResize: true,
      interaction: {
        hover: prefersFinePointer,
        zoomView: true,
        dragView: true,
        dragNodes: true,
        tooltipDelay: prefersFinePointer ? 180 : 320,
        multiselect: false,
        navigationButtons: false,
        keyboard: false,
        zoomSpeed: prefersCoarsePointer ? 0.45 : 0.35
      },
      nodes: {
        shape: 'dot',
        font: {
          face: 'Inter',
          size: 14,
          color: '#1f2937'
        }
      },
      edges: {
        color: {
          inherit: true
        },
        smooth: {
          enabled: true,
          type: 'dynamic'
        },
        width: 1.2,
        arrows: {
          to: {
            enabled: true,
            scaleFactor: 0.7
          }
        }
      },
      physics: {
        solver: 'forceAtlas2Based',
        stabilization: {
          enabled: true,
          iterations: 500,
          fit: true
        },
        forceAtlas2Based: {
          gravitationalConstant: -50,
          centralGravity: 0.012,
          springLength: 100,
          springConstant: 0.09,
          damping: 0.42,
          avoidOverlap: 0.1
        },
        minVelocity: prefersCoarsePointer ? 0.8 : 0.7
      }
    };
  }

  registerEvents() {
    this.network.on('selectNode', (params) => {
      const nodeId = params.nodes[0];
      const nodeData = this.currentNodes.find((node) => node.id === nodeId);
      if (nodeData && typeof this.onNodeSelect === 'function') {
        const citationCount = this.currentIncoming.get(nodeId) || 0;
        this.onNodeSelect({ ...nodeData, citations: citationCount });
      }
    });

    this.network.on('deselectNode', () => {
      if (typeof this.onNodeDeselect === 'function') {
        this.onNodeDeselect();
      }
    });
  }

  removeFallbackTextNodes() {
    if (!this.container || typeof Node === 'undefined') {
      return;
    }

    Array.from(this.container.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .forEach((node) => {
        const content = node.textContent ? node.textContent.trim() : '';
        if (!content) {
          if (node.parentNode) {
            node.parentNode.removeChild(node);
          }
          return;
        }

        if (content.includes(':(') || /canvas/i.test(content) || content.length <= 4) {
          if (node.parentNode) {
            node.parentNode.removeChild(node);
          }
        }
      });
  }

  updateData(nodes = [], edges = [], incomingMap = new Map(), displayContext = {}) {
    this.currentNodes = nodes;
    this.currentEdges = edges;
    this.currentIncoming = incomingMap;

    const hasContext = displayContext && typeof displayContext === 'object';
    const focusTheme = hasContext && typeof displayContext.focusTheme !== 'undefined' && displayContext.focusTheme !== null
      ? displayContext.focusTheme
      : null;

    const toSet = (value) => {
      if (value instanceof Set) {
        return value;
      }
      if (Array.isArray(value)) {
        return new Set(value);
      }
      if (value && typeof value[Symbol.iterator] === 'function') {
        return new Set(value);
      }
      return new Set();
    };

    const primaryIds = hasContext ? toSet(displayContext.primaryIds) : new Set();
    const neighborIds = hasContext ? toSet(displayContext.neighborIds) : new Set();

    this.currentContext = { focusTheme, primaryIds, neighborIds };

    this.removeFallbackTextNodes();

    const visNodes = nodes.map((node) => this.mapNode(node, incomingMap, this.currentContext));

    this.nodesDataSet.clear();
    if (visNodes.length) {
      this.nodesDataSet.add(visNodes);
    }

    this.edgesDataSet.clear();
    if (edges.length) {
      this.edgesDataSet.add(edges);
    }

    if (!this.initialized && nodes.length > 0) {
      this.network.fit({ animation: { duration: 700, easingFunction: 'easeInOutCubic' } });
      this.initialized = true;
    }
  }

  mapNode(node, incomingMap, context = this.currentContext) {
    const citationCount = incomingMap.get(node.id) || 0;
    const baseSize = clamp(12 + citationCount * 2.2, 12, 38);

    const focusTheme = context && typeof context.focusTheme !== 'undefined' && context.focusTheme !== null ? context.focusTheme : null;
    const primaryIds = context && context.primaryIds instanceof Set
      ? context.primaryIds
      : new Set();
    const neighborIds = context && context.neighborIds instanceof Set
      ? context.neighborIds
      : new Set();
    const focusActive = Boolean(focusTheme);
    const isPrimary = focusActive && primaryIds.has(node.id);
    const isNeighbor = focusActive && neighborIds.has(node.id);

    const baseColor = node.color;
    let background = baseColor;
    let border = lightenColor(baseColor, 0.08);
    let highlightBackground = baseColor;
    let highlightBorder = '#111827';
    let opacity = 1;
    let fontColor = '#111827';
    let size = baseSize;

    if (focusActive) {
      if (isPrimary) {
        border = '#0f172a';
        highlightBorder = '#0f172a';
        size = clamp(baseSize * 1.05, 12, 40);
      } else if (isNeighbor) {
        background = lightenColor(baseColor, 0.32);
        border = lightenColor(baseColor, 0.45);
        highlightBackground = background;
        highlightBorder = border;
        opacity = 0.78;
        fontColor = '#334155';
        size = clamp(baseSize * 0.95, 10, 34);
      } else {
        opacity = 0.35;
        fontColor = '#475569';
      }
    }

    return {
      id: node.id,
      label: this.labelsVisible ? node.label : '',
      title: this.buildTooltip(node, citationCount),
      color: {
        background,
        border,
        highlight: {
          background: highlightBackground,
          border: highlightBorder
        }
      },
      font: {
        size: this.labelsVisible ? 14 : 0,
        face: 'Inter',
        color: fontColor
      },
      size,
      opacity,
      mass: Math.max(1, citationCount * 0.5),
      group: node.theme
    };
  }

  buildTooltip(node, citationCount) {
    const year = Number.isFinite(node.year) ? node.year : '—';
    const published = node.publishedAt ? formatDate(node.publishedAt) : 'Data indisponível';

    return `
      <div style="padding: 0.4rem 0.5rem; max-width: 240px;">
        <div style="font-weight:600; margin-bottom:0.25rem;">${node.title}</div>
        <div style="font-size:0.78rem; color:#475569;">${node.theme} · ${year}</div>
        <div style="font-size:0.75rem; color:#64748b; margin-top:0.35rem;">Publicado em ${published}</div>
        <div style="font-size:0.75rem; color:#475569; margin-top:0.25rem;">
          Citações recebidas: ${citationCount}
        </div>
      </div>
    `;
  }

  setPhysicsEnabled(isEnabled) {
    this.network.setOptions({ physics: { enabled: isEnabled } });
  }

  setLabelsVisible(isVisible) {
    if (this.labelsVisible === isVisible) {
      return;
    }
    this.labelsVisible = isVisible;

    const context = this.currentContext || {};
    const focusTheme = typeof context.focusTheme !== 'undefined' && context.focusTheme !== null ? context.focusTheme : null;
    const primaryIds = context.primaryIds instanceof Set ? context.primaryIds : new Set();
    const neighborIds = context.neighborIds instanceof Set ? context.neighborIds : new Set();
    const focusActive = Boolean(focusTheme);

    const updated = this.currentNodes.map((node) => {
      const isPrimary = focusActive && primaryIds.has(node.id);
      const isNeighbor = focusActive && neighborIds.has(node.id);
      let fontColor = '#111827';

      if (focusActive) {
        if (isNeighbor && !isPrimary) {
          fontColor = '#334155';
        } else if (!isPrimary) {
          fontColor = '#475569';
        }
      }

      return {
        id: node.id,
        label: isVisible ? node.label : '',
        font: { size: isVisible ? 14 : 0, face: 'Inter', color: fontColor }
      };
    });

    this.nodesDataSet.update(updated);
  }

  focusOnNode(nodeId) {
    if (!nodeId) {
      return;
    }
    this.network.selectNodes([nodeId]);
    this.network.focus(nodeId, {
      animation: {
        duration: 600,
        easingFunction: 'easeInOutQuart'
      },
      scale: 1.2
    });
  }

  getNodeById(nodeId) {
    return this.currentNodes.find((node) => node.id === nodeId) || null;
  }

  getIncomingCount(nodeId) {
    return this.currentIncoming.get(nodeId) || 0;
  }

  resize() {
    this.network.redraw();
  }

  capturePng() {
    if (!this.network || !this.network.canvas || !this.network.canvas.frame) {
      return null;
    }

    const canvas = this.network.canvas.frame.canvas;
    if (!canvas || typeof canvas.toDataURL !== 'function') {
      return null;
    }

    return canvas.toDataURL('image/png');
  }
}
