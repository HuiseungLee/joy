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
  hoverInfoWindow: null,
  markers: new Map(),
  activePlaceId: null,
  pickMode: false,
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
  manualPinButton: $("#manual-pin-button"),
  pickBanner: $("#pick-banner"),
  cancelPickButton: $("#cancel-pick-button"),
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
      els.manualPinButton.hidden = true;
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
    element.addEventListener("change", () => applyFilters(true));
  });
  els.areaSearch.addEventListener("input", () => applyFilters(true));
  els.manualPinButton.addEventListener("click", startPickMode);
  els.cancelPickButton.addEventListener("click", stopPickMode);
  els.drawerClose.addEventListener("click", closeDrawer);
  els.drawerBackdrop.addEventListener("click", closeDrawer);
  els.cancelPlaceButton.addEventListener("click", closeDrawer);
  els.placeForm.addEventListener("submit", savePlace);
  els.deletePlaceButton.addEventListener("click", deleteCurrentPlace);
  els.categoryManageButton.addEventListener("click", openCategoryDialog);
  els.categoryDialogClose.addEventListener("click", () => els.categoryDialog.close());
  els.categoryForm.addEventListener("submit", createCategory);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && els.drawer.classList.contains("is-open")) closeDrawer();
  });
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
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&libraries=places,marker&language=ko&callback=__joyMapReady`;
    script.async = true;
    script.onerror = () => reject(new Error("Google 지도 스크립트를 불러오지 못했습니다."));
    document.head.appendChild(script);
  });
}

async function initializeMap() {
  const [{ Map }, { AdvancedMarkerElement }, { Place }] = await Promise.all([
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
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    clickableIcons: true,
    gestureHandling: "cooperative",
  });
  state.hoverInfoWindow = new google.maps.InfoWindow({ disableAutoPan: true });
  state.map.addListener("click", (event) => {
    if (!state.pickMode || !event.latLng) return;
    const location = event.latLng.toJSON();
    stopPickMode();
    openDrawerForManual(location);
  });
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
  const dot = document.createElement("span");
  dot.className = "category-dot";
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
  card.addEventListener("click", () => {
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
    glyph.textContent = place.category_name.slice(0, 1);
    pin.appendChild(glyph);
    const marker = new state.AdvancedMarkerElement({ map: state.map, position, title: place.label, content: pin });
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
    marker.addListener("click", () => {
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

function selectPlace(place) {
  state.activePlaceId = place.id;
  document.querySelectorAll(".place-card[data-id]").forEach((card) => card.classList.toggle("is-active", Number(card.dataset.id) === place.id));
  state.markers.forEach((marker, id) => marker.content?.classList.toggle("is-active", id === place.id));
  if (Number.isFinite(place.latitude) && Number.isFinite(place.longitude) && !place.location_cache_stale) {
    state.map?.panTo({ lat: place.latitude, lng: place.longitude });
    if (state.map?.getZoom() < 12) state.map.setZoom(12);
  }
}

function openDrawerForSearch(place) {
  const location = place.location.toJSON();
  const region = parseAddressComponents(place.addressComponents || []);
  resetPlaceForm();
  els.drawerKicker.textContent = "SAVE FROM GOOGLE MAPS";
  els.drawerTitle.textContent = "장소 저장";
  els.sourcePreview.hidden = false;
  els.sourceName.textContent = place.displayName || "Google 장소";
  els.sourceAddress.textContent = place.formattedAddress || "";
  els.provider.value = "google";
  els.providerPlaceId.value = place.id;
  els.latitude.value = location.lat;
  els.longitude.value = location.lng;
  els.placeLabel.value = place.displayName || "";
  els.countryCode.value = region.country_code;
  els.region.value = region.region;
  els.locality.value = region.locality;
  els.district.value = region.district;
  openDrawer();
}

function openDrawerForManual(location) {
  resetPlaceForm();
  els.drawerKicker.textContent = "PIN A COORDINATE";
  els.drawerTitle.textContent = "직접 지정한 장소";
  els.provider.value = "manual";
  els.providerPlaceId.value = `manual:${crypto.randomUUID()}`;
  els.latitude.value = location.lat;
  els.longitude.value = location.lng;
  openDrawer();
  els.placeLabel.focus();
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
  openDrawer();
}

function resetPlaceForm() {
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

function startPickMode() {
  if (!state.map) return;
  state.pickMode = true;
  els.pickBanner.hidden = false;
  els.manualPinButton.hidden = true;
  els.map.style.cursor = "crosshair";
}

function stopPickMode() {
  state.pickMode = false;
  els.pickBanner.hidden = true;
  els.manualPinButton.hidden = false;
  els.map.style.cursor = "";
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
