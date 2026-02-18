// Timeline built from /api/tree/<family>
// Schema expected: { people:[{name,born,died,location:{city,region,country}, events?:[...] }], relationships:[...] }

(() => {
  const familyId = (window.TIMELINE_FAMILY_ID || "gupta").toLowerCase();

  const elStatus = document.getElementById("tlStatus");
  const elList = document.getElementById("tlList");
  const elSearch = document.getElementById("tlSearch");
  const chips = Array.from(document.querySelectorAll(".tlChip"));

  let allEvents = [];
  let activeType = "all";
  let q = "";

  const ICON = { birth:"B", death:"D", marriage:"M", move:"↗", other:"•" };

  function setStatus(msg){ if (elStatus) elStatus.textContent = msg || ""; }

  function safeDate(d){
    if (!d) return null;
    const s = String(d).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + "T00:00:00");
    if (/^\d{4}-\d{2}$/.test(s)) return new Date(s + "-01T00:00:00");
    if (/^\d{4}$/.test(s)) return new Date(s + "-01-01T00:00:00");
    const parsed = new Date(s);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  function fmtDate(d){
    if (!d) return "";
    const dt = safeDate(d);
    if (!dt) return String(d);
    const y = dt.getFullYear();
    const m = String(dt.getMonth()+1).padStart(2,"0");
    const day = String(dt.getDate()).padStart(2,"0");
    const orig = String(d).trim();
    if (/^\d{4}$/.test(orig)) return String(y);
    if (/^\d{4}-\d{2}$/.test(orig)) return `${y}-${m}`;
    return `${y}-${m}-${day}`;
  }

  function getYear(d){
    const dt = safeDate(d);
    return dt ? dt.getFullYear() : "Unknown";
  }

  function computeAge(born, died){
    const b = safeDate(born);
    if (!b) return null;
    const end = died ? safeDate(died) : new Date();
    if (!end) return null;
    let age = end.getFullYear() - b.getFullYear();
    const m = end.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && end.getDate() < b.getDate())) age--;
    return age;
  }

  function escapeHtml(s){
    return String(s || "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function normalize(e){
    return {
      id: e.id || (crypto?.randomUUID ? crypto.randomUUID() : String(Math.random())),
      type: e.type || "other",
      date: e.date || "",
      title: e.title || "",
      meta: e.meta || "",
    };
  }

  function buildEvents(tree){
    const people = Array.isArray(tree.people) ? tree.people : [];
    const ev = [];

    for (const p of people) {
      const name = p.name || "";
      const born = p.born || "";
      const died = p.died || "";

      const loc = p.location || {};
      const where = [loc.city, loc.region, loc.country].filter(Boolean).join(", ");

      if (born) {
        ev.push(normalize({
          type: "birth",
          date: born,
          title: `Birth: ${name}`,
          meta: where ? `Born in ${where}` : ""
        }));
      }

      if (died) {
        const age = computeAge(born, died);
        ev.push(normalize({
          type: "death",
          date: died,
          title: `Death: ${name}`,
          meta: (age != null) ? `Age ${age}` : ""
        }));
      }

      // Optional custom per-person events later:
      // p.events = [{type,date,title,meta}]
      if (Array.isArray(p.events)) {
        for (const ce of p.events) {
          ev.push(normalize({
            type: ce.type || "other",
            date: ce.date || "",
            title: ce.title || `${(ce.type||"Event")}: ${name}`,
            meta: ce.meta || ce.where || ""
          }));
        }
      }
    }

    // newest first
    ev.sort((a,b) => (safeDate(b.date)?.getTime() ?? -Infinity) - (safeDate(a.date)?.getTime() ?? -Infinity));
    return ev;
  }

  function matches(e){
    if (activeType !== "all" && e.type !== activeType) return false;
    if (!q) return true;
    const hay = `${e.title} ${e.meta} ${e.type} ${e.date}`.toLowerCase();
    return hay.includes(q);
  }

  function groupByYear(events){
    const m = new Map();
    for (const e of events){
      const y = getYear(e.date);
      if (!m.has(y)) m.set(y, []);
      m.get(y).push(e);
    }
    const years = Array.from(m.keys()).sort((a,b) => {
      if (a === "Unknown") return 1;
      if (b === "Unknown") return -1;
      return Number(b) - Number(a);
    });
    return years.map(y => ({ year:y, items:m.get(y) }));
  }

  function render(){
    elList.innerHTML = "";
    const filtered = allEvents.filter(matches);

    if (!filtered.length) {
      setStatus("No matching events.");
      return;
    }

    setStatus(`${filtered.length} event${filtered.length === 1 ? "" : "s"}`);

    const groups = groupByYear(filtered);
    const frag = document.createDocumentFragment();

    for (const g of groups){
      const yearWrap = document.createElement("div");
      yearWrap.className = "tlYear";
      yearWrap.innerHTML = `
        <div class="tlYear__head">
          <div class="tlYear__label">${escapeHtml(g.year)}</div>
          <div class="tlYear__rule"></div>
        </div>
      `;

      for (const e of g.items){
        const icon = ICON[e.type] || ICON.other;
        const card = document.createElement("div");
        card.className = "tlItem";
        card.innerHTML = `
          <div class="tlIcon" aria-hidden="true">${icon}</div>
          <div class="tlMain">
            <h3 class="tlTitle">${escapeHtml(e.title)}</h3>
            <div class="tlMeta">${escapeHtml([fmtDate(e.date), e.meta].filter(Boolean).join(" • "))}</div>
            <div class="tlTag">${escapeHtml((e.type || "other").toUpperCase())}</div>
          </div>
        `;
        yearWrap.appendChild(card);
      }

      frag.appendChild(yearWrap);
    }

    elList.appendChild(frag);
  }

  function setActiveChip(type){
    activeType = type;
    chips.forEach(c => c.classList.toggle("is-active", c.dataset.type === type));
    render();
  }

  chips.forEach(c => c.addEventListener("click", () => setActiveChip(c.dataset.type)));
  elSearch.addEventListener("input", (e) => { q = e.target.value.trim().toLowerCase(); render(); });

  async function load(){
    try{
      setStatus("Loading timeline…");
      const r = await fetch(`/api/tree/${familyId}`, { headers: { "Accept":"application/json" } });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const tree = await r.json();
      allEvents = buildEvents(tree);
      render();
    } catch (err){
      console.error(err);
      setStatus("Couldn’t load timeline. (Check console.)");
      elList.innerHTML = "";
    }
  }

  load();
})();
