// static/js/treeConfig.js
// Central config for tree layout + rendering.
// Keep this file as configuration (switches/knobs) + small derived helpers only.

export const TREE_CFG = {
  // Dagre layout (graph -> x/y positions)
  dagre: {
    rankdir: "TB",   // Top-to-bottom generations (parents above children)
    ranksep: 14,     // Generation gap: vertical spacing BETWEEN ranks (in px)
    nodesep: 24,     // Base horizontal padding BETWEEN nodes (in px)
    marginx: 20,     // Left/right padding inside Dagre's bounding box
    marginy: 18,     // Top/bottom padding inside Dagre's bounding box
  },

  // Node/card sizing (SVG px)
  sizing: {
    CARD_W: 170,
    CARD_H: 200,
    CARD_R: 7,
    PHOTO_H: 135,
    BOTTOM_PANEL_H: 65,
  },

  // Card text positions (relative to card top-left)
  text: {
    NAME_Y: 230,
    META_Y: 190,
  },

  // Text styling
  fonts: {
    NAME_PX: 22,
    META_PX: 18,
    WEIGHT_NAME: 700,
    WEIGHT_META: 500,
  },

  // Spacing policy (runtime adjustable)
  spacing: {
    SPOUSE_GAP: 15,    // Horizontal gap between partners in a couple block (1px = just-touching)
    SIBLING_GAP: 60,  // Horizontal gap between siblings within the same generation
    CLUSTER_GAP: 14, // Horizontal gap between separate partner-clusters for the same parent
  },

  // Default/simple-mode pruning rules
  preview: {
    SIMPLE_MAX_KIDS_PER_PARENT: 1,
  },

  // ViewBox framing / padding
  view: {
    minWidth: 750,   // Minimum viewBox width so small trees don't zoom in too far
    minHeight: 620,  // Minimum viewBox height so small trees don't zoom in too far
    pad: 10,         // Padding around the outermost nodes inside the viewBox
    extra: 54,       // Extra headroom for UI overlays (title/buttons) above the SVG content
  },
};

// Derived: compute a safe stem length (vertical drop from a person/couple down to the sibling bus)
// so the horizontal split line never gets hidden under cards.
//
// With TB layout and equal node heights, the free vertical space between generations is TREE_CFG.dagre.ranksep.
// We place the bus roughly mid-gap and enforce a minimum clearance.
export function computeStemLenPx() {
  const gap = Number(TREE_CFG.dagre.ranksep) || 0;
  const minClear = 10;
  return Math.max(minClear, Math.floor(gap / 2));
}
