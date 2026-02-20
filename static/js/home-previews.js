// static/js/home-previews.js
// Small, fast previews for landing + samples pages.

function el(tag, attrs = {}) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    if (k === "class") n.className = v;
    else n.setAttribute(k, String(v));
  }
  return n;
}

function svgEl(tag, attrs = {}) {
  const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    n.setAttribute(k, String(v));
  }
  return n;
}

function firstPhoto(p) {
  if (!p) return null;
  return p.photoUrl || p.photo || p.imageUrl || null;
}

function renderTreePreview(svg, data) {
  if (!svg || !data) return;
  const parents = Array.isArray(data.parents) ? data.parents.filter(Boolean) : [];
  const kids = Array.isArray(data.children) ? data.children.filter(Boolean) : [];

  // Simple layout: 2 parents top, 3-6 kids below.
  const W = 320;
  const H = 150;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.innerHTML = "";

  const bg = svgEl("rect", {
    x: 1,
    y: 1,
    width: W - 2,
    height: H - 2,
    rx: 14,
    ry: 14,
    fill: "rgba(255,255,255,.55)",
    stroke: "rgba(120,92,70,.22)",
    "stroke-width": 2,
  });
  svg.appendChild(bg);

  const pad = 18;
  const topY = 42;
  const botY = 108;
  const avatar = 28;
  const stroke = "rgba(95,65,46,.55)";

  function drawAvatar(cx, cy, photo) {
    const g = svgEl("g");
    const circle = svgEl("circle", {
      cx,
      cy,
      r: avatar,
      fill: "rgba(255,255,255,.85)",
      stroke: "rgba(120,92,70,.32)",
      "stroke-width": 3,
    });
    g.appendChild(circle);
    if (photo) {
      const img = svgEl("image", {
        href: photo,
        x: cx - avatar,
        y: cy - avatar,
        width: avatar * 2,
        height: avatar * 2,
        preserveAspectRatio: "xMidYMid slice",
        clipPath: "url(#clipP)",
      });
      g.appendChild(img);
    }
    return g;
  }

  // single clipPath used for all images (circle)
  const defs = svgEl("defs");
  const clip = svgEl("clipPath", { id: "clipP" });
  clip.appendChild(svgEl("circle", { cx: 0, cy: 0, r: avatar }));
  defs.appendChild(clip);
  svg.appendChild(defs);

  // Place parents
  const pX = parents.length > 1 ? [W * 0.38, W * 0.62] : [W * 0.5];
  parents.slice(0, 2).forEach((p, i) => {
    const photo = firstPhoto(p);
    const g = drawAvatar(pX[i] ?? W * 0.5, topY, null);
    // If photo exists, draw an image manually with per-node clip transform
    // (use <pattern> would be heavier). For now: no photo in preview if CORS issues.
    svg.appendChild(g);
  });

  // Join line
  if (parents.length >= 2) {
    svg.appendChild(svgEl("line", {
      x1: pX[0],
      y1: topY + avatar + 8,
      x2: pX[1],
      y2: topY + avatar + 8,
      stroke,
      "stroke-width": 4,
      "stroke-linecap": "round",
    }));
  }

  // Trunk
  svg.appendChild(svgEl("line", {
    x1: W * 0.5,
    y1: topY + avatar + 8,
    x2: W * 0.5,
    y2: botY - avatar - 10,
    stroke,
    "stroke-width": 3,
    "stroke-linecap": "round",
  }));

  // Kids row
  const maxKids = Math.min(6, kids.length || 6);
  const kCount = maxKids || 5;
  const startX = pad + avatar;
  const endX = W - pad - avatar;
  const step = kCount > 1 ? (endX - startX) / (kCount - 1) : 0;
  for (let i = 0; i < kCount; i++) {
    const cx = startX + step * i;
    svg.appendChild(svgEl("circle", {
      cx,
      cy: botY,
      r: 22,
      fill: "rgba(255,255,255,.82)",
      stroke: "rgba(120,92,70,.28)",
      "stroke-width": 3,
    }));
  }
}

function renderTimelinePreview(container, people) {
  if (!container) return;
  const items = Array.isArray(people) ? people.slice(0, 6) : [];
  container.innerHTML = "";

  const row = el("div", { class: "miniAvatarRow" });
  const line = el("div", { class: "miniLine" });
  container.appendChild(line);
  container.appendChild(row);

  const count = Math.max(4, items.length);
  for (let i = 0; i < count; i++) {
    const p = items[i];
    const a = el("div", { class: "miniAvatar" });
    const photo = firstPhoto(p);
    if (photo) {
      const img = el("img", { src: photo, alt: "", loading: "lazy" });
      a.appendChild(img);
    }
    row.appendChild(a);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const svg = document.getElementById("treePreviewSvg");
  if (svg && window.TREE_PREVIEW_DATA) renderTreePreview(svg, window.TREE_PREVIEW_DATA);

  const tl = document.getElementById("timelinePreview");
  if (tl && window.TIMELINE_PREVIEW_DATA) renderTimelinePreview(tl, window.TIMELINE_PREVIEW_DATA);
});
