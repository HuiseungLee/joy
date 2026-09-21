"use strict";

const $ = (selector) => document.querySelector(selector);

const state = {
  categories: [],
  places: [],
  filteredPlaces: [],
  searchResults: [],
  config: null,
  map: null,
  AdvancedMarkerElement: null,
  Place: null,
  Route: null,
  RouteMatrix: null,
  hoverInfoWindow: null,
  markers: new Map(),
  routePlaceIds: [],
  routeDisplayIds: [],
  routePolylines: [],
  routeModifierPressed: false,
  lastManualOpenAt: 0,
  manualPreviewMarker: null,
  sharePreviewMarker: null,
  pendingSharedPlace: null,
  drawerFromShared: false,
  activePlaceId: null,
  currentView: "saved",
  toastTimer: null,
};

const els = {
  loginScreen: $("#login-screen"),
  loginForm: $("#login-form"),
  loginUsername: $("#login-username"),
  loginPassword: $("#login-password"),
  loginError: $("#login-error"),
  app: $("#app"),
  placeCount: $("#place-count"),
  exportButton: $("#export-button"),
  logoutButton: $("#logout-button"),
  searchForm: $("#place-search-form"),
  searchInput: $("#place-search-input"),
  savedTab: $("#saved-tab"),
  searchTab: $("#search-tab"),
  savedView: $("#saved-view"),
  searchView: $("#search-view"),
  savedList: $("#saved-list"),
  searchResults: $("#search-results"),
  searchStatus: $("#search-status"),
  categoryFilter: $("#category-filter"),
  scopeFilter: $("#scope-filter"),
  monthFilter: $("#month-filter"),
  countryFilter: $("#country-filter"),
  areaSearch: $("#area-search"),
  filteredCount: $("#filtered-count"),
  categoryManageButton: $("#category-manage-button"),
  map: $("#map"),
  mapMessage: $("#map-message"),
  shareMessageButton: $("#share-message-button"),
  shareConfirmCard: $("#share-confirm-card"),
  shareConfirmName: $("#share-confirm-name"),
  shareConfirmAddress: $("#share-confirm-address"),
  shareConfirmButton: $("#share-confirm-button"),
  shareRetryButton: $("#share-retry-button"),
  shareCancelButton: $("#share-cancel-button"),
  routePlanner: $("#route-planner"),
  routeCount: $("#route-count"),
  routeStopList: $("#route-stop-list"),
  routeStatus: $("#route-status"),
  routeOrderedButton: $("#route-ordered-button"),
  routeOptimalButton: $("#route-optimal-button"),
  routeClearButton: $("#route-clear-button"),
  mapLegend: $("#map-legend"),
  drawer: $("#place-drawer"),
  drawerBackdrop: $("#drawer-backdrop"),
  drawerClose: $("#drawer-close"),
  drawerTitle: $("#drawer-title"),
  drawerKicker: $("#drawer-kicker"),
  placeForm: $("#place-form"),
  sourcePreview: $("#source-preview"),
  sourceName: $("#source-name"),
  sourceAddress: $("#source-address"),
  placeId: $("#place-id"),
  provider: $("#provider"),
  providerPlaceId: $("#provider-place-id"),
  latitude: $("#latitude"),
  longitude: $("#longitude"),
  placeLabel: $("#place-label"),
  placeCategory: $("#place-category"),
  plannedMonth: $("#planned-month"),
  countryCode: $("#country-code"),
  region: $("#region"),
  locality: $("#locality"),
  district: $("#district"),
  memo: $("#memo"),
  deletePlaceButton: $("#delete-place-button"),
  cancelPlaceButton: $("#cancel-place-button"),
  shareDialog: $("#share-dialog"),
  shareForm: $("#share-form"),
  shareDialogClose: $("#share-dialog-close"),
  shareDialogCancel: $("#share-dialog-cancel"),
  shareMessage: $("#share-message"),
  shareStatus: $("#share-status"),
  categoryDialog: $("#category-dialog"),
  categoryForm: $("#category-form"),
  categoryDialogClose: $("#category-dialog-close"),
  categoryName: $("#category-name"),
  categoryColor: $("#category-color"),
  categoryList: $("#category-list"),
  toast: $("#toast"),
};

async function api(path, options = {}) {
  const request = {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json", "X-Requested-With": "JoyMap" } : {}),
      ...(options.headers || {}),
    },
  };
  const response = await fetch(path, request);
  let payload = {};
  try { payload = await response.json(); } catch (_) { /* no body */ }
  if (response.status === 401 && path !== "/api/login") {
    showLogin();
    throw new Error("로그인이 필요합니다.");
  }
  if (!response.ok) throw new Error(payload.error || "요청을 처리하지 못했습니다.");
  return payload;
}

function showLogin() {
  els.app.hidden = true;
  els.loginScreen.hidden = false;
  els.loginPassword.value = "";
  window.setTimeout(() => els.loginPassword.focus(), 50);
}

function showApp() {
  els.loginScreen.hidden = true;
  els.app.hidden = false;
}

function toast(message, isError = false) {
  window.clearTimeout(state.toastTimer);
  els.toast.textContent = message;
  els.toast.classList.toggle("is-error", isError);
  els.toast.classList.add("is-visible");
  state.toastTimer = window.setTimeout(() => els.toast.classList.remove("is-visible"), 2800);
}

async function bootstrap() {
  bindEvents();
  try {
    await api("/api/session");
    await initializeApp();
  } catch (_) {
    showLogin();
  }
}

async function initializeApp() {
  showApp();
  try {
    const [configData, categoryData, placeData] = await Promise.all([
      api("/api/config"), api("/api/categories"), api("/api/places"),
    ]);
    state.config = configData;
    state.categories = categoryData.categories;
    state.places = placeData.places;
    renderCategories();
    renderFilters();
    applyFilters(false);
    if (state.config.configured) {
      await loadGoogleMaps(state.config.maps_api_key);
      await initializeMap();
      renderMarkers(true);
      refreshStaleLocations();
    } else {
      els.mapMessage.hidden = false;
    }
  } catch (error) {
    toast(error.message, true);
  }
}

function bindEvents() {
  els.loginForm.addEventListener("submit", handleLogin);
  els.logoutButton.addEventListener("click", handleLogout);
  els.exportButton.addEventListener("click", () => { window.location.href = "/api/export"; });
  els.searchForm.addEventListener("submit", handleSearch);
  els.savedTab.addEventListener("click", () => setView("saved"));
  els.searchTab.addEventListener("click", () => setView("search"));
  [els.categoryFilter, els.scopeFilter, els.monthFilter, els.countryFilter].forEach((element) => {
    element.addEventListener("change", () => applyFilters(false));
  });
  els.areaSearch.addEventListener("input", () => applyFilters(false));
  els.shareMessageButton.addEventListener("click", openShareDialog);
  els.shareConfirmButton.addEventListener("click", confirmSharedPlace);
  els.shareRetryButton.addEventListener("click", retrySharedPlaceSearch);
  els.shareCancelButton.addEventListener("click", clearSharePreview);
  els.routeOrderedButton.addEventListener("click", () => calculateSelectedRoute("ordered"));
  els.routeOptimalButton.addEventListener("click", () => calculateSelectedRoute("optimal"));
  els.routeClearButton.addEventListener("click", clearRouteSelection);
  els.drawerBackdrop.addEventListener("click", closeDrawer);
  els.placeForm.addEventListener("submit", savePlace);
  els.shareForm.addEventListener("submit", handleSharedMessage);
  els.deletePlaceButton.addEventListener("click", deleteCurrentPlace);
  els.categoryManageButton.addEventListener("click", openCategoryDialog);
  els.categoryForm.addEventListener("submit", createCategory);
  document.addEventListener("click", handleUiAction, true);
  document.addEventListener("keydown", (event) => {
    state.routeModifierPressed = event.ctrlKey || event.metaKey;
    if (event.key === "Escape" && els.drawer.classList.contains("is-open")) closeDrawer();
  });
  document.addEventListener("keyup", (event) => {
    state.routeModifierPressed = event.ctrlKey || event.metaKey;
  });
  window.addEventListener("blur", () => { state.routeModifierPressed = false; });
}

function handleUiAction(event) {
  const control = event.target.closest?.("[data-ui-action]");
  if (!control) return;
  const action = control.dataset.uiAction;
  if (action === "close-drawer") {
    event.preventDefault();
    closeDrawer();
  } else if (action === "close-share-dialog") {
    event.preventDefault();
    if (els.shareDialog.open) els.shareDialog.close();
  } else if (action === "close-category-dialog") {
    event.preventDefault();
    if (els.categoryDialog.open) els.categoryDialog.close();
  }
}

async function handleLogin(event) {
  event.preventDefault();
  els.loginError.textContent = "";
  const button = els.loginForm.querySelector("button[type='submit']");
  button.disabled = true;
  try {
    await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ username: els.loginUsername.value, password: els.loginPassword.value }),
    });
    await initializeApp();
  } catch (error) {
    els.loginError.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function handleLogout() {
  try { await api("/api/logout", { method: "POST", body: "{}" }); } catch (_) { /* expire locally */ }
  window.location.reload();
}

function loadGoogleMaps(apiKey) {
  if (window.google?.maps) return Promise.resolve();
  return new Promise((resolve, reject) => {
    window.__joyMapReady = resolve;
    window.gm_authFailure = () => {
      els.mapMessage.hidden = false;
      els.mapMessage.querySelector("strong").textContent = "Google 지도 인증에 실패했습니다";
      els.mapMessage.querySelector("span").textContent = "API 키, 활성화한 API, 허용 도메인을 확인해 주세요.";
      reject(new Error("Google 지도 인증에 실패했습니다."));
    };
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&libraries=places,marker,routes&language=ko&callback=__joyMapReady`;
    script.async = true;
    script.onerror = () => reject(new Error("Google 지도 스크립트를 불러오지 못했습니다."));
    document.head.appendChild(script);
  });
}

async function initializeMap() {
  const [{ Map, RenderingType }, { AdvancedMarkerElement }, { Place }] = await Promise.all([
    google.maps.importLibrary("maps"),
    google.maps.importLibrary("marker"),
    google.maps.importLibrary("places"),
  ]);
  state.AdvancedMarkerElement = AdvancedMarkerElement;
  state.Place = Place;
  state.map = new Map(els.map, {
    center: { lat: 20, lng: 0 },
    zoom: 2,
    mapId: state.config.map_id || "DEMO_MAP_ID",
    mapTypeId: "roadmap",
    renderingType: RenderingType.RASTER,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    clickableIcons: true,
    gestureHandling: "greedy",
  });
  state.hoverInfoWindow = new google.maps.InfoWindow({ disableAutoPan: true });
  const handleContextMenu = (event) => {
    event.domEvent?.preventDefault?.();
    if (!event.latLng) return;
    const now = Date.now();
    if (now - state.lastManualOpenAt < 350) return;
    state.lastManualOpenAt = now;
    openDrawerForManual(event.latLng.toJSON());
    toast("우클릭한 위치를 새 장소로 지정했습니다.");
  };
  state.map.addListener("contextmenu", handleContextMenu);
  // Older Maps builds can still emit only rightclick. The time guard above
  // prevents the compatibility event from opening the drawer twice.
  state.map.addListener("rightclick", handleContextMenu);
}

function setView(view) {
  state.currentView = view;
  const saved = view === "saved";
  els.savedView.hidden = !saved;
  els.searchView.hidden = saved;
  els.savedTab.classList.toggle("is-active", saved);
  els.searchTab.classList.toggle("is-active", !saved);
  els.savedTab.setAttribute("aria-selected", String(saved));
  els.searchTab.setAttribute("aria-selected", String(!saved));
}

async function handleSearch(event) {
  event.preventDefault();
  const query = els.searchInput.value.trim();
  if (!query) return;
  if (!state.Place) {
    toast("Google 지도 API 설정을 먼저 완료해 주세요.", true);
    return;
  }
  setView("search");
  els.searchStatus.hidden = false;
  els.searchStatus.className = "inline-status is-loading";
  els.searchStatus.textContent = "Google Maps에서 장소를 찾는 중…";
  els.searchResults.replaceChildren();
  try {
    const request = {
      textQuery: query,
      fields: ["id", "displayName", "formattedAddress", "location", "googleMapsURI", "addressComponents"],
    };
    const languageRegion = (navigator.language.split("-")[1] || "").toLowerCase();
    if (/^[a-z]{2}$/.test(languageRegion)) request.region = languageRegion;
    const { places = [] } = await state.Place.searchByText(request);
    state.searchResults = places.filter((place) => place.id && place.location);
    renderSearchResults();
  } catch (error) {
    console.error(error);
    els.searchStatus.className = "inline-status";
    els.searchStatus.textContent = "검색하지 못했습니다. API 설정과 사용 한도를 확인해 주세요.";
  }
}

function renderSearchResults() {
  els.searchResults.replaceChildren();
  els.searchStatus.className = "inline-status";
  if (!state.searchResults.length) {
    els.searchStatus.hidden = false;
    els.searchStatus.textContent = "검색 결과가 없습니다. 도시명과 장소명을 함께 입력해 보세요.";
    return;
  }
  els.searchStatus.hidden = true;
  state.searchResults.forEach((place) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "place-card";
    const dot = document.createElement("span");
    dot.className = "category-dot";
    dot.style.setProperty("--category-color", "#2d6cdf");
    const content = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = place.displayName || "이름 없는 장소";
    const address = document.createElement("span");
    address.className = "place-card-meta";
    address.textContent = place.formattedAddress || "주소 정보 없음";
    content.append(name, address);
    const arrow = document.createElement("span");
    arrow.className = "place-card-arrow";
    arrow.textContent = "+";
    card.append(dot, content, arrow);
    card.addEventListener("click", () => openDrawerForSearch(place));
    els.searchResults.appendChild(card);
  });
}

function parseAddressComponents(components = []) {
  const find = (...types) => components.find((component) => types.some((type) => component.types?.includes(type)));
  const long = (...types) => find(...types)?.longText || "";
  const short = (...types) => find(...types)?.shortText || "";
  const locality = long("locality", "postal_town", "administrative_area_level_2");
  let district = long("sublocality_level_1", "administrative_area_level_3");
  if (!district && locality) {
    const area2 = long("administrative_area_level_2");
    if (area2 !== locality) district = area2;
  }
  return {
    country_code: short("country"),
    region: long("administrative_area_level_1"),
    locality,
    district,
  };
}

function parseSharedPlaceMessage(value) {
  const raw = value.trim();
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const isDivider = (line) => /^[-=_*]{3,}$/.test(line.replace(/\\/g, ""));
  const isProvider = (line) => /^\[[^\]]*(?:지도|map)[^\]]*\]$/i.test(line) || /^(?:네이버지도|카카오맵|google maps)$/i.test(line);
  const isUrl = (line) => /^https?:\/\//i.test(line);
  const contentLines = lines.filter((line) => !isDivider(line) && !isProvider(line) && !isUrl(line));
  const name = contentLines[0] || "";
  const addressCandidates = contentLines.slice(1);
  const addressScore = (line) => {
    let score = Math.min(line.length, 120) / 120;
    if (/[가-힣]+(?:특별시|광역시|도|시|군|구)/.test(line)) score += 3;
    if (/(?:대로|로|길)\s*\d/.test(line)) score += 4;
    if (/\d/.test(line)) score += 1;
    if (line.includes(",")) score += 1;
    return score;
  };
  const address = addressCandidates.sort((a, b) => addressScore(b) - addressScore(a))[0] || "";
  const url = lines.find(isUrl) || "";
  return { raw, name, address, url, query: [name, address].filter(Boolean).join(" ") };
}

function openShareDialog(options = {}) {
  if (!options.preserveMessage) {
    clearSharePreview();
    els.shareForm.reset();
  }
  els.shareStatus.hidden = true;
  els.shareStatus.className = "inline-status compact-status";
  els.shareDialog.showModal();
  els.shareMessage.focus();
}

async function handleSharedMessage(event) {
  event.preventDefault();
  if (!state.Place) {
    els.shareStatus.hidden = false;
    els.shareStatus.textContent = "Google 지도 API 설정을 먼저 완료해 주세요.";
    return;
  }
  const parsed = parseSharedPlaceMessage(els.shareMessage.value);
  if (!parsed.name) {
    els.shareStatus.hidden = false;
    els.shareStatus.textContent = "링크만 붙이지 말고 장소명과 주소가 포함된 공유문 전체를 붙여넣어 주세요.";
    return;
  }
  const submit = els.shareForm.querySelector("button[type='submit']");
  submit.disabled = true;
  els.shareStatus.hidden = false;
  els.shareStatus.className = "inline-status compact-status is-loading";
  els.shareStatus.textContent = `‘${parsed.name}’ 위치를 찾는 중…`;
  try {
    const request = {
      textQuery: parsed.query,
      fields: ["id", "displayName", "formattedAddress", "location", "googleMapsURI", "addressComponents"],
      maxResultCount: 5,
    };
    const { places = [] } = await state.Place.searchByText(request);
    const matches = places.filter((place) => place.id && place.location);
    if (!matches.length) {
      els.shareStatus.className = "inline-status compact-status";
      els.shareStatus.textContent = "일치하는 장소를 찾지 못했습니다. 장소명과 도로명 주소를 확인해 주세요.";
      return;
    }
    const normalizedName = parsed.name.replace(/\s+/g, "").toLocaleLowerCase("ko");
    const bestMatch = matches.find((place) =>
      (place.displayName || "").replace(/\s+/g, "").toLocaleLowerCase("ko") === normalizedName
    ) || matches[0];
    els.shareDialog.close();
    showSharedPlacePreview(bestMatch, parsed);
    toast("지도에서 검색된 위치를 확인해 주세요.");
  } catch (error) {
    console.error(error);
    els.shareStatus.className = "inline-status compact-status";
    els.shareStatus.textContent = "장소를 찾지 못했습니다. 잠시 후 다시 시도해 주세요.";
  } finally {
    submit.disabled = false;
  }
}

function showSharedPlacePreview(place, parsed) {
  clearSharePreview();
  const location = place.location.toJSON();
  const pin = document.createElement("div");
  pin.className = "map-pin preview-map-pin is-active";
  const glyph = document.createElement("span");
  glyph.textContent = "✓";
  pin.appendChild(glyph);
  state.sharePreviewMarker = new state.AdvancedMarkerElement({
    map: state.map,
    position: location,
    title: `${place.displayName || parsed.name} 위치 확인`,
    content: pin,
    zIndex: 1000,
  });
  state.pendingSharedPlace = { place, parsed };
  els.shareConfirmName.textContent = place.displayName || parsed.name;
  els.shareConfirmAddress.textContent = place.formattedAddress || parsed.address || "주소 정보 없음";
  els.shareConfirmCard.hidden = false;
  focusMapOnLocation(location, 17, false);
}

function clearSharePreview() {
  if (state.sharePreviewMarker) state.sharePreviewMarker.map = null;
  state.sharePreviewMarker = null;
  state.pendingSharedPlace = null;
  els.shareConfirmCard.hidden = true;
}

function retrySharedPlaceSearch() {
  const message = state.pendingSharedPlace?.parsed.raw || els.shareMessage.value;
  clearSharePreview();
  els.shareMessage.value = message;
  openShareDialog({ preserveMessage: true });
}

function confirmSharedPlace() {
  const pending = state.pendingSharedPlace;
  if (!pending) return;
  els.shareConfirmCard.hidden = true;
  openDrawerForSearch(pending.place, {
    label: pending.parsed.name,
    memo: pending.parsed.raw,
    kicker: "IMPORTED FROM SHARED MESSAGE",
    fromShared: true,
  });
}

function renderCategories() {
  const selectedFilter = els.categoryFilter.value;
  const selectedForm = els.placeCategory.value;
  els.categoryFilter.replaceChildren(new Option("모든 카테고리", ""));
  els.placeCategory.replaceChildren();
  els.categoryList.replaceChildren();
  state.categories.forEach((category) => {
    els.categoryFilter.appendChild(new Option(category.name, category.id));
    els.placeCategory.appendChild(new Option(category.name, category.id));
    const row = document.createElement("div");
    row.className = "category-row";
    row.style.setProperty("--row-color", category.color);
    const color = document.createElement("i");
    const name = document.createElement("strong");
    name.textContent = category.name;
    const count = document.createElement("span");
    count.textContent = `${category.place_count}곳`;
    row.append(color, name, count);
    if (!["restaurant", "attraction"].includes(category.slug)) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "category-delete";
      remove.textContent = "삭제";
      remove.addEventListener("click", () => removeCategory(category));
      row.appendChild(remove);
    }
    els.categoryList.appendChild(row);
  });
  els.categoryFilter.value = selectedFilter;
  els.placeCategory.value = selectedForm || String(state.categories[0]?.id || "");
  renderLegend();
}

function renderLegend() {
  els.mapLegend.replaceChildren();
  state.categories.forEach((category) => {
    const chip = document.createElement("span");
    chip.className = "legend-chip";
    chip.style.setProperty("--chip-color", category.color);
    const dot = document.createElement("i");
    const name = document.createElement("span");
    name.textContent = category.name;
    chip.append(dot, name);
    els.mapLegend.appendChild(chip);
  });
}

function getAreaTag(place) {
  return place.district || place.locality || "";
}

function getPlaceScope(place) {
  if (place.country_code === "KR") return "domestic";
  return place.country_code ? "international" : "unknown";
}

function getRouteVisualIds() {
  return state.routeDisplayIds.length ? state.routeDisplayIds : state.routePlaceIds;
}

function getRouteIndex(placeId) {
  return getRouteVisualIds().indexOf(placeId);
}

function getAreaSearchText(place) {
  return [place.region, place.locality, place.district].filter(Boolean).join(" ").toLocaleLowerCase("ko");
}

function renderFilters() {
  const currentCountry = els.countryFilter.value;
  const scope = els.scopeFilter.value;
  const countries = [...new Set(state.places
    .filter((place) => !scope || getPlaceScope(place) === scope)
    .map((place) => place.country_code).filter(Boolean))].sort();
  els.countryFilter.replaceChildren(new Option("모든 국가", ""));
  countries.forEach((country) => els.countryFilter.appendChild(new Option(country, country)));
  if (countries.includes(currentCountry)) els.countryFilter.value = currentCountry;
  else els.countryFilter.value = "";
}

function applyFilters(fitMap = true) {
  if (document.activeElement === els.scopeFilter) renderFilters();
  const category = els.categoryFilter.value;
  const scope = els.scopeFilter.value;
  const month = els.monthFilter.value;
  const country = els.countryFilter.value;
  const areaQuery = els.areaSearch.value.trim().toLocaleLowerCase("ko");
  state.filteredPlaces = state.places.filter((place) =>
    (!category || String(place.category_id) === category) &&
    (!scope || getPlaceScope(place) === scope) &&
    (!month || String(place.planned_month || "") === month) &&
    (!country || place.country_code === country) &&
    (!areaQuery || getAreaSearchText(place).includes(areaQuery))
  );
  renderSavedList();
  if (state.map) renderMarkers(fitMap);
}

function renderSavedList() {
  els.savedList.replaceChildren();
  els.placeCount.textContent = `${state.places.length} PLACES`;
  els.filteredCount.textContent = `${state.filteredPlaces.length}곳`;
  if (!state.filteredPlaces.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const title = document.createElement("strong");
    title.textContent = state.places.length ? "조건에 맞는 장소가 없어요" : "첫 장소를 저장해 보세요";
    const copy = document.createElement("span");
    copy.textContent = state.places.length ? "필터를 바꾸면 다른 장소를 볼 수 있습니다." : "위 검색창에서 전 세계 장소를 찾을 수 있습니다.";
    empty.append(title, copy);
    els.savedList.appendChild(empty);
    return;
  }
  const groups = new Map();
  state.filteredPlaces.forEach((place) => {
    const key = place.planned_month || 0;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(place);
  });
  const orderedMonths = [...groups.keys()].sort((a, b) => {
    if (a === 0) return 1;
    if (b === 0) return -1;
    return a - b;
  });
  orderedMonths.forEach((month) => {
    const section = document.createElement("section");
    section.className = "month-group";
    const heading = document.createElement("h3");
    heading.className = "month-heading";
    heading.textContent = month ? `${month}월에 갈 곳` : "월 미정";
    section.appendChild(heading);
    groups.get(month).forEach((place) => section.appendChild(savedPlaceCard(place)));
    els.savedList.appendChild(section);
  });
}

function savedPlaceCard(place) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "place-card";
  card.dataset.id = place.id;
  card.style.setProperty("--category-color", place.category_color);
  if (place.id === state.activePlaceId) card.classList.add("is-active");
  const routeIndex = getRouteIndex(place.id);
  if (routeIndex >= 0) card.classList.add("is-route-selected");
  const dot = document.createElement("span");
  dot.className = "category-dot";
  if (routeIndex >= 0) {
    dot.classList.add("route-sequence");
    dot.textContent = String(routeIndex + 1);
  }
  const content = document.createElement("span");
  const name = document.createElement("strong");
  name.textContent = place.label;
  const meta = document.createElement("span");
  meta.className = "place-card-meta";
  meta.textContent = [place.category_name, place.country_code, place.region, getAreaTag(place)].filter(Boolean).join(" · ");
  const badges = document.createElement("span");
  badges.className = "place-card-badges";
  const scopeBadge = document.createElement("span");
  scopeBadge.textContent = getPlaceScope(place) === "domestic" ? "국내" : getPlaceScope(place) === "international" ? "해외" : "지역 미정";
  badges.appendChild(scopeBadge);
  if (place.planned_month) {
    const monthBadge = document.createElement("span");
    monthBadge.textContent = `${place.planned_month}월`;
    badges.appendChild(monthBadge);
  }
  content.append(name, badges, meta);
  if (place.memo) {
    const memo = document.createElement("span");
    memo.className = "place-card-note";
    memo.textContent = place.memo;
    content.appendChild(memo);
  }
  const arrow = document.createElement("span");
  arrow.className = "place-card-arrow";
  arrow.textContent = "›";
  card.append(dot, content, arrow);
  card.addEventListener("click", (event) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      toggleRoutePlace(place);
      return;
    }
    selectPlace(place);
    openDrawerForEdit(place);
  });
  return card;
}

function renderMarkers(fitMap = false) {
  state.markers.forEach((marker) => { marker.map = null; });
  state.markers.clear();
  const bounds = new google.maps.LatLngBounds();
  let positionCount = 0;
  state.filteredPlaces.forEach((place) => {
    if (!Number.isFinite(place.latitude) || !Number.isFinite(place.longitude) || place.location_cache_stale) return;
    const position = { lat: place.latitude, lng: place.longitude };
    const pin = document.createElement("div");
    pin.className = "map-pin";
    pin.style.setProperty("--pin-color", place.category_color);
    const glyph = document.createElement("span");
    const routeIndex = getRouteIndex(place.id);
    if (routeIndex >= 0) {
      pin.classList.add("is-route-selected");
      glyph.textContent = String(routeIndex + 1);
    } else {
      glyph.textContent = place.category_name.slice(0, 1);
    }
    pin.appendChild(glyph);
    const marker = new state.AdvancedMarkerElement({
      map: state.map,
      position,
      title: place.label,
      content: pin,
      gmpClickable: true,
    });
    if (place.memo) {
      const hoverCard = document.createElement("div");
      hoverCard.className = "map-note-card";
      const hoverTitle = document.createElement("strong");
      hoverTitle.textContent = place.label;
      const hoverMemo = document.createElement("p");
      hoverMemo.textContent = place.memo;
      hoverCard.append(hoverTitle, hoverMemo);
      pin.addEventListener("mouseenter", () => {
        state.hoverInfoWindow?.setContent(hoverCard);
        state.hoverInfoWindow?.open({ map: state.map, anchor: marker, shouldFocus: false });
      });
      pin.addEventListener("mouseleave", () => state.hoverInfoWindow?.close());
    }
    pin.addEventListener("pointerdown", (event) => {
      state.routeModifierPressed = event.ctrlKey || event.metaKey;
    });
    marker.addEventListener("gmp-click", () => {
      if (state.routeModifierPressed) {
        toggleRoutePlace(place);
        return;
      }
      selectPlace(place);
      openDrawerForEdit(place);
    });
    state.markers.set(place.id, marker);
    bounds.extend(position);
    positionCount += 1;
  });
  if (fitMap && positionCount) {
    state.map.fitBounds(bounds, 56);
    if (positionCount === 1) {
      google.maps.event.addListenerOnce(state.map, "idle", () => {
        if (state.map.getZoom() > 14) state.map.setZoom(14);
      });
    }
  }
}

function getSelectedRoutePlaces() {
  return state.routePlaceIds
    .map((id) => state.places.find((place) => place.id === id))
    .filter(Boolean);
}

function toggleRoutePlace(place) {
  if (!Number.isFinite(place.latitude) || !Number.isFinite(place.longitude) || place.location_cache_stale) {
    toast("좌표가 확인된 장소만 경로에 추가할 수 있습니다.", true);
    return;
  }
  clearRouteDrawing();
  const index = state.routePlaceIds.indexOf(place.id);
  if (index >= 0) {
    state.routePlaceIds.splice(index, 1);
  } else {
    if (state.routePlaceIds.length >= 27) {
      toast("한 경로에는 최대 27곳까지 선택할 수 있습니다.", true);
      return;
    }
    state.routePlaceIds.push(place.id);
  }
  updateRouteSelectionVisuals();
  renderRoutePlanner(true);
}

function updateRouteSelectionVisuals() {
  const visualIds = getRouteVisualIds();
  document.querySelectorAll(".place-card[data-id]").forEach((card) => {
    const placeId = Number(card.dataset.id);
    const index = visualIds.indexOf(placeId);
    const dot = card.querySelector(".category-dot");
    const place = state.places.find((item) => item.id === placeId);
    card.classList.toggle("is-route-selected", index >= 0);
    dot?.classList.toggle("route-sequence", index >= 0);
    if (dot) dot.textContent = index >= 0 ? String(index + 1) : "";
    if (dot && place) dot.style.setProperty("--category-color", place.category_color);
  });
  state.markers.forEach((marker, placeId) => {
    const index = visualIds.indexOf(placeId);
    const place = state.places.find((item) => item.id === placeId);
    marker.content?.classList.toggle("is-route-selected", index >= 0);
    const glyph = marker.content?.querySelector("span");
    if (glyph && place) glyph.textContent = index >= 0 ? String(index + 1) : place.category_name.slice(0, 1);
  });
}

function renderRoutePlanner(resetStatus = false) {
  const placesById = new Map(state.places.map((place) => [place.id, place]));
  const visualIds = getRouteVisualIds();
  els.routePlanner.hidden = state.routePlaceIds.length === 0;
  els.routeCount.textContent = `선택한 장소 ${state.routePlaceIds.length}곳`;
  els.routeStopList.replaceChildren();
  visualIds.forEach((id, index) => {
    const place = placesById.get(id);
    if (!place) return;
    const item = document.createElement("li");
    const number = document.createElement("span");
    number.textContent = String(index + 1);
    const name = document.createElement("strong");
    name.textContent = place.label;
    item.append(number, name);
    els.routeStopList.appendChild(item);
  });
  const hasEnough = state.routePlaceIds.length >= 2;
  els.routeOrderedButton.disabled = !hasEnough;
  els.routeOptimalButton.disabled = !hasEnough || state.routePlaceIds.length > 10;
  els.routeOptimalButton.title = state.routePlaceIds.length > 10 ? "순서 무관 최적화는 최대 10곳까지 지원합니다." : "";
  if (resetStatus) {
    els.routeStatus.textContent = !hasEnough
      ? "Ctrl을 누른 채 장소를 한 곳 더 선택하세요."
      : state.routePlaceIds.length > 10
        ? "클릭 순서 경로는 가능하지만 순서 무관 최적화는 최대 10곳입니다."
        : "두 방식 중 하나를 눌러 자동차 경로를 계산하세요.";
  }
}

function clearRoutePolylines() {
  state.routePolylines.forEach((polyline) => polyline.setMap(null));
  state.routePolylines = [];
}

function clearRouteDrawing() {
  clearRoutePolylines();
  state.routeDisplayIds = [];
}

function clearRouteSelection() {
  clearRouteDrawing();
  state.routePlaceIds = [];
  updateRouteSelectionVisuals();
  renderRoutePlanner(true);
}

async function ensureRoutesLibrary() {
  if (state.Route && state.RouteMatrix) return;
  const { Route, RouteMatrix } = await google.maps.importLibrary("routes");
  state.Route = Route;
  state.RouteMatrix = RouteMatrix;
}

function routeLocation(place) {
  if (place.provider === "google" && place.provider_place_id && state.Place) {
    return new state.Place({ id: place.provider_place_id });
  }
  return { lat: place.latitude, lng: place.longitude };
}

function describeRouteError(error) {
  const details = [error?.code, error?.status, error?.message]
    .filter(Boolean)
    .join(" · ")
    .replace(/key=[^&\s]+/gi, "key=***")
    .slice(0, 240);
  if (/REQUEST_DENIED|PERMISSION_DENIED|not authorized|API_KEY_SERVICE_BLOCKED/i.test(details)) {
    return "Routes API 권한이 거부되었습니다. API 키 제한에 Routes API가 포함됐는지 확인해 주세요.";
  }
  if (/BILLING|billing/i.test(details)) {
    return "Routes API 결제 계정이 활성화되지 않았습니다. Google Cloud 결제 연결 상태를 확인해 주세요.";
  }
  if (/OVER_QUERY_LIMIT|RESOURCE_EXHAUSTED|quota/i.test(details)) {
    return "Routes API 사용 한도에 도달했습니다. Google Cloud 할당량을 확인해 주세요.";
  }
  if (/network|fetch|Failed to fetch/i.test(details)) {
    return "Routes API에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
  return details
    ? `경로를 계산하지 못했습니다. Google 오류: ${details}`
    : "경로를 계산하지 못했습니다. Routes API 활성화와 API 키 제한을 확인해 주세요.";
}

async function findOptimalOpenRoute(places) {
  const locations = places.map(routeLocation);
  const { matrix } = await state.RouteMatrix.computeRouteMatrix({
    origins: locations,
    destinations: locations,
    travelMode: "DRIVING",
    fields: ["durationMillis", "condition"],
  });
  const size = places.length;
  const costs = Array.from({ length: size }, (_, from) =>
    Array.from({ length: size }, (_, to) => {
      if (from === to) return 0;
      const item = matrix?.rows?.[from]?.items?.[to];
      return Number.isFinite(item?.durationMillis) ? item.durationMillis : Number.POSITIVE_INFINITY;
    })
  );
  const stateCount = 1 << size;
  const best = Array.from({ length: stateCount }, () => new Float64Array(size).fill(Number.POSITIVE_INFINITY));
  const previous = Array.from({ length: stateCount }, () => new Int16Array(size).fill(-1));
  for (let start = 0; start < size; start += 1) best[1 << start][start] = 0;
  for (let mask = 1; mask < stateCount; mask += 1) {
    for (let last = 0; last < size; last += 1) {
      const current = best[mask][last];
      if (!Number.isFinite(current)) continue;
      for (let next = 0; next < size; next += 1) {
        if (mask & (1 << next)) continue;
        const nextCost = current + costs[last][next];
        const nextMask = mask | (1 << next);
        if (nextCost < best[nextMask][next]) {
          best[nextMask][next] = nextCost;
          previous[nextMask][next] = last;
        }
      }
    }
  }
  const fullMask = stateCount - 1;
  let last = -1;
  let lowest = Number.POSITIVE_INFINITY;
  for (let candidate = 0; candidate < size; candidate += 1) {
    if (best[fullMask][candidate] < lowest) {
      lowest = best[fullMask][candidate];
      last = candidate;
    }
  }
  if (last < 0 || !Number.isFinite(lowest)) throw new Error("선택한 장소를 모두 연결하는 자동차 경로가 없습니다.");
  const order = [];
  let mask = fullMask;
  while (last >= 0) {
    order.push(last);
    const nextLast = previous[mask][last];
    mask ^= 1 << last;
    last = nextLast;
  }
  return order.reverse().map((index) => places[index]);
}

function formatRouteDistance(meters) {
  if (!Number.isFinite(meters)) return "거리 정보 없음";
  return meters < 1000 ? `${Math.round(meters)}m` : `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)}km`;
}

function formatRouteDuration(milliseconds) {
  if (!Number.isFinite(milliseconds)) return "시간 정보 없음";
  const totalMinutes = Math.max(1, Math.round(milliseconds / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours}시간 ${minutes ? `${minutes}분` : ""}`.trim() : `${minutes}분`;
}

async function drawDrivingRoute(places) {
  const locations = places.map(routeLocation);
  const request = {
    origin: locations[0],
    destination: locations.at(-1),
    travelMode: "DRIVING",
    fields: ["path", "viewport", "distanceMeters", "durationMillis"],
  };
  if (locations.length > 2) request.intermediates = locations.slice(1, -1).map((location) => ({ location }));
  const { routes = [] } = await state.Route.computeRoutes(request);
  if (!routes.length) throw new Error("선택한 장소를 연결하는 자동차 경로가 없습니다.");
  const route = routes[0];
  clearRoutePolylines();
  state.routePolylines = route.createPolylines();
  state.routePolylines.forEach((polyline) => {
    polyline.setOptions({ strokeColor: "#2d6cdf", strokeOpacity: .9, strokeWeight: 6, zIndex: 20 });
    polyline.setMap(state.map);
  });
  if (route.viewport) state.map.fitBounds(route.viewport, 70);
  return route;
}

async function calculateSelectedRoute(mode) {
  const selected = getSelectedRoutePlaces();
  if (selected.length < 2) {
    toast("Ctrl을 누른 채 장소를 2곳 이상 선택해 주세요.", true);
    return;
  }
  if (mode === "optimal" && selected.length > 10) {
    toast("순서 무관 최적화는 최대 10곳까지 지원합니다.", true);
    return;
  }
  els.routeOrderedButton.disabled = true;
  els.routeOptimalButton.disabled = true;
  els.routeStatus.classList.add("is-loading");
  els.routeStatus.textContent = mode === "optimal" ? "모든 장소 사이의 이동시간을 비교하는 중…" : "선택한 순서로 경로를 계산하는 중…";
  try {
    await ensureRoutesLibrary();
    const ordered = mode === "optimal" ? await findOptimalOpenRoute(selected) : selected;
    const route = await drawDrivingRoute(ordered);
    state.routeDisplayIds = ordered.map((place) => place.id);
    updateRouteSelectionVisuals();
    renderRoutePlanner(false);
    const label = mode === "optimal" ? "순서 무관 최적 경로" : "클릭 순서 경로";
    els.routeStatus.textContent = `${label} · ${formatRouteDistance(route.distanceMeters)} · 약 ${formatRouteDuration(route.durationMillis)}`;
    toast(`${label}를 지도에 표시했습니다.`);
  } catch (error) {
    console.error(error);
    const message = /모두 연결|자동차 경로/.test(error.message)
      ? error.message
      : describeRouteError(error);
    els.routeStatus.textContent = message;
    toast(message, true);
  } finally {
    els.routeStatus.classList.remove("is-loading");
    const hasEnough = state.routePlaceIds.length >= 2;
    els.routeOrderedButton.disabled = !hasEnough;
    els.routeOptimalButton.disabled = !hasEnough || state.routePlaceIds.length > 10;
  }
}

function selectPlace(place) {
  state.activePlaceId = place.id;
  document.querySelectorAll(".place-card[data-id]").forEach((card) => card.classList.toggle("is-active", Number(card.dataset.id) === place.id));
  state.markers.forEach((marker, id) => marker.content?.classList.toggle("is-active", id === place.id));
  if (Number.isFinite(place.latitude) && Number.isFinite(place.longitude) && !place.location_cache_stale) {
    state.map?.panTo({ lat: place.latitude, lng: place.longitude });
    if (state.map?.getZoom() < 12) state.map.setZoom(12);
  }
}

function focusMapOnLocation(location, zoom = 16, accountForDrawer = false) {
  if (!state.map || !Number.isFinite(location?.lat) || !Number.isFinite(location?.lng)) return;
  state.map.panTo(location);
  state.map.setZoom(zoom);
  if (!accountForDrawer || window.innerWidth <= 900) return;
  window.setTimeout(() => {
    if (!els.drawer.classList.contains("is-open")) return;
    const drawerWidth = Math.min(els.drawer.getBoundingClientRect().width, window.innerWidth * .45);
    state.map.panBy(drawerWidth / 2, 0);
  }, 280);
}

function openDrawerForSearch(place, options = {}) {
  const location = place.location.toJSON();
  const region = parseAddressComponents(place.addressComponents || []);
  resetPlaceForm();
  els.drawerKicker.textContent = options.kicker || "SAVE FROM GOOGLE MAPS";
  els.drawerTitle.textContent = "장소 저장";
  els.sourcePreview.hidden = false;
  els.sourceName.textContent = place.displayName || "Google 장소";
  els.sourceAddress.textContent = place.formattedAddress || "";
  els.provider.value = "google";
  els.providerPlaceId.value = place.id;
  els.latitude.value = location.lat;
  els.longitude.value = location.lng;
  els.placeLabel.value = options.label || place.displayName || "";
  els.countryCode.value = region.country_code;
  els.region.value = region.region;
  els.locality.value = region.locality;
  els.district.value = region.district;
  els.memo.value = options.memo || "";
  state.drawerFromShared = Boolean(options.fromShared);
  openDrawer();
  focusMapOnLocation(location, 17, true);
}

function openDrawerForManual(location) {
  resetPlaceForm();
  els.drawerKicker.textContent = "PIN A COORDINATE";
  els.drawerTitle.textContent = "직접 지정한 장소";
  els.provider.value = "manual";
  els.providerPlaceId.value = `manual:${crypto.randomUUID()}`;
  els.latitude.value = location.lat;
  els.longitude.value = location.lng;
  state.drawerFromShared = false;
  showManualPreview(location);
  openDrawer();
  focusMapOnLocation(location, 17, true);
  els.placeLabel.focus();
}

function showManualPreview(location) {
  clearManualPreview();
  if (!state.map || !state.AdvancedMarkerElement) return;
  const pin = document.createElement("div");
  pin.className = "map-pin manual-preview-pin is-active";
  const glyph = document.createElement("span");
  glyph.textContent = "+";
  pin.appendChild(glyph);
  state.manualPreviewMarker = new state.AdvancedMarkerElement({
    map: state.map,
    position: location,
    title: "직접 지정한 위치",
    content: pin,
    zIndex: 1001,
  });
}

function clearManualPreview() {
  if (state.manualPreviewMarker) state.manualPreviewMarker.map = null;
  state.manualPreviewMarker = null;
}

function openDrawerForEdit(place) {
  resetPlaceForm();
  els.drawerKicker.textContent = "EDIT YOUR NOTE";
  els.drawerTitle.textContent = "장소 수정";
  els.placeId.value = place.id;
  els.provider.value = place.provider;
  els.providerPlaceId.value = place.provider_place_id;
  els.latitude.value = place.latitude ?? "";
  els.longitude.value = place.longitude ?? "";
  els.placeLabel.value = place.label;
  els.placeCategory.value = String(place.category_id);
  els.plannedMonth.value = place.planned_month ? String(place.planned_month) : "";
  els.countryCode.value = place.country_code;
  els.region.value = place.region;
  els.locality.value = place.locality;
  els.district.value = place.district;
  els.memo.value = place.memo;
  els.deletePlaceButton.hidden = false;
  state.drawerFromShared = false;
  openDrawer();
  if (Number.isFinite(place.latitude) && Number.isFinite(place.longitude) && !place.location_cache_stale) {
    focusMapOnLocation({ lat: place.latitude, lng: place.longitude }, 16, true);
  }
}

function resetPlaceForm() {
  clearManualPreview();
  els.placeForm.reset();
  els.placeId.value = "";
  els.provider.value = "google";
  els.providerPlaceId.value = "";
  els.latitude.value = "";
  els.longitude.value = "";
  els.sourcePreview.hidden = true;
  els.deletePlaceButton.hidden = true;
  els.placeCategory.value = String(state.categories[0]?.id || "");
  els.plannedMonth.value = "";
}

function openDrawer() {
  els.drawerBackdrop.hidden = false;
  els.drawer.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => els.drawer.classList.add("is-open"));
}

function closeDrawer() {
  els.drawer.classList.remove("is-open");
  els.drawer.setAttribute("aria-hidden", "true");
  window.setTimeout(() => { els.drawerBackdrop.hidden = true; }, 220);
  clearManualPreview();
  if (state.drawerFromShared) {
    state.drawerFromShared = false;
    clearSharePreview();
  }
}

async function savePlace(event) {
  event.preventDefault();
  const existingId = els.placeId.value;
  const payload = {
    provider: els.provider.value,
    provider_place_id: els.providerPlaceId.value,
    label: els.placeLabel.value,
    category_id: Number(els.placeCategory.value),
    planned_month: els.plannedMonth.value === "" ? null : Number(els.plannedMonth.value),
    country_code: els.countryCode.value,
    region: els.region.value,
    locality: els.locality.value,
    district: els.district.value,
    memo: els.memo.value,
    latitude: els.latitude.value === "" ? null : Number(els.latitude.value),
    longitude: els.longitude.value === "" ? null : Number(els.longitude.value),
  };
  const submit = els.placeForm.querySelector("button[type='submit']");
  submit.disabled = true;
  try {
    const result = await api(existingId ? `/api/places/${existingId}` : "/api/places", {
      method: existingId ? "PUT" : "POST",
      body: JSON.stringify(payload),
    });
    const index = state.places.findIndex((place) => place.id === result.place.id);
    if (index >= 0) state.places[index] = result.place;
    else state.places.unshift(result.place);
    await reloadCategories();
    renderFilters();
    applyFilters(false);
    closeDrawer();
    setView("saved");
    toast(existingId ? "장소를 수정했습니다." : "지도에 장소를 저장했습니다.");
  } catch (error) {
    toast(error.message, true);
  } finally {
    submit.disabled = false;
  }
}

async function deleteCurrentPlace() {
  const id = Number(els.placeId.value);
  if (!id || !window.confirm("이 장소와 메모를 삭제할까요?")) return;
  try {
    await api(`/api/places/${id}`, { method: "DELETE", body: "{}" });
    state.places = state.places.filter((place) => place.id !== id);
    if (state.routePlaceIds.includes(id)) {
      clearRouteDrawing();
      state.routePlaceIds = state.routePlaceIds.filter((placeId) => placeId !== id);
      renderRoutePlanner(true);
    }
    state.activePlaceId = null;
    await reloadCategories();
    renderFilters();
    applyFilters(false);
    closeDrawer();
    toast("장소를 삭제했습니다.");
  } catch (error) {
    toast(error.message, true);
  }
}

function openCategoryDialog() {
  els.categoryForm.reset();
  els.categoryColor.value = "#7B5CFA";
  renderCategories();
  els.categoryDialog.showModal();
  els.categoryName.focus();
}

async function createCategory(event) {
  event.preventDefault();
  try {
    const result = await api("/api/categories", {
      method: "POST",
      body: JSON.stringify({ name: els.categoryName.value, color: els.categoryColor.value }),
    });
    state.categories.push(result.category);
    renderCategories();
    els.categoryName.value = "";
    toast("카테고리를 추가했습니다.");
  } catch (error) {
    toast(error.message, true);
  }
}

async function removeCategory(category) {
  if (!window.confirm(`‘${category.name}’ 카테고리를 삭제할까요?`)) return;
  try {
    await api(`/api/categories/${category.id}`, { method: "DELETE", body: "{}" });
    state.categories = state.categories.filter((item) => item.id !== category.id);
    renderCategories();
    toast("카테고리를 삭제했습니다.");
  } catch (error) {
    toast(error.message, true);
  }
}

async function reloadCategories() {
  const result = await api("/api/categories");
  state.categories = result.categories;
  renderCategories();
}

async function refreshStaleLocations() {
  const stale = state.places.filter((place) => place.provider === "google" && place.location_cache_stale);
  if (!stale.length || !state.Place) return;
  let next = 0;
  async function worker() {
    while (next < stale.length) {
      const place = stale[next++];
      try {
        const googlePlace = new state.Place({ id: place.provider_place_id });
        await googlePlace.fetchFields({ fields: ["location"] });
        if (!googlePlace.location) continue;
        const location = googlePlace.location.toJSON();
        const result = await api(`/api/places/${place.id}/location-cache`, {
          method: "PUT",
          body: JSON.stringify({ latitude: location.lat, longitude: location.lng }),
        });
        const index = state.places.findIndex((item) => item.id === place.id);
        if (index >= 0) state.places[index] = result.place;
      } catch (error) {
        console.warn("Could not refresh a saved Place ID", place.provider_place_id, error);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, stale.length) }, () => worker()));
  applyFilters(false);
}

bootstrap();
