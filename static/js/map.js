/* map.js
  accordion: Country -> State/Province -> City
  Renders face-only pins and shows an info bubble on hover/tap.
  Data source: /api/public/<slug>/tree OR /api/sample/<id>/tree OR /api/tree/<family>

  UPDATED:
  - Westeros mode uses ONE hero map panel (no duplicate overview/country/state maps)
  - Supports xPct/yPct OR lat/lng everywhere
*/

(function () {
  var API_URL = window.MAP_API_URL || null;
  var FAMILY_NAME = (window.MAP_FAMILY_ID || 'stark');

  function isDesktop() {
    return window.matchMedia && window.matchMedia('(min-width: 900px)').matches;
  }

  function proj(lat, lng) {
    var x = (lng + 180) / 360 * 100;
    var y = (90 - lat) / 180 * 100;
    return { x: x, y: y };
  }

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  // -----------------------------
  // Map background selection
  // -----------------------------
  function getMapBgUrl() {
    var fam = String(FAMILY_NAME || '').toLowerCase();
    var api = String(API_URL || '').toLowerCase();

    var isStark = (fam.indexOf('stark') !== -1) || (api.indexOf('/sample/stark') !== -1);
    var isLannister = (fam.indexOf('lannister') !== -1) || (api.indexOf('/sample/lannister') !== -1);

    if (isStark || isLannister) return '/static/img/westeros-muted.png';
    return '/static/img/world-muted.png';
  }

  function isWesterosMode() {
    return getMapBgUrl().indexOf('westeros') !== -1;
  }

  // -----------------------------
  // Zoom levels tuned per map
  // -----------------------------
  function getZoom() {
    return isWesterosMode()
      ? { world: 170, country: 220, state: 320, city: 450 }
      : { world: 240, country: 360, state: 600, city: 900 };
  }
  var ZOOM = getZoom();

  // -----------------------------
  // Camera centers (percent)
  // -----------------------------
  var CENTER = {
    // Earth examples
    'Canada': { x: 40, y: 36 },
    'United States': { x: 32, y: 48 },
    'India': { x: 64, y: 52 },
    'Ontario': { x: 52, y: 34 },
    'New York': { x: 44, y: 40 },
    'California': { x: 18, y: 54 },
    'West Bengal': { x: 66, y: 47 },
    'Maharashtra': { x: 58, y: 57 },

    // Westeros
    'Westeros': { x: 50, y: 45 },
    'The North': { x: 50, y: 28 },
    'Winterfell': { x: 50, y: 28 },
    'The Riverlands': { x: 52, y: 52 },
    "King's Landing": { x: 62, y: 58 },
    'Crownlands': { x: 62, y: 58 },
    'The Westerlands': { x: 36, y: 54 },
    'Casterly Rock': { x: 34, y: 54 },
    'Dorne': { x: 58, y: 86 }
  };

  function mapView(el, label, zoomPct) {
    var c = CENTER[label] || { x: 50, y: 50 };
    el.style.backgroundSize = String(zoomPct) + '% auto';
    el.style.backgroundPosition =
      String(clamp(c.x, 0, 100)) + '% ' + String(clamp(c.y, 0, 100)) + '%';
  }

  // -----------------------------
  // Location support helpers
  // -----------------------------
  function hasXY(loc) { return loc && loc.xPct != null && loc.yPct != null; }
  function hasLL(loc) { return loc && loc.lat != null && loc.lng != null; }

  // -----------------------------
  // Grouping
  // -----------------------------
  function groupPeople(people) {
    var countries = {};
    for (var i = 0; i < people.length; i++) {
      var p = people[i];
      var loc = p.location || {};
      if (!loc.country || (!hasXY(loc) && !hasLL(loc))) continue;

      var country = loc.country;
      var region = loc.region || 'Unknown';
      var city = loc.city || 'Unknown';

      if (!countries[country]) countries[country] = { label: country, states: {} };
      if (!countries[country].states[region]) countries[country].states[region] = { label: region, cities: {} };
      if (!countries[country].states[region].cities[city]) countries[country].states[region].cities[city] = { label: city, people: [] };

      countries[country].states[region].cities[city].people.push(p);
    }
    return countries;
  }

  // -----------------------------
  // Tooltip
  // -----------------------------
  function createTip(mapEl) {
    var tip = document.createElement('div');
    tip.className = 'pinTip';
    tip.innerHTML = '<div class="pinTip__inner"><div class="pinTip__name"></div><div class="pinTip__meta"></div></div>';
    mapEl.appendChild(tip);
    return tip;
  }

  function showTip(mapEl, tip, pin, data) {
    tip.querySelector('.pinTip__name').textContent = data.name || '';
    var bits = [];
    if (data.age) bits.push('Age ' + data.age);
    var loc = [data.city, data.region, data.country].filter(Boolean).join(', ');
    if (loc) bits.push(loc);
    tip.querySelector('.pinTip__meta').textContent = bits.join(' • ');

    var rect = mapEl.getBoundingClientRect();
    var pr = pin.getBoundingClientRect();
    var cx = (pr.left - rect.left) + pr.width / 2;
    var top = (pr.top - rect.top);

    tip.style.left = String(cx) + 'px';
    tip.style.top = String(top) + 'px';
    tip.classList.add('open');

    var inner = tip.querySelector('.pinTip__inner');
    requestAnimationFrame(function () {
      var w = inner.offsetWidth;
      var h = inner.offsetHeight;
      var left = clamp(cx - w / 2, 10, mapEl.clientWidth - w - 10);
      var y = clamp(top - h - 10, 10, mapEl.clientHeight - h - 10);
      inner.style.transform = 'translate(' + String(left - cx) + 'px,' + String(y - top) + 'px)';
    });
  }

  function hideTip(tip) {
    if (!tip) return;
    tip.classList.remove('open');
    var inner = tip.querySelector('.pinTip__inner');
    if (inner) inner.style.transform = 'translate(0,0)';
  }

  // -----------------------------
  // Pins
  // -----------------------------
  function guessAge(person) {
    var born = person.born;
    if (!born) return '';
    var m = String(born).match(/(\d{4})/);
    if (!m) return '';
    var y = parseInt(m[1], 10);
    var now = new Date().getFullYear();
    var age = now - y;
    if (age < 0 || age > 120) return '';
    return String(age);
  }

  function pinEl(person, country, region, city) {
    var loc = person.location || {};
    var xy = hasXY(loc) ? { x: Number(loc.xPct), y: Number(loc.yPct) } : proj(loc.lat, loc.lng);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pin';
    btn.style.left = String(xy.x) + '%';
    btn.style.top = String(xy.y) + '%';
    btn.setAttribute('aria-label', person.name || 'Location pin');

    var img = document.createElement('img');
    img.src = person.photo || '/static/img/placeholder-avatar.png';
    img.alt = '';
    btn.appendChild(img);

    btn._meta = {
      name: person.name,
      age: guessAge(person),
      city: city,
      region: region,
      country: country
    };
    return btn;
  }

  // -----------------------------
  // Map container
  // -----------------------------
  function buildMapCard(label, zoomLevel) {
    var map = document.createElement('div');
    map.className = 'accMap';
    map.style.backgroundImage = 'url(' + getMapBgUrl() + ')';
    mapView(map, label, zoomLevel);
    return map;
  }

  // -----------------------------
  // People UI
  // -----------------------------
  function buildPeopleGrid(people, compact) {
    var grid = document.createElement('div');
    grid.className = compact ? 'peopleGrid peopleGrid--compact' : 'peopleGrid';

    people = people.slice().sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''));
    });

    for (var i = 0; i < people.length; i++) {
      var p = people[i];
      var loc = p.location || {};
      var age = guessAge(p);

      var card = document.createElement('div');
      card.className = 'personCard';
      card.innerHTML =
        '<img class="personPhoto" alt="" src="' + escapeAttr(p.photo || '/static/img/placeholder-avatar.png') + '">' +
        '<div class="personMeta">' +
          '<div class="personName">' + escapeHtml(p.name || '') + '</div>' +
          '<div class="personSub">' +
            (age ? ('Age ' + escapeHtml(age) + ' • ') : '') +
            escapeHtml([loc.city, loc.region].filter(Boolean).join(', ')) +
          '</div>' +
        '</div>';

      var extra = [loc.city, loc.region, loc.country].filter(Boolean).join(', ');
      if (extra) card.title = extra;

      grid.appendChild(card);
    }
    return grid;
  }

  function buildRegionPills(countryObj) {
    var wrap = document.createElement('div');
    wrap.className = 'regionRow';

    var states = countryObj.states || {};
    var names = Object.keys(states).sort();
    for (var i = 0; i < names.length; i++) {
      var r = names[i];
      var count = 0;
      var cities = states[r].cities || {};
      var cn = Object.keys(cities);
      for (var j = 0; j < cn.length; j++) count += (cities[cn[j]].people || []).length;

      var pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'regionPill';
      pill.textContent = r + ' (' + String(count) + ')';
      pill._regionName = r;
      wrap.appendChild(pill);
    }
    return wrap;
  }

  // -----------------------------
  // ONE-PANEL Westeros view
  // -----------------------------
  function buildSinglePanel(root, countries, allPeople) {
    root.innerHTML = '';

    var isW = isWesterosMode();
    var title = isW ? 'Westeros' : 'World';

    var wrap = document.createElement('div');
    wrap.className = 'mapSingle';

    // Header strip
    var head = document.createElement('div');
    head.className = 'mapSingleHead';
    head.innerHTML =
      '<div class="mapSingleTitle">' + escapeHtml(title) + '</div>' +
      '<div class="mapSingleSub">Tap a pin to view details. Use regions below to refocus the map.</div>';
    wrap.appendChild(head);

    // Hero map
    var map = buildMapCard(title, ZOOM.world);
    var tip = createTip(map);

    // Pins (all people)
    for (var i = 0; i < allPeople.length; i++) {
      var p = allPeople[i];
      var loc = p.location || {};
      if (!loc.country || (!hasXY(loc) && !hasLL(loc))) continue;

      var pin = pinEl(p, loc.country, loc.region || '', loc.city || '');
      map.appendChild(pin);

      (function (pinRef, meta) {
        pinRef.addEventListener('mouseenter', function () { showTip(map, tip, pinRef, meta); });
        pinRef.addEventListener('mouseleave', function () { hideTip(tip); });
        pinRef.addEventListener('focus', function () { showTip(map, tip, pinRef, meta); });
        pinRef.addEventListener('blur', function () { hideTip(tip); });
        pinRef.addEventListener('click', function (e) {
          e.stopPropagation();
          var open = tip.classList.contains('open') && tip._openFor === pinRef;
          if (open) { hideTip(tip); tip._openFor = null; }
          else { tip._openFor = pinRef; showTip(map, tip, pinRef, meta); }
        });
      })(pin, pin._meta);
    }
    map.addEventListener('click', function () { hideTip(tip); });

    wrap.appendChild(map);

    // Region pills (only makes sense when there are regions)
    // If there is exactly 1 country, use that. Otherwise pick first.
    var cNames = Object.keys(countries);
    if (cNames.length > 0) {
      var primary = countries[cNames[0]];
      var pills = buildRegionPills(primary);

      pills.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('.regionPill') : null;
        if (!btn) return;
        var regionName = btn._regionName;
        mapView(map, regionName, ZOOM.state);
      });

      wrap.appendChild(pills);
    }

    // People grid
    wrap.appendChild(buildPeopleGrid(allPeople, true));

    root.appendChild(wrap);
  }

  // -----------------------------
  // Default accordion view (Earth / multi-country)
  // -----------------------------
  function buildAccordion(root, countries) {
    root.innerHTML = '';

    // Desktop: add a single overview first
    if (isDesktop()) {
      var allPeople = flattenPeople(countries);
      root.appendChild(buildWorldOverview(allPeople));
    }

    var countryNames = Object.keys(countries).sort();
    for (var i = 0; i < countryNames.length; i++) {
      var cName = countryNames[i];
      var c = countries[cName];

      var cWrap = document.createElement('details');
      cWrap.className = 'acc';
      cWrap.open = true;

      var cSum = document.createElement('summary');
      cSum.className = 'accHead';
      cSum.innerHTML = '<span class="accTitle">' + escapeHtml(cName) + '</span>';
      cWrap.appendChild(cSum);

      var cBody = document.createElement('div');
      cBody.className = 'accBody';

      var cMap = buildMapCard(cName, ZOOM.country);
      var cTip = createTip(cMap);

      var states = c.states;
      var stateNames = Object.keys(states).sort();
      for (var s = 0; s < stateNames.length; s++) {
        var sName = stateNames[s];
        var st = states[sName];
        var cityNames = Object.keys(st.cities).sort();

        for (var ci = 0; ci < cityNames.length; ci++) {
          var city = st.cities[cityNames[ci]];
          for (var p = 0; p < city.people.length; p++) {
            var pe = city.people[p];
            var pin = pinEl(pe, cName, sName, city.label);
            cMap.appendChild(pin);

            (function (pinRef, meta) {
              pinRef.addEventListener('mouseenter', function () { showTip(cMap, cTip, pinRef, meta); });
              pinRef.addEventListener('mouseleave', function () { hideTip(cTip); });
              pinRef.addEventListener('focus', function () { showTip(cMap, cTip, pinRef, meta); });
              pinRef.addEventListener('blur', function () { hideTip(cTip); });
              pinRef.addEventListener('click', function (e) {
                e.stopPropagation();
                var open = cTip.classList.contains('open') && cTip._openFor === pinRef;
                if (open) { hideTip(cTip); cTip._openFor = null; }
                else { cTip._openFor = pinRef; showTip(cMap, cTip, pinRef, meta); }
              });
            })(pin, pin._meta);
          }
        }
      }

      cMap.addEventListener('click', function () { hideTip(cTip); });
      cBody.appendChild(cMap);
      cBody.appendChild(buildPeopleGrid(flattenCountryPeople(c), true));

      cWrap.appendChild(cBody);
      root.appendChild(cWrap);

      (function (mapEl, lab, z) {
        cWrap.addEventListener('toggle', function () { mapView(mapEl, lab, z); });
      })(cMap, cName, ZOOM.country);
    }
  }

  function flattenCountryPeople(countryObj) {
    var people = [];
    var states = countryObj.states || {};
    var sNames = Object.keys(states);
    for (var i = 0; i < sNames.length; i++) {
      var st = states[sNames[i]];
      var cNames = Object.keys(st.cities || {});
      for (var j = 0; j < cNames.length; j++) {
        var city = st.cities[cNames[j]];
        for (var k = 0; k < (city.people || []).length; k++) people.push(city.people[k]);
      }
    }
    return people;
  }

  function flattenPeople(countries) {
    var all = [];
    var cn = Object.keys(countries);
    for (var i = 0; i < cn.length; i++) {
      all = all.concat(flattenCountryPeople(countries[cn[i]]));
    }
    return all;
  }

  function buildWorldOverview(people) {
    var wrap = document.createElement('details');
    wrap.className = 'acc accWorld';
    wrap.open = true;

    var sum = document.createElement('summary');
    sum.className = 'accHead';

    var isW = isWesterosMode();
    sum.innerHTML = '<span class="accTitle">' + (isW ? 'Westeros' : 'World') + '</span>';
    wrap.appendChild(sum);

    var body = document.createElement('div');
    body.className = 'accBody';

    var map = buildMapCard(isW ? 'Westeros' : 'World', ZOOM.world);
    var tip = createTip(map);

    for (var i = 0; i < people.length; i++) {
      var p = people[i];
      var loc = p.location || {};
      if (!loc.country || (!hasXY(loc) && !hasLL(loc))) continue;

      var pin = pinEl(p, loc.country, loc.region || '', loc.city || '');
      map.appendChild(pin);

      (function (pinRef, meta) {
        pinRef.addEventListener('mouseenter', function () { showTip(map, tip, pinRef, meta); });
        pinRef.addEventListener('mouseleave', function () { hideTip(tip); });
        pinRef.addEventListener('focus', function () { showTip(map, tip, pinRef, meta); });
        pinRef.addEventListener('blur', function () { hideTip(tip); });
        pinRef.addEventListener('click', function (e) {
          e.stopPropagation();
          var open = tip.classList.contains('open') && tip._openFor === pinRef;
          if (open) { hideTip(tip); tip._openFor = null; }
          else { tip._openFor = pinRef; showTip(map, tip, pinRef, meta); }
        });
      })(pin, pin._meta);
    }
    map.addEventListener('click', function () { hideTip(tip); });

    body.appendChild(map);
    body.appendChild(buildPeopleGrid(people, true));
    wrap.appendChild(body);
    return wrap;
  }

  // -----------------------------
  // Escaping
  // -----------------------------
  function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c;
    });
  }

  // -----------------------------
  // Boot
  // -----------------------------
  function boot() {
    var root = document.getElementById('mapAccordion') || document.getElementById('mapAccRoot');
    if (!root) return;

    var url = API_URL ? API_URL : ('/api/tree/' + encodeURIComponent(FAMILY_NAME));
    fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        var people = (data && data.people) ? data.people : [];
        var grouped = groupPeople(people);
        var allPeople = flattenPeople(grouped);

        // ✅ One-panel in Westeros mode
        if (isWesterosMode()) buildSinglePanel(root, grouped, allPeople);
        else buildAccordion(root, grouped);
      })
      .catch(function (err) {
        root.innerHTML = '<div class="mapLoading">Could not load map data.</div>';
        console.error('Map load failed:', err);
      });
  }

  document.addEventListener('DOMContentLoaded', boot);
})();