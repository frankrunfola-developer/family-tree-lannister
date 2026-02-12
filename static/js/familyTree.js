// familyTree.js
// Card-based genealogy renderer (clean, no glow):
// - Person nodes render as self-contained "cards" with photo + name + birth/death
// - Lines only touch the OUTSIDE EDGE of the card
// - Couples get a connector line between their cards
// - UNION nodes are invisible hubs used for layout + routing

const SVG_NS = "http://www.w3.org/2000/svg";

function el(tag) {
  return document.createElementNS(SVG_NS, tag);
}

function safeId(id) {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, "_");
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] != null && obj[k] !== "") return obj[k];
  }
  return null;
}

function yearFromAny(v) {
  if (v == null) return null;
  if (typeof v === "number") {
    if (v > 999 && v < 3000) return String(v);
    return null;
  }
  const s = String(v).trim();
  // match YYYY anywhere
  const m = s.match(/(19\d{2}|20\d{2}|18\d{2}|17\d{2})/);
  return m ? m[1] : null;
}

// Smooth-ish cubic curve that reads well in trees
function curvePath(x1, y1, x2, y2, bend = 0.22) {
  const dy = y2 - y1;
  const c1y = y1 + dy * bend;
  const c2y = y2 - dy * bend;
  return `M ${x1} ${y1} C ${x1} ${c1y}, ${x2} ${c2y}, ${x2} ${y2}`;
}

export function renderFamilyTree(svgEl, { nodes, links, width = 1200, height = 700 }) {
  const svg = typeof svgEl === "string" ? document.querySelector(svgEl) : svgEl;
  if (!svg) throw new Error("SVG element not found");

  // Clear SVG
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));

  // --- Layout constants (tune here) ---
  const CARD_W = 210;
  const CARD_H = 185;
  const CARD_R = 16;

  const PHOTO_SIZE = 100; // square (we clip to circle)
  const PHOTO_R = 48;

  const NAME_Y = 135;
  const META_Y = 162;

  // Anchor points on card edges
  const topAnchor = (p) => ({ x: p.x, y: p.y - CARD_H / 2 });
  const bottomAnchor = (p) => ({ x: p.x, y: p.y + CARD_H / 2 });
  const leftAnchorAt = (p, y) => ({ x: p.x - CARD_W / 2, y });
  const rightAnchorAt = (p, y) => ({ x: p.x + CARD_W / 2, y });

  // defs for clipPaths
  const defs = el("defs");
  svg.appendChild(defs);

  // viewport (pan/zoom group)
  const viewport = el("g");
  viewport.setAttribute("id", "viewport");
  svg.appendChild(viewport);

  const gLinks = el("g");
  gLinks.setAttribute("class", "links");
  viewport.appendChild(gLinks);

  const gNodes = el("g");
  gNodes.setAttribute("class", "nodes");
  viewport.appendChild(gNodes);

  const byId = new Map((nodes ?? []).map((n) => [String(n.id), n]));
  const isUnion = (id) => byId.get(String(id))?.kind === "union";

  // unionId -> { parents:Set, children:Set }
  const unions = new Map();
  for (const l of links ?? []) {
    const s = String(l.sourceId);
    const t = String(l.targetId);

    if (isUnion(t) && !isUnion(s)) {
      if (!unions.has(t)) unions.set(t, { parents: new Set(), children: new Set() });
      unions.get(t).parents.add(s);
    } else if (isUnion(s) && !isUnion(t)) {
      if (!unions.has(s)) unions.set(s, { parents: new Set(), children: new Set() });
      unions.get(s).children.add(t);
    }
  }

  // --- Link styling (inline so you aren't fighting CSS) ---
  const makePath = (d, cls) => {
    const p = el("path");
    p.setAttribute("d", d);
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", "rgba(255,255,255,0.62)");
    p.setAttribute("stroke-width", "2.4");
    p.setAttribute("stroke-linecap", "round");
    p.setAttribute("opacity", "0.95");
    if (cls) p.setAttribute("class", cls);
    return p;
  };

  const makeLine = (x1, y1, x2, y2, stroke = "rgba(255,255,255,0.65)", widthPx = 2.6) => {
    const ln = el("line");
    ln.setAttribute("x1", String(x1));
    ln.setAttribute("y1", String(y1));
    ln.setAttribute("x2", String(x2));
    ln.setAttribute("y2", String(y2));
    ln.setAttribute("stroke", stroke);
    ln.setAttribute("stroke-width", String(widthPx));
    ln.setAttribute("stroke-linecap", "round");
    ln.setAttribute("opacity", "0.95");
    return ln;
  };

  // ---------- DRAW LINKS ----------
  for (const [uId, pc] of unions.entries()) {
    const u = byId.get(uId);
    if (!u) continue;

    const parents = [...pc.parents].map((pid) => byId.get(pid)).filter(Boolean);
    const kids = [...pc.children].map((cid) => byId.get(cid)).filter(Boolean);

    if (!parents.length && !kids.length) continue;

    // Couples: draw a connector between partner cards (NO marriage bar)
    // If more than 2 parents exist, connect them left->right in sequence.
    if (parents.length >= 2) {
      parents.sort((a, b) => a.x - b.x);

      // a nice line height that reads as "couple" without boxing the diagram
      const y = parents[0].y - CARD_H / 2 + 76;

      for (let i = 0; i < parents.length - 1; i++) {
        const a = parents[i];
        const b = parents[i + 1];

        const aPt = rightAnchorAt(a, y);
        const bPt = leftAnchorAt(b, y);

        // only draw if there's room (prevents weird overlap when very close)
        if (bPt.x - aPt.x > 10) {
          gLinks.appendChild(makeLine(aPt.x, aPt.y, bPt.x, bPt.y, "rgba(210,230,255,0.70)", 3.2));
        }
      }
    }

    // Hub point is the union node position
    const hubX = u.x;
    const hubY = u.y;

    // Parents -> hub (from bottom edge of parent card)
    for (const p of parents) {
      const a = bottomAnchor(p);
      const d = curvePath(a.x, a.y, hubX, hubY, 0.25);
      const path = makePath(d, "parent-link");
      path.setAttribute("stroke", "rgba(210,230,255,0.68)");
      path.setAttribute("stroke-width", "2.6");
      gLinks.appendChild(path);
    }

    // Hub -> children (to top edge of child card)
    for (const c of kids) {
      const a = topAnchor(c);
      const d = curvePath(hubX, hubY, a.x, a.y, 0.18);
      const path = makePath(d, "child-link");
      path.setAttribute("stroke", "rgba(255,255,255,0.60)");
      path.setAttribute("stroke-width", "2.4");
      gLinks.appendChild(path);
    }

    // Optional tiny hub dot (subtle). Comment out if you want it completely invisible.
    const dot = el("circle");
    dot.setAttribute("cx", String(hubX));
    dot.setAttribute("cy", String(hubY));
    dot.setAttribute("r", "2.2");
    dot.setAttribute("fill", "rgba(255,255,255,0.45)");
    dot.setAttribute("opacity", "0.9");
    gLinks.appendChild(dot);
  }

  // ---------- DRAW NODES ----------
  for (const n of nodes ?? []) {
    if (n.kind === "union") continue;

    const id = String(n.id);
    const raw = n._raw ?? {};

    const name = n.label ?? id;

    const birth = yearFromAny(
      pick(raw, ["birthYear", "bornYear", "birth", "born", "dob", "dateOfBirth"])
    );

    const death = yearFromAny(
      pick(raw, ["deathYear", "diedYear", "death", "died", "dod", "dateOfDeath"])
    );

    const meta =
      birth && death ? `${birth} – ${death}` :
      birth ? `b. ${birth}` :
      death ? `d. ${death}` :
      "";

    // group at node center
    const group = el("g");
    group.setAttribute("transform", `translate(${n.x}, ${n.y})`);
    group.setAttribute("data-id", id);
    group.setAttribute("class", "node H");
    gNodes.appendChild(group);

    // Card (drawn centered)
    const rect = el("rect");
    rect.setAttribute("x", String(-CARD_W / 2));
    rect.setAttribute("y", String(-CARD_H / 2));
    rect.setAttribute("width", String(CARD_W));
    rect.setAttribute("height", String(CARD_H));
    rect.setAttribute("rx", String(CARD_R));
    rect.setAttribute("ry", String(CARD_R));
    rect.setAttribute("fill", "rgba(16, 20, 28, 0.92)");
    rect.setAttribute("stroke", "rgba(255,255,255,0.14)");
    rect.setAttribute("stroke-width", "1.4");
    group.appendChild(rect);

    // Photo circle clip
    const clipId = `clip_${safeId(id)}`;
    const clipPath = el("clipPath");
    clipPath.setAttribute("id", clipId);

    const clipCircle = el("circle");
    clipCircle.setAttribute("cx", "0");
    clipCircle.setAttribute("cy", String(-CARD_H / 2 + 64));
    clipCircle.setAttribute("r", String(PHOTO_R));
    clipPath.appendChild(clipCircle);
    defs.appendChild(clipPath);

    // Photo background circle (if no photo or while loading)
    const photoBg = el("circle");
    photoBg.setAttribute("cx", "0");
    photoBg.setAttribute("cy", String(-CARD_H / 2 + 64));
    photoBg.setAttribute("r", String(PHOTO_R + 3));
    photoBg.setAttribute("fill", "rgba(255,255,255,0.08)");
    photoBg.setAttribute("stroke", "rgba(255,255,255,0.20)");
    photoBg.setAttribute("stroke-width", "1.6");
    group.appendChild(photoBg);

    if (n.photoUrl) {
      const img = el("image");
      img.setAttribute("href", n.photoUrl);
      img.setAttribute("x", String(-PHOTO_SIZE / 2));
      img.setAttribute("y", String(-CARD_H / 2 + 64 - PHOTO_SIZE / 2));
      img.setAttribute("width", String(PHOTO_SIZE));
      img.setAttribute("height", String(PHOTO_SIZE));
      img.setAttribute("preserveAspectRatio", "xMidYMid slice");
      img.setAttribute("clip-path", `url(#${clipId})`);
      group.appendChild(img);
    }

    // Name (below photo)
    const nameText = el("text");
    nameText.setAttribute("x", "0");
    nameText.setAttribute("y", String(-CARD_H / 2 + NAME_Y));
    nameText.setAttribute("text-anchor", "middle");
    nameText.setAttribute("font-size", "22");
    nameText.setAttribute("font-weight", "500");
    nameText.setAttribute("fill", "rgba(245,248,255,0.92)");
    nameText.textContent = name;
    group.appendChild(nameText);

    // Meta line (birth/death)
    if (meta) {
      const metaText = el("text");
      metaText.setAttribute("x", "0");
      metaText.setAttribute("y", String(-CARD_H / 2 + META_Y));
      metaText.setAttribute("text-anchor", "middle");
      metaText.setAttribute("font-size", "18");
      metaText.setAttribute("fill", "rgba(245,248,255,0.70)");
      metaText.textContent = meta;
      group.appendChild(metaText);
    }

    // Subtle hover target (optional visual affordance)
    const hit = el("rect");
    hit.setAttribute("x", String(-CARD_W / 2));
    hit.setAttribute("y", String(-CARD_H / 2));
    hit.setAttribute("width", String(CARD_W));
    hit.setAttribute("height", String(CARD_H));
    hit.setAttribute("rx", String(CARD_R));
    hit.setAttribute("ry", String(CARD_R));
    hit.setAttribute("fill", "transparent");
    hit.setAttribute("pointer-events", "all");
    group.appendChild(hit);
  }

  return { viewport };
}
