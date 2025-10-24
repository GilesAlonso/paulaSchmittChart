# Paula Schmitt Articles Network

## Project overview
This repository hosts an interactive network visualization that maps how Brazilian journalist Paula Schmitt interconnects her opinion pieces. Each article is represented as a node and edges highlight references and thematic relationships between the texts. The goal is to help readers explore recurring topics, discover related essays, and understand how narratives unfold across Schmitt's body of work.

## Tech stack
- **vis-network** – renders the interactive force-directed graph and manages the node/edge datasets.
- **Bootstrap 5** – provides responsive styling for the layout container and legend.
- **ForceAtlas2 physics** – selected via `vis-network` to control layout dynamics and stabilize the graph.
- **Vanilla HTML, CSS, and JavaScript** – the project is delivered as a single static page without build tooling.

## Architecture
The application is implemented as a single HTML document (`index.html`) that embeds:
- Helper functions for neighbourhood highlighting, filtering, and node selection.
- Inline styles for the network canvas and legend.
- The complete nodes and edges dataset used by vis-network.
- Runtime enhancements that configure physics, upgrade tooltips to rich HTML, and open article links in new browser tabs.

To support future maintenance, the same dataset is now also published as a standalone JSON file (`articles-network.json`). The visualization currently continues to consume the embedded dataset so the existing behaviour is preserved exactly.

## Key features
- **Color-coded legend** – static legend associates node colours with editorial themes.
- **Neighbourhood highlight** – selecting a node softens unrelated items and reveals labels for first- and second-degree connections.
- **Filtering helpers** – programmatic utilities make it easy to extend the UI with filters by node or edge properties.
- **Rich HTML tooltips** – article titles and themes appear in formatted tooltips for improved readability.
- **Clickable nodes** – clicking a node opens the referenced article in a new tab while cursor feedback signals interactivity.
- **Physics controls** – ForceAtlas2 parameters are applied automatically, and the built-in configure panel lets maintainers adjust physics live.

## Dataset reference
The canonical dataset is stored in [`articles-network.json`](./articles-network.json). It follows this structure:

```json
{
  "nodes": [
    {
      "id": "<unique article identifier>",
      "label": "<short label shown in the graph>",
      "title": "<HTML string used inside the tooltip>",
      "color": "<hex colour string matching the legend>",
      "shape": "dot"
    }
  ],
  "edges": [
    {
      "from": "<id of the source article>",
      "to": "<id of the target article>",
      "arrows": "to"
    }
  ]
}
```

### Nodes
- `id`: Must be unique. The current network uses the article URL so the click handler can open the correct page.
- `label`: Shortened title rendered next to the node. Keep it concise for readability.
- `title`: HTML string that appears in the tooltip (rich formatting is supported).
- `color`: Matches the theme legend (e.g., `#3cb44b` for “Brasil”).
- `shape`: Currently `dot` for all nodes to keep a consistent appearance.

### Edges
- `from`: Source article `id` that cites or relates to another article.
- `to`: Target article `id` receiving the citation/relationship.
- `arrows`: Remains `"to"` so arrows point from the referencing article to the referenced one.

## Updating the dataset
1. **Edit `articles-network.json`:** Add, remove, or update node/edge objects while keeping the JSON structure intact. Preserve the use of valid hex colours and unique node IDs.
2. **Mirror changes in `index.html`:** Until the visualization is refactored to load the JSON dynamically, the embedded arrays inside `index.html` must be kept in sync so the live network reflects every change. Update both the `nodes = new vis.DataSet([...])` and `edges = new vis.DataSet([...])` sections accordingly.
3. **Validate tooltips and links:** Ensure each node retains a descriptive `title` string and that `id` values continue to be valid URLs so clicking nodes opens the correct article.
4. **Test locally:** Open `index.html` in a browser and verify layout stability, colours, and interactions (highlighting, tooltips, link behaviour).

When the project evolves to consume the JSON file directly, step 2 will no longer be necessary—the JSON will become the single source of truth.

## Visualization configuration
- **Physics solver:** The script switches vis-network to ForceAtlas2 with customized gravity, damping, and spring constants (`gravitationalConstant: -50`, `centralGravity: 0.01`, `springLength: 100`, `springConstant: 0.08`, `damping: 0.4`, `minVelocity: 0.75`). Adjusting these values changes how tightly clusters form and how fast the layout stabilizes.
- **Configure panel:** vis-network’s built-in configuration widget is exposed via the `#config` container, enabling real-time physics experimentation.
- **Highlighting helpers:** The functions `neighbourhoodHighlight`, `filterHighlight`, `selectNode`, `selectNodes`, and `highlightFilter` can be reused if a dedicated UI for filters or search is added in the future.

## Getting started
No build step is required. Simply open `index.html` in any modern browser to explore the network. Keep both the HTML file and the JSON dataset under version control so updates remain traceable over time.