/* map.js
  accordion: Country -> State/Province -> City
   Renders face-only pins and shows an info bubble on hover/tap.
   Data source: /api/public/<slug>/tree OR /api/sample/<id>/tree OR /api/tree/<family>
*/
(function () {
  // Prefer explicit API URL (public/sample/me). If absent, fall back to family id route.
  var API_URL = window.MAP_API_URL || null;

  // If we must fall back to /api/tree/<family>, default to the Stark demo dataset when not logged in.
  var FAMILY_NAME = (window.MAP_FAMILY_ID || 'stark');

  function isDesktop() {
    return window.matchMedia && window.matchMedia('(min-width: 900px)').matches;
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function proj(lat, lng) {
    // equirectangular projection to percent
    var x = (lng + 180) / 360 * 100;
    var y = (90 - lat) / 180 * 100;
    return { x: x, y: y };
  }

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  // Zoom levels (increase for more spacing)
  var ZOOM = { country: 360, state: 600, city: 900 };

  // Background "camera" centers (percent)
  var CENTER = {
    'Canada': { x: 40, y: 36 },
    'United States': { x: 32, y: 48 },
    'India': { x: 64, y: 52 },
    'Ontario': { x: 52, y: 34 },
    'New York': { x: 44, y: 40 },
    'California': { x: 18, y: 54 },
    'West Bengal': { x: 66, y: 47 },
    'Maharashtra': { x: 58, y: 57 }
  };

  function mapView(el, label, zoomPct) {
    var c = CENTER[label] || { x: 50, y: 50 };
    el.style.backgroundSize = String(zoomPct) + '% auto';
    el.style.backgroundPosition = String(clamp(c.x, 0, 100)) + '% ' + String(clamp(c.y, 0, 100)) + '%';
  }

  function groupPeople(people) {
    var countries = {};
    for (var i = 0; i < people.length; i++) {
      var p = people[i];
      var loc = p.location || {};
      if (!loc.country || loc.lat == null || loc.lng == null) continue;

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

    // Position in map coordinates
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

  function pinEl(person, country, region, city) {
    var loc = person.location;
    var xy = proj(loc.lat, loc.lng);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pin';
    btn.style.left = String(xy.x) + '%';
    btn.style.top = String(xy.y) + '%';
    btn.setAttribute('aria-label', person.name);

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

  function guessAge(person) {
    // If born is a year, compute rough age; otherwise blank.
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

  function buildMapCard(label, zoomLevel) {
    var map = document.createElement('div');
    map.className = 'accMap';
    map.style.backgroundImage = 'url(/static/img/world-muted.png)';
    mapView(map, label, zoomLevel);
    return map;
  }

  function buildAccordion(root, countries) {
    root.innerHTML = '';

    // Desktop: add a single "World" overview first (all pins + readable list)
    if (isDesktop()) {
      var allPeople = [];
      var cn = Object.keys(countries);
      for (var a = 0; a < cn.length; a++) {
        var c0 = countries[cn[a]];
        var states0 = c0.states;
        var s0 = Object.keys(states0);
        for (var b = 0; b < s0.length; b++) {
          var st0 = states0[s0[b]];
          var cits0 = Object.keys(st0.cities);
          for (var d = 0; d < cits0.length; d++) {
            var city0 = st0.cities[cits0[d]];
            for (var e = 0; e < city0.people.length; e++) allPeople.push(city0.people[e]);
          }
        }
      }
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

      // add pins for whole country (all people)
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

      // Mobile-friendly: show a readable grid list for this country (2+ per row)
      cBody.appendChild(buildPeopleGridForCountry(c));

      // states accordion
      for (var si = 0; si < stateNames.length; si++) {
        var sn = stateNames[si];
        var st2 = states[sn];

        var sDetails = document.createElement('details');
        sDetails.className = 'acc sub';
        sDetails.open = false;

        var sSum = document.createElement('summary');
        sSum.className = 'accHead';
        sSum.innerHTML = '<span class="accTitle">' + escapeHtml(sn) + '</span>';
        sDetails.appendChild(sSum);

        var sBody = document.createElement('div');
        sBody.className = 'accBody';

        var sMap = buildMapCard(sn, ZOOM.state);
        var sTip = createTip(sMap);

        var cityN2 = Object.keys(st2.cities).sort();
        for (var cj = 0; cj < cityN2.length; cj++) {
          var ct = st2.cities[cityN2[cj]];
          for (var pp = 0; pp < ct.people.length; pp++) {
            var pe2 = ct.people[pp];
            var pin2 = pinEl(pe2, cName, sn, ct.label);
            sMap.appendChild(pin2);

            (function (pinRef2, meta2) {
              pinRef2.addEventListener('mouseenter', function () { showTip(sMap, sTip, pinRef2, meta2); });
              pinRef2.addEventListener('mouseleave', function () { hideTip(sTip); });
              pinRef2.addEventListener('focus', function () { showTip(sMap, sTip, pinRef2, meta2); });
              pinRef2.addEventListener('blur', function () { hideTip(sTip); });
              pinRef2.addEventListener('click', function (e) {
                e.stopPropagation();
                var open2 = sTip.classList.contains('open') && sTip._openFor === pinRef2;
                if (open2) { hideTip(sTip); sTip._openFor = null; }
                else { sTip._openFor = pinRef2; showTip(sMap, sTip, pinRef2, meta2); }
              });
            })(pin2, pin2._meta);
          }
        }

        sMap.addEventListener('click', function () { hideTip(sTip); });
        sBody.appendChild(sMap);

        // city pills (just for quick sense, not filtering yet)
        var pills = document.createElement('div');
        pills.className = 'cityRow';
        for (var ck = 0; ck < cityN2.length; ck++) {
          var cname = cityN2[ck];
          var count = st2.cities[cname].people.length;
          var pill = document.createElement('span');
          pill.className = 'cityPill';
          pill.textContent = cname + ' (' + String(count) + ')';
          pills.appendChild(pill);
        }
        sBody.appendChild(pills);

        sDetails.appendChild(sBody);
        cBody.appendChild(sDetails);

        // re-apply view when toggled (keeps framing)
        (function (mapEl, lab, z) {
          sDetails.addEventListener('toggle', function () { mapView(mapEl, lab, z); });
        })(sMap, sn, ZOOM.state);
      }

      cWrap.appendChild(cBody);
      root.appendChild(cWrap);

      (function (mapEl, lab, z) {
        cWrap.addEventListener('toggle', function () { mapView(mapEl, lab, z); });
      })(cMap, cName, ZOOM.country);
    }
  }

  function buildWorldOverview(people) {
    var wrap = document.createElement('details');
    wrap.className = 'acc accWorld';
    wrap.open = true;

    var sum = document.createElement('summary');
    sum.className = 'accHead';
    sum.innerHTML = '<span class="accTitle">World</span>';
    wrap.appendChild(sum);

    var body = document.createElement('div');
    body.className = 'accBody';

    var map = buildMapCard('World', 240);
    var tip = createTip(map);

    // pins
    for (var i = 0; i < people.length; i++) {
      var p = people[i];
      var loc = p.location || {};
      if (!loc.country || loc.lat == null || loc.lng == null) continue;
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
    body.appendChild(buildPeopleGrid(people));
    wrap.appendChild(body);
    return wrap;
  }

  function buildPeopleGridForCountry(countryObj) {
    var people = [];
    var states = countryObj.states;
    var sNames = Object.keys(states);
    for (var i = 0; i < sNames.length; i++) {
      var st = states[sNames[i]];
      var cNames = Object.keys(st.cities);
      for (var j = 0; j < cNames.length; j++) {
        var city = st.cities[cNames[j]];
        for (var k = 0; k < city.people.length; k++) people.push(city.people[k]);
      }
    }
    return buildPeopleGrid(people, true);
  }

  function buildPeopleGrid(people, compact) {
    var grid = document.createElement('div');
    grid.className = compact ? 'peopleGrid peopleGrid--compact' : 'peopleGrid';

    // stable ordering
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

      // More info on hover (desktop) / long-press friendly via title
      var extra = [loc.city, loc.region, loc.country].filter(Boolean).join(', ');
      if (extra) card.title = extra;
      grid.appendChild(card);
    }
    return grid;
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c;
    });
  }

  function boot() {
    // Your template uses id="mapAccordion". Keep backward compatibility if you ever used "mapAccRoot".
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
        buildAccordion(root, grouped);
      })
      .catch(function (err) {
        root.innerHTML = '<div class="mapLoading">Could not load map data.</div>';
        console.error('Map load failed:', err);
      });
  }

  document.addEventListener('DOMContentLoaded', boot);
})();