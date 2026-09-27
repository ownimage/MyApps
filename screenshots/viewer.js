const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const SCREENSHOTS_DIR = __dirname;
const PORT = Number(process.env.VIEWER_PORT) || 3000;
const IMAGE_RE = /\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i;
const APP_LABELS = Object.freeze({
  pmd: 'Plan My Day',
  cmd: 'Count My Days',
  qrlinks: 'QR Links',
  ffox: 'FreeFormOX',
  solar: 'Solar Controlar',
  solarcontrolar: 'Solar Controlar',
  launch: 'Launch'
});
const APP_ORDER = Object.freeze(['pmd', 'cmd', 'qrlinks', 'ffox', 'solar', 'solarcontrolar', 'launch']);

function isDirectory(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch (e) {
    return false;
  }
}

function imageFiles(dir) {
  try {
    return fs.readdirSync(dir).filter(name => {
      if (!IMAGE_RE.test(name)) return false;
      try {
        return fs.statSync(path.join(dir, name)).isFile();
      } catch (e) {
        return false;
      }
    }).sort();
  } catch (e) {
    return [];
  }
}

function childDirectories(dir) {
  try {
    return fs.readdirSync(dir).filter(name => isDirectory(path.join(dir, name))).sort();
  } catch (e) {
    return [];
  }
}

function modeImages(themeDir) {
  const modes = [];
  for (const mode of ['light', 'dark']) {
    const modeDir = path.join(themeDir, mode);
    if (!isDirectory(modeDir)) continue;
    const images = imageFiles(modeDir);
    if (images.length) modes.push({ name: mode, images });
  }
  return modes;
}

function isThemeDirectory(dir) {
  return isDirectory(dir) && (imageFiles(dir).length > 0 || modeImages(dir).length > 0);
}

function isGalleryRoot(dir) {
  if (!isDirectory(dir)) return false;
  return childDirectories(dir).some(name => isThemeDirectory(path.join(dir, name)));
}

function appLabel(id) {
  if (!id) return '(root)';
  return APP_LABELS[String(id).toLowerCase()] || String(id);
}

function gallerySort(a, b) {
  if ((a.id === '') !== (b.id === '')) return a.id === '' ? 1 : -1;
  const aKey = String(a.id).toLowerCase();
  const bKey = String(b.id).toLowerCase();
  const aOrder = APP_ORDER.indexOf(aKey);
  const bOrder = APP_ORDER.indexOf(bKey);
  if (aOrder !== bOrder) {
    if (aOrder === -1) return 1;
    if (bOrder === -1) return -1;
    return aOrder - bOrder;
  }
  return a.id.localeCompare(b.id);
}

function listGalleries(screenshotsDir = SCREENSHOTS_DIR) {
  const root = path.resolve(screenshotsDir || SCREENSHOTS_DIR);
  const galleries = [];
  if (isGalleryRoot(root)) galleries.push({ id: '', label: appLabel('') });
  for (const name of childDirectories(root)) {
    const child = path.join(root, name);
    if (isGalleryRoot(child)) galleries.push({ id: name, label: appLabel(name) });
  }
  galleries.sort(gallerySort);
  return galleries;
}

function defaultGallery(galleries) {
  if (galleries.some(gallery => gallery.id === 'pmd')) return 'pmd';
  return galleries.length ? galleries[0].id : '';
}

function relativePath(root, target) {
  return path.relative(root, target).split(path.sep).join('/');
}

function scanArguments(group, root, suppliedRoot) {
  if (group && typeof group === 'object' && !Array.isArray(group)) {
    return {
      group: group.group || group.app || '',
      root: group.screenshotsDir || group.root || SCREENSHOTS_DIR
    };
  }
  if (root && typeof root === 'object' && !Array.isArray(root)) {
    return {
      group: group || '',
      root: root.screenshotsDir || root.root || SCREENSHOTS_DIR
    };
  }
  if (typeof group === 'string' && typeof root === 'string' && isDirectory(group) && !isDirectory(root)) {
    return { group: root, root: group };
  }
  if (typeof group === 'string' && isDirectory(group) && !suppliedRoot) {
    return { group: '', root: group };
  }
  return { group: group || '', root: root || SCREENSHOTS_DIR };
}

function safeGroupPath(root, group) {
  const value = String(group || '');
  if (!value) return root;
  if (path.isAbsolute(value) || value.split(/[\\/]/).includes('..')) return null;
  return path.join(root, value);
}

function scanThemes(group = '', screenshotsDir = SCREENSHOTS_DIR) {
  const args = scanArguments(group, screenshotsDir, arguments.length > 1);
  const root = path.resolve(args.root || SCREENSHOTS_DIR);
  const base = safeGroupPath(root, args.group);
  const themes = [];
  if (!base || !isDirectory(base)) return themes;

  for (const name of childDirectories(base)) {
    const themeDir = path.join(base, name);
    const modes = [];
    const explicitModes = modeImages(themeDir);
    if (explicitModes.length) {
      for (const mode of explicitModes) {
        modes.push({ name: mode.name, path: relativePath(root, path.join(themeDir, mode.name)), images: mode.images });
      }
    } else {
      const directImages = imageFiles(themeDir);
      if (directImages.length) modes.push({ name: 'default', path: relativePath(root, themeDir), images: directImages });
    }
    if (modes.length) themes.push({ name, modes });
  }

  themes.sort((a, b) => a.name.localeCompare(b.name));
  return themes;
}

const HTML_HEAD = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Screenshot Viewer</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #1a1a2e;
  color: #e0e0e0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.toolbar {
  flex-shrink: 0;
  background: #16213e;
  padding: 12px 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.4);
  position: relative;
  z-index: 100;
  flex-wrap: wrap;
}
.toolbar h1 {
  font-size: 1.2em;
  font-weight: 600;
  margin-right: auto;
  color: #f0f0f0;
}
.toolbar button {
  padding: 8px 18px;
  border: 1px solid #3a3a5c;
  border-radius: 6px;
  background: #0f3460;
  color: #e0e0e0;
  cursor: pointer;
  font-size: 0.9em;
  transition: background 0.2s;
  white-space: nowrap;
}
.toolbar button:hover { background: #1a4a7a; }
.gallery-picker {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9em;
  color: #b8b8d0;
  white-space: nowrap;
}
.gallery-picker select {
  padding: 7px 12px;
  border: 1px solid #3a3a5c;
  border-radius: 6px;
  background: #0f3460;
  color: #e0e0e0;
  font-size: 0.95em;
  cursor: pointer;
}
#filterPanel {
  display: none;
  position: absolute;
  top: 100%;
  left: 0;
  width: 600px;
  background: #16213e;
  border: 1px solid #3a3a5c;
  border-radius: 6px;
  padding: 12px;
  max-height: 400px;
  overflow: auto;
  z-index: 200;
}
#filterPanel.open { display: block; }
#filterPanel .panel-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid #3a3a5c;
}
#filterPanel label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85em;
  cursor: pointer;
  padding: 2px 0;
}
#filterPanel input[type="checkbox"] {
  accent-color: #4a9eff;
}
.filter-toggle {
  position: relative;
}
.scroll-container {
  flex: 1;
  overflow: auto;
}
.scroll-container::-webkit-scrollbar { height: 10px; width: 10px; }
.scroll-container::-webkit-scrollbar-track { background: #111; }
.scroll-container::-webkit-scrollbar-thumb { background: #3a3a5c; border-radius: 4px; }
.content { min-width: max-content; padding: 8px 20px 20px 20px; }
.theme-section { margin-bottom: 4px; }
.theme-section.drag-over { outline: 2px dashed #4a9eff; outline-offset: -2px; border-radius: 8px; }
.theme-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
  background: #16213e;
  border-radius: 8px;
  cursor: pointer;
  user-select: none;
  font-size: 1em;
  font-weight: 600;
  transition: background 0.15s;
  position: sticky;
  left: 0;
  white-space: nowrap;
}
.theme-header:hover { background: #1e2d50; }
.theme-header.dragging { opacity: 0.4; }
.drag-handle {
  cursor: grab;
  color: #777;
  font-size: 1.1em;
  line-height: 1;
  padding: 2px 6px;
  border-radius: 4px;
  transition: color 0.15s;
  flex-shrink: 0;
}
.drag-handle:hover { color: #aaa; }
.drag-handle:active { cursor: grabbing; }
.theme-header .arrow {
  font-size: 0.8em;
  transition: transform 0.2s;
  min-width: 14px;
  text-align: center;
}
.theme-section.open .theme-header .arrow { transform: rotate(90deg); }
.theme-header .app-name,
.theme-header .theme-name,
.theme-header .mode-name {
  text-transform: none;
}
.theme-header .app-name { color: #9ecbff; }
.theme-header .mode-name { color: #c8c8df; font-weight: 400; }
.theme-header .separator { color: #6d7899; font-weight: 400; }
.theme-header .image-count {
  font-size: 0.8em;
  color: #888;
  font-weight: 400;
  margin-left: auto;
}
.theme-body { display: none; padding: 10px 0 4px 0; white-space: nowrap; }
.theme-section.open .theme-body { display: block; }
.image-card {
  display: inline-block;
  vertical-align: top;
  margin-right: 12px;
  text-align: center;
  min-width: 120px;
}
.image-card:last-child { margin-right: 0; }
.image-card img {
  height: 400px;
  border-radius: 6px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.5);
  display: block;
  background: #222;
}
.image-card .image-name {
  margin-top: 6px;
  font-size: 0.72em;
  color: #999;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
</head>
<body>
<div class="toolbar">
  <h1>Screenshot Viewer</h1>
  <label class="gallery-picker">App
    <select id="appSelect" onchange="changeGallery()"></select>
  </label>
  <label class="gallery-picker">Theme
    <select id="themeSelect" onchange="changeTheme()"></select>
  </label>
  <label class="gallery-picker">Mode
    <select id="modeSelect" onchange="changeMode()"></select>
  </label>
  <div class="filter-toggle">
    <button onclick="toggleFilterPanel()">Filter &#9662;</button>
    <div id="filterPanel">
      <div class="panel-bar">
        <button onclick="selectAllImages()">Select / Deselect</button>
      </div>
      <div id="imageCheckboxes"></div>
    </div>
  </div>
  <button onclick="openAll()">Open All</button>
  <button onclick="collapseAll()">Collapse All</button>
  <button onclick="refreshImages()">Refresh</button>
</div>
<div class="scroll-container">
<div class="content" id="container">
`;

const HTML_FOOT = `
</div>
</div>
<script>
(function() {
  var container = document.getElementById('container');
  var appSelect = document.getElementById('appSelect');
  var themeSelect = document.getElementById('themeSelect');
  var modeSelect = document.getElementById('modeSelect');
  var imageCheckboxes = document.getElementById('imageCheckboxes');
  var currentGallery = null;
  var currentTheme = storageGet('screenshotViewerTheme') || '';
  var currentMode = storageGet('screenshotViewerMode') || '';
  var galleries = [];
  var themes = [];
  var checkedImages = Object.create(null);
  var openSections = Object.create(null);
  var requestVersion = 0;
  var dragEl = null;
  var APP_LABELS = {
    pmd: 'Plan My Day',
    cmd: 'Count My Days',
    qrlinks: 'QR Links',
    ffox: 'FreeFormOX',
    solar: 'Solar Controlar',
    solarcontrolar: 'Solar Controlar',
    launch: 'Launch'
  };
  var IMAGE_RE = /\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i;

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function storageSet(key, value) {
    try { localStorage.setItem(key, value || ''); } catch (e) {}
  }

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function appLabel(app) {
    if (!app) return '(root)';
    for (var i = 0; i < galleries.length; i++) {
      if (galleries[i].id === app) return galleries[i].label;
    }
    return APP_LABELS[app.toLowerCase()] || app;
  }

  function modeLabel(mode) {
    return mode.charAt(0).toUpperCase() + mode.slice(1);
  }

  function defaultGallery() {
    for (var i = 0; i < galleries.length; i++) {
      if (galleries[i].id === 'pmd') return 'pmd';
    }
    return galleries.length ? galleries[0].id : '';
  }

  function addOption(select, value, label) {
    var option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }

  function setGalleryOptions(list) {
    galleries = Array.isArray(list) ? list : [];
    appSelect.innerHTML = '';
    for (var i = 0; i < galleries.length; i++) {
      addOption(appSelect, galleries[i].id, galleries[i].label);
    }
    var selected = currentGallery;
    var hadGalleryPreference = selected !== null;
    if (selected !== null) {
      for (var j = 0; j < galleries.length; j++) {
        if (galleries[j].label === selected) {
          selected = galleries[j].id;
          break;
        }
      }
    }
    var hasSelection = galleries.some(function(gallery) { return gallery.id === selected; });
    if (!hasSelection) {
      selected = defaultGallery();
      currentGallery = selected;
      if (!hadGalleryPreference) storageSet('screenshotViewerGallery', selected);
    } else {
      currentGallery = selected;
    }
    appSelect.value = currentGallery;
  }

  function setThemeOptions() {
    var names = [];
    for (var i = 0; i < themes.length; i++) {
      if (names.indexOf(themes[i].name) === -1) names.push(themes[i].name);
    }
    names.sort();
    themeSelect.innerHTML = '';
    addOption(themeSelect, '', 'All themes');
    for (var j = 0; j < names.length; j++) addOption(themeSelect, names[j], names[j]);
    if (currentTheme && names.indexOf(currentTheme) === -1) {
      currentTheme = '';
      storageSet('screenshotViewerTheme', currentTheme);
    }
    themeSelect.value = currentTheme;
  }

  function availableModeNames() {
    var names = [];
    for (var i = 0; i < themes.length; i++) {
      if (currentTheme && themes[i].name !== currentTheme) continue;
      for (var j = 0; j < themes[i].modes.length; j++) {
        var name = themes[i].modes[j].name;
        if (names.indexOf(name) === -1) names.push(name);
      }
    }
    return names;
  }

  function setModeOptions() {
    var available = availableModeNames();
    var values = ['light', 'dark'];
    if (available.indexOf('default') !== -1) values.push('default');
    if (currentMode && available.indexOf(currentMode) === -1) {
      currentMode = '';
      storageSet('screenshotViewerMode', currentMode);
    }
    modeSelect.innerHTML = '';
    addOption(modeSelect, '', 'All modes');
    addOption(modeSelect, 'light', 'Light');
    addOption(modeSelect, 'dark', 'Dark');
    if (values.indexOf('default') !== -1) addOption(modeSelect, 'default', 'Default');
    modeSelect.value = currentMode;
  }

  function sectionKey(themeName, modeName) {
    return JSON.stringify([currentGallery || '', themeName, modeName]);
  }

  function isOpen(key) {
    return hasOwn(openSections, key) ? openSections[key] : true;
  }

  function sourceUrl(modePath, imageName, stamp) {
    var pieces = String(modePath).split('/').map(function(piece) { return encodeURIComponent(piece); });
    return '/' + pieces.join('/') + '/' + encodeURIComponent(imageName) + '?v=' + stamp;
  }

  function configureSection(section, themeName, mode) {
    var key = sectionKey(themeName, mode.name);
    var header = section.querySelector('.theme-header');
    if (!header) {
      header = document.createElement('div');
      header.className = 'theme-header';
      var handle = document.createElement('span');
      handle.className = 'drag-handle';
      handle.innerHTML = '&#9776;';
      handle.setAttribute('draggable', 'true');
      handle.title = 'Drag to reorder';
      var arrow = document.createElement('span');
      arrow.className = 'arrow';
      arrow.innerHTML = '&#9654;';
      header.appendChild(handle);
      header.appendChild(arrow);
      header.appendChild(document.createElement('span'));
      header.children[2].className = 'app-name';
      header.appendChild(document.createElement('span'));
      header.children[3].className = 'separator';
      header.lastChild.textContent = ' / ';
      header.appendChild(document.createElement('span'));
      header.children[4].className = 'theme-name';
      header.appendChild(document.createElement('span'));
      header.children[5].className = 'separator';
      header.lastChild.textContent = ' / ';
      header.appendChild(document.createElement('span'));
      header.children[6].className = 'mode-name';
      header.appendChild(document.createElement('span'));
      header.children[7].className = 'image-count';
      section.appendChild(header);
    }
    header.onclick = function() { toggleSectionByKey(key); };
    header.setAttribute('data-section-key', key);
    header.title = appLabel(currentGallery) + ' / ' + themeName + ' / ' + modeLabel(mode.name);
    header.querySelector('.app-name').textContent = appLabel(currentGallery);
    header.querySelector('.theme-name').textContent = themeName;
    header.querySelector('.mode-name').textContent = modeLabel(mode.name);
    header.querySelector('.image-count').textContent = mode.images.length + ' images';

    var body = section.querySelector('.theme-body');
    if (!body) {
      body = document.createElement('div');
      body.className = 'theme-body';
      section.appendChild(body);
    }
    body.innerHTML = '';
    var stamp = Date.now();
    for (var i = 0; i < mode.images.length; i++) {
      var imageName = mode.images[i];
      var card = document.createElement('div');
      card.className = 'image-card';
      var image = document.createElement('img');
      image.src = sourceUrl(mode.path, imageName, stamp);
      image.alt = imageName;
      image.loading = 'lazy';
      var name = document.createElement('div');
      name.className = 'image-name';
      name.textContent = imageName;
      card.appendChild(image);
      card.appendChild(name);
      body.appendChild(card);
    }
  }

  function refreshIds() {
    var sections = container.querySelectorAll('.theme-section');
    for (var i = 0; i < sections.length; i++) {
      var body = sections[i].querySelector('.theme-body');
      sections[i].id = 'section-' + i;
      if (body) body.id = 'body-' + i;
    }
  }

  function renderThemes() {
    var existing = Object.create(null);
    var previous = container.querySelectorAll('.theme-section');
    for (var p = 0; p < previous.length; p++) {
      var previousKey = previous[p].getAttribute('data-section-key');
      if (previousKey !== null) existing[previousKey] = previous[p];
    }
    var fragment = document.createDocumentFragment();
    for (var t = 0; t < themes.length; t++) {
      var theme = themes[t];
      if (currentTheme && theme.name !== currentTheme) continue;
      for (var m = 0; m < theme.modes.length; m++) {
        var mode = theme.modes[m];
        if (currentMode && mode.name !== currentMode) continue;
        var key = sectionKey(theme.name, mode.name);
        var section = existing[key] || document.createElement('div');
        section.className = 'theme-section mode-section';
        section.setAttribute('data-section-key', key);
        section.setAttribute('data-app', currentGallery || '');
        section.setAttribute('data-theme', theme.name);
        section.setAttribute('data-mode', mode.name);
        section.setAttribute('draggable', 'true');
        if (isOpen(key)) section.classList.add('open');
        else section.classList.remove('open');
        configureSection(section, theme.name, mode);
        fragment.appendChild(section);
      }
    }
    container.innerHTML = '';
    while (fragment.firstChild) container.appendChild(fragment.firstChild);
    refreshIds();
    setImageCheckboxes();
    filterImagesByCheckbox();
  }

  function toggleSectionByKey(key) {
    for (var i = 0; i < container.children.length; i++) {
      var section = container.children[i];
      if (section.getAttribute('data-section-key') !== key) continue;
      var next = !section.classList.contains('open');
      if (next) section.classList.add('open');
      else section.classList.remove('open');
      openSections[key] = next;
      return;
    }
  }

  function normalizeThemes(data) {
    if (!Array.isArray(data)) return [];
    return data.map(function(theme) {
      if (Array.isArray(theme.modes)) return theme;
      if (Array.isArray(theme.images)) {
        return {
          name: theme.name,
          modes: [{ name: 'default', path: theme.path, images: theme.images }]
        };
      }
      return { name: theme.name, modes: [] };
    }).filter(function(theme) { return theme.name && theme.modes.length; });
  }

  function loadThemes() {
    var version = ++requestVersion;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/themes?group=' + encodeURIComponent(currentGallery || ''), true);
    xhr.onload = function() {
      if (version !== requestVersion) return;
      if (xhr.status !== 200) {
        themes = [];
      } else {
        try {
          themes = normalizeThemes(JSON.parse(xhr.responseText));
        } catch (e) {
          themes = [];
        }
      }
      setThemeOptions();
      setModeOptions();
      renderThemes();
    };
    xhr.onerror = function() {
      if (version !== requestVersion) return;
      themes = [];
      setThemeOptions();
      setModeOptions();
      renderThemes();
    };
    xhr.send();
  }

  function imageNames() {
    var names = [];
    for (var t = 0; t < themes.length; t++) {
      var theme = themes[t];
      for (var m = 0; m < theme.modes.length; m++) {
        var images = theme.modes[m].images;
        for (var i = 0; i < images.length; i++) {
          if (names.indexOf(images[i]) === -1) names.push(images[i]);
        }
      }
    }
    names.sort();
    return names;
  }

  function setImageCheckboxes() {
    imageCheckboxes.innerHTML = '';
    var names = imageNames();
    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      if (!hasOwn(checkedImages, name)) checkedImages[name] = true;
      var label = document.createElement('label');
      var checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = checkedImages[name];
      checkbox.setAttribute('data-name', name);
      checkbox.onchange = function() {
        checkedImages[this.getAttribute('data-name')] = this.checked;
        filterImagesByCheckbox();
      };
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(name.replace(IMAGE_RE, '')));
      imageCheckboxes.appendChild(label);
    }
  }

  function filterImagesByCheckbox() {
    var inputs = imageCheckboxes.querySelectorAll('input[type="checkbox"]');
    var selected = Object.create(null);
    var anyChecked = false;
    for (var i = 0; i < inputs.length; i++) {
      if (inputs[i].checked) {
        selected[inputs[i].getAttribute('data-name')] = true;
        anyChecked = true;
      }
    }
    var cards = container.querySelectorAll('.image-card');
    for (var j = 0; j < cards.length; j++) {
      var cardName = cards[j].querySelector('.image-name').textContent;
      cards[j].style.display = !anyChecked || selected[cardName] ? '' : 'none';
    }
  }

  function changeTheme() {
    currentTheme = themeSelect.value;
    storageSet('screenshotViewerTheme', currentTheme);
    setModeOptions();
    renderThemes();
  }

  function changeMode() {
    currentMode = modeSelect.value;
    storageSet('screenshotViewerMode', currentMode);
    renderThemes();
  }

  function changeGallery() {
    currentGallery = appSelect.value;
    storageSet('screenshotViewerGallery', currentGallery);
    themes = [];
    renderThemes();
    loadThemes();
  }

  function refreshImages() {
    var version = ++requestVersion;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/galleries', true);
    xhr.onload = function() {
      if (version !== requestVersion || xhr.status !== 200) return;
      try {
        setGalleryOptions(JSON.parse(xhr.responseText));
      } catch (e) {
        return;
      }
      loadThemes();
    };
    xhr.onerror = function() {};
    xhr.send();
  }

  function toggleSection(index) {
    var section = document.getElementById('section-' + index);
    if (!section) return;
    toggleSectionByKey(section.getAttribute('data-section-key'));
  }

  function openAll() {
    var sections = container.querySelectorAll('.theme-section');
    for (var i = 0; i < sections.length; i++) {
      sections[i].classList.add('open');
      openSections[sections[i].getAttribute('data-section-key')] = true;
    }
  }

  function collapseAll() {
    var sections = container.querySelectorAll('.theme-section');
    for (var i = 0; i < sections.length; i++) {
      sections[i].classList.remove('open');
      openSections[sections[i].getAttribute('data-section-key')] = false;
    }
  }

  function toggleFilterPanel() {
    document.getElementById('filterPanel').classList.toggle('open');
  }

  function selectAllImages() {
    var inputs = imageCheckboxes.querySelectorAll('input[type="checkbox"]');
    var allChecked = inputs.length > 0;
    for (var i = 0; i < inputs.length; i++) {
      if (!inputs[i].checked) {
        allChecked = false;
        break;
      }
    }
    var newState = !allChecked;
    for (var j = 0; j < inputs.length; j++) {
      inputs[j].checked = newState;
      checkedImages[inputs[j].getAttribute('data-name')] = newState;
    }
    filterImagesByCheckbox();
  }

  container.addEventListener('dragstart', function(e) {
    dragEl = e.target.closest ? e.target.closest('.theme-section') : null;
    if (!dragEl) return;
    dragEl.classList.add('dragging');
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', '');
    }
    setTimeout(function() { if (dragEl) dragEl.style.display = 'none'; }, 0);
  });

  container.addEventListener('dragend', function() {
    if (!dragEl) return;
    dragEl.style.display = '';
    dragEl.classList.remove('dragging');
    var all = container.querySelectorAll('.theme-section');
    for (var i = 0; i < all.length; i++) all[i].classList.remove('drag-over');
    dragEl = null;
  });

  container.addEventListener('dragover', function(e) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    if (!dragEl) return;
    var target = e.target.closest ? e.target.closest('.theme-section') : null;
    if (!target || target === dragEl) return;
    var children = Array.from(container.children);
    var dragIndex = children.indexOf(dragEl);
    var targetIndex = children.indexOf(target);
    if (dragIndex < targetIndex) container.insertBefore(dragEl, target.nextSibling);
    else container.insertBefore(dragEl, target);
    refreshIds();
  });

  container.addEventListener('dragenter', function(e) {
    var section = e.target.closest ? e.target.closest('.theme-section') : null;
    if (section && section !== dragEl) section.classList.add('drag-over');
  });

  container.addEventListener('dragleave', function(e) {
    var section = e.target.closest ? e.target.closest('.theme-section') : null;
    if (section && section !== dragEl) section.classList.remove('drag-over');
  });

  container.addEventListener('drop', function(e) {
    e.preventDefault();
    var all = container.querySelectorAll('.theme-section');
    for (var i = 0; i < all.length; i++) all[i].classList.remove('drag-over');
  });

  document.addEventListener('click', function(e) {
    var panel = document.getElementById('filterPanel');
    var toggle = document.querySelector('.filter-toggle');
    if (panel && toggle && !panel.contains(e.target) && !toggle.contains(e.target)) panel.classList.remove('open');
  });

  window.changeGallery = changeGallery;
  window.changeTheme = changeTheme;
  window.changeMode = changeMode;
  window.changeThemeMode = changeMode;
  window.refreshImages = refreshImages;
  window.toggleSection = toggleSection;
  window.openAll = openAll;
  window.collapseAll = collapseAll;
  window.toggleFilterPanel = toggleFilterPanel;
  window.selectAllImages = selectAllImages;
  window.filterImagesByCheckbox = filterImagesByCheckbox;

  currentGallery = storageGet('screenshotViewerGallery');
  refreshImages();
})();
</script>
</body>
</html>`;

function getHtml() {
  return HTML_HEAD + HTML_FOOT;
}

function createServer(screenshotsDir = SCREENSHOTS_DIR) {
  const root = path.resolve(screenshotsDir || SCREENSHOTS_DIR);
  return http.createServer((req, res) => {
    let requestUrl;
    let urlPath;
    try {
      requestUrl = new URL(req.url, 'http://localhost');
      urlPath = decodeURIComponent(requestUrl.pathname);
    } catch (e) {
      res.writeHead(400);
      res.end('Bad Request');
      return;
    }

    if (urlPath === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getHtml());
      return;
    }

    if (urlPath === '/api/galleries' || urlPath === '/api/apps') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(listGalleries(root)));
      return;
    }

    if (urlPath === '/api/themes') {
      const galleries = listGalleries(root);
      const group = requestUrl.searchParams.has('group')
        ? requestUrl.searchParams.get('group')
        : requestUrl.searchParams.has('app')
          ? requestUrl.searchParams.get('app')
          : defaultGallery(galleries);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(scanThemes(group, root)));
      return;
    }

    if (urlPath.indexOf('\0') !== -1) {
      res.writeHead(400);
      res.end('Bad Request');
      return;
    }

    const filePath = path.resolve(root, '.' + urlPath);
    const relative = path.relative(root, filePath);
    if (relative === '..' || relative.indexOf('..' + path.sep) === 0 || path.isAbsolute(relative)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.bmp': 'image/bmp',
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css'
    };

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });
}

function openBrowser(port) {
  const url = `http://localhost:${port}`;
  const command = process.platform === 'win32'
    ? `start ${url}`
    : process.platform === 'darwin'
      ? `open ${url}`
      : `xdg-open ${url}`;
  exec(command);
}

function startServer(options = {}) {
  const screenshotsDir = options.screenshotsDir || SCREENSHOTS_DIR;
  const port = typeof options.port === 'number' ? options.port : PORT;
  const host = options.host || undefined;
  const server = createServer(screenshotsDir);
  server.listen(port, host, () => {
    const address = server.address();
    const actualPort = address && typeof address === 'object' ? address.port : port;
    console.log(`Screenshot viewer: http://localhost:${actualPort}`);
    if (options.open !== false) openBrowser(actualPort);
  });
  return server;
}

if (require.main === module) startServer();

module.exports = {
  APP_LABELS,
  IMAGE_RE,
  PORT,
  SCREENSHOTS_DIR,
  appLabel,
  createServer,
  createViewerServer: createServer,
  defaultGallery,
  getHtml,
  isGalleryRoot,
  isThemeDirectory,
  listGalleries,
  scanThemes,
  startServer
};
