import { clamp, formatDate, lightenColor } from './utils.js';

const EXTERNAL_NODE_FONT_COLOR = '#f8fafc';
const EXTERNAL_NODE_NEIGHBOR_FONT = '#e2e8f0';
const EXTERNAL_NODE_BORDER_COLOR = '#0f172a';
const EXTERNAL_NODE_HIGHLIGHT_BORDER = '#38bdf8';

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
    const isExternal = node.type === 'external_source';
    const baseSize = isExternal
      ? clamp(16 + citationCount * 2, 16, 34)
      : clamp(12 + citationCount * 2.2, 12, 38);

    const focusTheme = context && typeof context.focusTheme !== 'undefined' && context.focusTheme !== null ? context.focusTheme : null;
    const primaryIds = context && context.primaryIds instanceof Set ? context.primaryIds : new Set();
    const neighborIds = context && context.neighborIds instanceof Set ? context.neighborIds : new Set();
    const focusActive = Boolean(focusTheme);
    const isPrimary = focusActive && primaryIds.has(node.id);
    const isNeighbor = focusActive && neighborIds.has(node.id);

    const baseColor = node.color || (isExternal ? EXTERNAL_NODE_BORDER_COLOR : '#64748b');
    let background = baseColor;
    let border = isExternal ? EXTERNAL_NODE_BORDER_COLOR : lightenColor(baseColor, 0.08);
    let highlightBackground = isExternal ? lightenColor(baseColor, 0.12) : baseColor;
    let highlightBorder = isExternal ? EXTERNAL_NODE_HIGHLIGHT_BORDER : '#111827';
    let opacity = 1;
    let fontColor = isExternal ? EXTERNAL_NODE_FONT_COLOR : '#111827';
    let size = baseSize;
    let mass = Math.max(1, citationCount * (isExternal ? 0.4 : 0.5));

    if (focusActive) {
      if (isPrimary) {
        if (isExternal) {
          border = EXTERNAL_NODE_HIGHLIGHT_BORDER;
          highlightBorder = EXTERNAL_NODE_HIGHLIGHT_BORDER;
          highlightBackground = lightenColor(baseColor, 0.18);
        } else {
          border = '#0f172a';
          highlightBorder = '#0f172a';
        }
        size = clamp(baseSize * 1.1, isExternal ? 18 : 12, isExternal ? 38 : 40);
      } else if (isNeighbor) {
        if (isExternal) {
          background = lightenColor(baseColor, 0.22);
          border = lightenColor(baseColor, 0.3);
          highlightBackground = background;
          highlightBorder = border;
          fontColor = EXTERNAL_NODE_NEIGHBOR_FONT;
        } else {
          background = lightenColor(baseColor, 0.32);
          border = lightenColor(baseColor, 0.45);
          highlightBackground = background;
          highlightBorder = border;
          fontColor = '#334155';
        }
        opacity = 0.78;
        size = clamp(baseSize * 0.95, isExternal ? 14 : 10, isExternal ? 34 : 34);
      } else {
        opacity = 0.35;
        fontColor = isExternal ? '#94a3b8' : '#475569';
      }
    }

    const visNode = {
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
      mass,
      group: isExternal ? node.type : node.theme,
      shape: isExternal ? 'box' : 'dot'
    };

    if (isExternal) {
      visNode.shapeProperties = { borderRadius: 4 };
    }

    return visNode;
  }

  buildTooltip(node, citationCount) {
    if (node.type === 'external_source') {
      const sourceLabel = node.sourceName || node.domain || node.rawHost || 'Fonte externa';
      const coveragePercent = typeof node.coverage === 'number'
        ? Math.round(node.coverage * 100)
        : null;
      const anchorPreview = node.anchorText && node.anchorText.length > 80
        ? `${node.anchorText.slice(0, 77)}…`
        : node.anchorText;

      return `
        <div style="padding: 0.45rem 0.55rem; max-width: 260px;">
          <div style="font-weight:600; margin-bottom:0.35rem;">${node.title}</div>
          <div style="display:inline-flex; align-items:center; padding:0.12rem 0.45rem; font-size:0.72rem; border-radius:999px; background:#1e293b; color:#e2e8f0; margin-bottom:0.35rem;">
            ${sourceLabel}
          </div>
          <div style="font-size:0.75rem; color:#475569;">Citado por ${citationCount} artigos de Paula Schmitt</div>
          ${coveragePercent !== null ? `<div style="font-size:0.75rem; color:#64748b; margin-top:0.25rem;">Cobertura: ${coveragePercent}% dos artigos</div>` : ''}
          ${anchorPreview ? `<div style="font-size:0.72rem; color:#475569; margin-top:0.35rem;">Texto frequente: “${anchorPreview}”</div>` : ''}
        </div>
      `;
    }

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
      const isExternal = node.type === 'external_source';
      const isPrimary = focusActive && primaryIds.has(node.id);
      const isNeighbor = focusActive && neighborIds.has(node.id);
      let fontColor = isExternal ? EXTERNAL_NODE_FONT_COLOR : '#111827';

      if (focusActive) {
        if (isNeighbor && !isPrimary) {
          fontColor = isExternal ? EXTERNAL_NODE_NEIGHBOR_FONT : '#334155';
        } else if (!isPrimary) {
          fontColor = isExternal ? '#94a3b8' : '#475569';
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
