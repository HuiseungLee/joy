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
  routeTravelMode: "TRANSIT",
  transitItinerary: null,
  routeStartId: null,
  routeDestinationId: null,
  routeEditTarget: null,
  routeCustomPlaces: new Map(),
  routeCustomMarkers: new Map(),
  nextCustomRouteId: -1,
  manualPreviewMarker: null,
  currentLocationMarker: null,
  currentLocation: null,
  currentRoutePlaceId: null,
  projectionOverlay: null,
  contextLocation: null,
  lastContextAt: 0,
  longPressTimer: null,
  longPressStart: null,
  suppressMapClickUntil: 0,
  mapPlaceLoadingId: null,
  sharePreviewMarker: null,
  pendingSharedPlace: null,
  drawerFromShared: false,
  activePlaceId: null,
  activeDetailPlaceId: null,
  currentView: "saved",
  toastTimer: null,
};

const els = {
  loginScreen: $("#login-screen"),
  loginForm: $("#login-form"),
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
  mapStage: $("#map-stage"),
  map: $("#map"),
  mapMessage: $("#map-message"),
  shareMessageButton: $("#share-message-button"),
  currentLocationButton: $("#current-location-button"),
  placeDetail: $("#place-detail"),
  placeDetailHandle: $("#place-detail-handle"),
  placeDetailClose: $("#place-detail-close"),
  placeDetailCategory: $("#place-detail-category"),
  placeDetailTitle: $("#place-detail-title"),
  placeDetailLocation: $("#place-detail-location"),
  placeDetailMemo: $("#place-detail-memo"),
  placeDetailEdit: $("#place-detail-edit"),
  mapContextMenu: $("#map-context-menu"),
  shareConfirmCard: $("#share-confirm-card"),
  shareConfirmName: $("#share-confirm-name"),
  shareConfirmAddress: $("#share-confirm-address"),
  shareConfirmButton: $("#share-confirm-button"),
  shareRetryButton: $("#share-retry-button"),
  shareCancelButton: $("#share-cancel-button"),
  routePlanner: $("#route-planner"),
  routePlannerHandle: $("#route-planner-handle"),
  routeCount: $("#route-count"),
  routeStopList: $("#route-stop-list"),
  routeStatus: $("#route-status"),
  routeDrivingMode: $("#route-driving-mode"),
  routeTransitMode: $("#route-transit-mode"),
  routeOrderedButton: $("#route-ordered-button"),
  routeOptimalButton: $("#route-optimal-button"),
  routeDetailsButton: $("#route-details-button"),
  routeClearButton: $("#route-clear-button"),
  routeAddViaButton: $("#route-add-via-button"),
  routeSwapButton: $("#route-swap-button"),
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
  categoryId: $("#category-id"),
  categoryName: $("#category-name"),
  categoryColor: $("#category-color"),
  categoryList: $("#category-list"),
  categorySubmit: $("#category-submit"),
  categoryEditCancel: $("#category-edit-cancel"),
  transitDialog: $("#transit-dialog"),
  transitSummary: $("#transit-summary"),
  transitItinerary: $("#transit-itinerary"),
  toast: $("#toast"),
};

async function api(path, options = {}) {
  const request = {
    credentials: "include",
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
  els.currentLocationButton.addEventListener("click", locateCurrentPosition);
  els.placeDetailClose.addEventListener("click", closePlaceDetail);
  bindMobileSheet(els.placeDetail, els.placeDetailHandle, "--place-sheet-height", .4);
  bindMobileSheet(els.routePlanner, els.routePlannerHandle, "--route-sheet-height", .5);
  els.placeDetailEdit.addEventListener("click", editDetailedPlace);
  els.placeDetail.querySelectorAll("[data-place-route-role]").forEach((button) => {
    button.addEventListener("click", () => assignDetailedPlaceToRoute(button.dataset.placeRouteRole));
  });
  els.mapContextMenu.addEventListener("click", handleMapContextAction);
  els.shareConfirmButton.addEventListener("click", confirmSharedPlace);
  els.shareRetryButton.addEventListener("click", retrySharedPlaceSearch);
  els.shareCancelButton.addEventListener("click", clearSharePreview);
  els.routeDrivingMode.addEventListener("click", () => setRouteTravelMode("DRIVING"));
  els.routeTransitMode.addEventListener("click", () => setRouteTravelMode("TRANSIT"));
  els.routeOrderedButton.addEventListener("click", () => calculateSelectedRoute("ordered"));
  els.routeOptimalButton.addEventListener("click", () => calculateSelectedRoute("optimal"));
  els.routeDetailsButton.addEventListener("click", openTransitDialog);
  els.routeClearButton.addEventListener("click", clearRouteSelection);
  els.routeAddViaButton.addEventListener("click", () => beginRouteStopEdit("via"));
  els.routeSwapButton.addEventListener("click", swapRouteEndpoints);
  els.routeStopList.addEventListener("click", handleRouteStopAction);
  els.drawerBackdrop.addEventListener("click", closeDrawer);
  els.placeForm.addEventListener("submit", savePlace);
  els.shareForm.addEventListener("submit", handleSharedMessage);
  els.deletePlaceButton.addEventListener("click", deleteCurrentPlace);
  els.categoryManageButton.addEventListener("click", openCategoryDialog);
  els.categoryForm.addEventListener("submit", saveCategory);
  els.categoryEditCancel.addEventListener("click", resetCategoryForm);
  document.addEventListener("click", handleUiAction, true);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    hideMapContextMenu();
    if (!els.placeDetail.hidden) closePlaceDetail();
    if (els.drawer.classList.contains("is-open")) closeDrawer();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest?.("#map-context-menu")) hideMapContextMenu();
  });
}

function setMobileSheetHeight(panel, property, fraction) {
  if (window.innerWidth > 900) {
    panel.style.removeProperty(property);
    return;
  }
  const stageHeight = Math.max(280, els.mapStage.getBoundingClientRect().height);
  const height = Math.max(92, Math.min(stageHeight * .78, stageHeight * fraction));
  panel.style.setProperty(property, `${Math.round(height)}px`);
}

function bindMobileSheet(panel, handle, property, defaultFraction) {
  let drag = null;
  let suppressClickUntil = 0;
  const snapFractions = [.18, defaultFraction, .76];
  handle.addEventListener("click", () => {
    if (Date.now() < suppressClickUntil || window.innerWidth > 900) return;
    const stageHeight = els.mapStage.getBoundingClientRect().height;
    const current = panel.getBoundingClientRect().height / stageHeight;
    const next = current < (snapFractions[0] + snapFractions[1]) / 2
      ? snapFractions[1]
      : current < (snapFractions[1] + snapFractions[2]) / 2
        ? snapFractions[2]
        : snapFractions[0];
    setMobileSheetHeight(panel, property, next);
  });
  handle.addEventListener("pointerdown", (event) => {
    if (window.innerWidth > 900) return;
    drag = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: panel.getBoundingClientRect().height,
      moved: false,
    };
    handle.setPointerCapture?.(event.pointerId);
    panel.classList.add("is-dragging");
  });
  handle.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const stageHeight = els.mapStage.getBoundingClientRect().height;
    const delta = drag.startY - event.clientY;
    if (Math.abs(delta) > 5) drag.moved = true;
    const height = Math.max(92, Math.min(stageHeight * .78, drag.startHeight + delta));
    panel.style.setProperty(property, `${Math.round(height)}px`);
    event.preventDefault();
  });
  const finish = (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const stageHeight = els.mapStage.getBoundingClientRect().height;
    const current = panel.getBoundingClientRect().height / stageHeight;
    const nearest = snapFractions.reduce((best, value) =>
      Math.abs(value - current) < Math.abs(best - current) ? value : best
    );
    panel.classList.remove("is-dragging");
    setMobileSheetHeight(panel, property, nearest);
    if (drag.moved) suppressClickUntil = Date.now() + 400;
    drag = null;
  };
  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", finish);
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
  } else if (action === "close-transit-dialog") {
    event.preventDefault();
    if (els.transitDialog.open) els.transitDialog.close();
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
      body: JSON.stringify({ password: els.loginPassword.value }),
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
  state.hoverInfoWindow = new google.maps.InfoWindow({
    disableAutoPan: true,
    headerDisabled: true,
    maxWidth: 340,
  });
  state.map.addListener("click", (event) => {
    hideMapContextMenu();
    if (Date.now() < state.suppressMapClickUntil) return;
    if (!event.placeId) return;
    event.stop?.();
    void openDrawerForMapPlace(event.placeId);
  });
  const handleContextMenu = (event) => {
    event.domEvent?.preventDefault?.();
    if (!event.latLng) return;
    const now = Date.now();
    if (now - state.lastContextAt < 350) return;
    state.lastContextAt = now;
    const domEvent = event.domEvent;
    showMapContextMenu(event.latLng.toJSON(), domEvent?.clientX, domEvent?.clientY);
  };
  state.map.addListener("contextmenu", handleContextMenu);
  // Older Maps builds can still emit only rightclick. The time guard above
  // prevents the compatibility event from opening the drawer twice.
  state.map.addListener("rightclick", handleContextMenu);
  state.projectionOverlay = new google.maps.OverlayView();
  state.projectionOverlay.onAdd = () => {};
  state.projectionOverlay.draw = () => {};
  state.projectionOverlay.onRemove = () => {};
  state.projectionOverlay.setMap(state.map);
  bindMapLongPress();
}

async function openDrawerForMapPlace(placeId) {
  if (!state.Place || state.mapPlaceLoadingId === placeId) return;
  const existing = state.places.find((place) =>
    place.provider === "google" && place.provider_place_id === placeId
  );
  if (existing) {
    selectPlace(existing);
    openPlaceDetail(existing);
    return;
  }
  state.mapPlaceLoadingId = placeId;
  toast("지도에서 선택한 장소 정보를 불러오는 중…");
  try {
    const place = new state.Place({ id: placeId });
    await place.fetchFields({
      fields: ["displayName", "formattedAddress", "location", "googleMapsURI", "addressComponents"],
    });
    if (!place.location) throw new Error("장소의 위치 정보를 찾을 수 없습니다.");
    openDrawerForSearch(place, { kicker: "SAVE FROM MAP PLACE" });
    toast("장소 정보를 확인한 뒤 저장해 주세요.");
  } catch (error) {
    console.error(error);
    toast(error.message || "선택한 장소 정보를 불러오지 못했습니다.", true);
  } finally {
    state.mapPlaceLoadingId = null;
  }
}

function openPlaceDetail(place) {
  state.activeDetailPlaceId = place.id;
  els.placeDetailCategory.textContent = [place.category_name, place.planned_month ? `${place.planned_month}월 방문` : ""].filter(Boolean).join(" · ");
  els.placeDetailTitle.textContent = place.label;
  els.placeDetailLocation.textContent = [place.region, place.locality, place.district].filter(Boolean).join(" · ") || "위치 태그 없음";
  els.placeDetailMemo.textContent = place.memo || "저장된 메모가 없습니다.";
  els.placeDetailMemo.classList.toggle("is-empty", !place.memo);
  els.placeDetail.hidden = false;
  setMobileSheetHeight(els.placeDetail, "--place-sheet-height", .4);
  els.routePlanner.classList.add("is-obscured");
  hideMapContextMenu();
  revealMapForMobile();
}

function closePlaceDetail() {
  els.placeDetail.hidden = true;
  els.routePlanner.classList.remove("is-obscured");
  state.activeDetailPlaceId = null;
}

function getDetailedPlace() {
  return state.places.find((place) => place.id === state.activeDetailPlaceId) || null;
}

function editDetailedPlace() {
  const place = getDetailedPlace();
  if (!place) return;
  closePlaceDetail();
  openDrawerForEdit(place);
}

async function assignDetailedPlaceToRoute(role) {
  const place = getDetailedPlace();
  if (!place) return;
  const assigned = await assignRoutePlace(place, role);
  if (assigned) closePlaceDetail();
}

function bindMapLongPress() {
  const cancel = () => {
    window.clearTimeout(state.longPressTimer);
    state.longPressTimer = null;
    state.longPressStart = null;
  };
  els.map.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
    cancel();
    state.longPressStart = { x: event.clientX, y: event.clientY };
    state.longPressTimer = window.setTimeout(() => {
      const projection = state.projectionOverlay?.getProjection?.();
      const rect = els.map.getBoundingClientRect();
      if (!projection || !state.longPressStart) return;
      const point = new google.maps.Point(state.longPressStart.x - rect.left, state.longPressStart.y - rect.top);
      const latLng = projection.fromContainerPixelToLatLng(point);
      if (!latLng) return;
      state.suppressMapClickUntil = Date.now() + 900;
      navigator.vibrate?.(30);
      showMapContextMenu(latLng.toJSON(), state.longPressStart.x, state.longPressStart.y);
      state.longPressTimer = null;
    }, 650);
  }, { passive: true });
  els.map.addEventListener("pointermove", (event) => {
    if (!state.longPressStart) return;
    if (Math.hypot(event.clientX - state.longPressStart.x, event.clientY - state.longPressStart.y) > 12) cancel();
  }, { passive: true });
  ["pointerup", "pointercancel", "pointerleave"].forEach((name) => els.map.addEventListener(name, cancel, { passive: true }));
  els.map.addEventListener("contextmenu", (event) => event.preventDefault());
}

function showMapContextMenu(location, clientX, clientY) {
  closePlaceDetail();
  state.contextLocation = location;
  const stageRect = els.mapStage.getBoundingClientRect();
  const width = 210;
  const x = Number.isFinite(clientX) ? clientX - stageRect.left : stageRect.width / 2;
  const y = Number.isFinite(clientY) ? clientY - stageRect.top : stageRect.height / 2;
  els.mapContextMenu.style.left = `${Math.max(8, Math.min(x, stageRect.width - width - 8))}px`;
  els.mapContextMenu.style.top = `${Math.max(8, Math.min(y, stageRect.height - 250))}px`;
  els.mapContextMenu.hidden = false;
}

function hideMapContextMenu() {
  els.mapContextMenu.hidden = true;
}

function coordinateRoutePlace(location) {
  const id = state.nextCustomRouteId--;
  const domestic = location.lat >= 33 && location.lat <= 39.5 && location.lng >= 124 && location.lng <= 132;
  const place = {
    id,
    provider: "manual",
    provider_place_id: `route:${location.lat},${location.lng}`,
    label: `지도 위치 ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`,
    latitude: location.lat,
    longitude: location.lng,
    country_code: domestic ? "KR" : "",
    location_cache_stale: false,
    category_name: "지도 위치",
    category_color: "#2d6cdf",
  };
  state.routeCustomPlaces.set(id, place);
  return place;
}

async function handleMapContextAction(event) {
  const button = event.target.closest?.("[data-map-action]");
  if (!button || !state.contextLocation) return;
  const location = state.contextLocation;
  const action = button.dataset.mapAction;
  hideMapContextMenu();
  if (action === "save") {
    openDrawerForManual(location);
    return;
  }
  await assignRoutePlace(coordinateRoutePlace(location), action);
}

function requestCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(Object.assign(new Error("위치 기능을 지원하지 않습니다."), { code: 0 }));
      return;
    }
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      resolve({ lat: coords.latitude, lng: coords.longitude });
    }, reject, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  });
}

function showCurrentLocation(location, focus = true) {
  state.currentLocation = location;
  if (state.currentLocationMarker) state.currentLocationMarker.map = null;
  const markerContent = document.createElement("div");
  markerContent.className = "current-location-pin";
  markerContent.setAttribute("aria-label", "내 현재 위치");
  state.currentLocationMarker = new state.AdvancedMarkerElement({
    map: state.map,
    position: location,
    title: "내 현재 위치",
    content: markerContent,
    zIndex: 900,
  });
  if (focus) focusMapOnLocation(location, 16);
}

function currentLocationRoutePlace(location) {
  let place = state.currentRoutePlaceId === null ? null : state.routeCustomPlaces.get(state.currentRoutePlaceId);
  if (!place) {
    const id = state.nextCustomRouteId--;
    state.currentRoutePlaceId = id;
    place = {
      id,
      provider: "manual",
      provider_place_id: "route:current-location",
      label: "내 현재 위치",
      country_code: location.lat >= 33 && location.lat <= 39.5 && location.lng >= 124 && location.lng <= 132 ? "KR" : "",
      location_cache_stale: false,
      category_name: "현위치",
      category_color: "#1687ff",
    };
    state.routeCustomPlaces.set(id, place);
  }
  place.latitude = location.lat;
  place.longitude = location.lng;
  place.country_code = location.lat >= 33 && location.lat <= 39.5 && location.lng >= 124 && location.lng <= 132 ? "KR" : "";
  return place;
}

async function ensureCurrentLocationAsStart() {
  if (state.routeStartId !== null) return true;
  try {
    const location = await requestCurrentPosition();
    showCurrentLocation(location, false);
    await assignRoutePlace(currentLocationRoutePlace(location), "start", { autoCurrentStart: false, silent: true });
    toast("현재 위치를 출발지로 자동 지정했습니다.");
    return true;
  } catch (error) {
    const message = error.code === 1
      ? "위치 권한이 없어 출발지를 자동 지정하지 못했습니다. 출발지를 직접 선택해 주세요."
      : "현재 위치를 확인하지 못했습니다. 출발지를 직접 선택해 주세요.";
    toast(message, true);
    return false;
  }
}

async function locateCurrentPosition() {
  if (!navigator.geolocation || !state.map || !state.AdvancedMarkerElement) {
    toast("이 기기에서는 현위치 기능을 지원하지 않습니다.", true);
    return;
  }
  els.currentLocationButton.disabled = true;
  els.currentLocationButton.textContent = "위치 확인 중…";
  try {
    const location = await requestCurrentPosition();
    showCurrentLocation(location, true);
    toast("현재 위치를 지도에 표시했습니다.");
  } catch (error) {
    const message = error.code === 1
      ? "브라우저 설정에서 위치 권한을 허용해 주세요."
      : "현재 위치를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    toast(message, true);
  } finally {
    els.currentLocationButton.disabled = false;
    els.currentLocationButton.textContent = "◎ 현위치";
  }
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
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "category-edit";
    edit.textContent = "수정";
    edit.addEventListener("click", () => beginCategoryEdit(category));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "category-delete";
    remove.textContent = "삭제";
    remove.addEventListener("click", () => removeCategory(category));
    row.append(edit, remove);
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
  card.addEventListener("click", () => {
    if (state.routeEditTarget) {
      void applyRouteEditSelection(place);
      return;
    }
    selectPlace(place);
    openPlaceDetail(place);
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
    marker.addEventListener("gmp-click", () => {
      if (state.routeEditTarget) {
        void applyRouteEditSelection(place);
        return;
      }
      selectPlace(place);
      openPlaceDetail(place);
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
    .map(getRoutePlaceById)
    .filter(Boolean);
}

function getRoutePlaceById(id) {
  return state.places.find((place) => place.id === id) || state.routeCustomPlaces.get(id) || null;
}

function removeRoutePlaceId(id) {
  state.routePlaceIds = state.routePlaceIds.filter((placeId) => placeId !== id);
  if (state.routeStartId === id) state.routeStartId = null;
  if (state.routeDestinationId === id) state.routeDestinationId = null;
}

async function assignRoutePlace(place, role, options = {}) {
  if (!Number.isFinite(place.latitude) || !Number.isFinite(place.longitude) || place.location_cache_stale) {
    toast("좌표가 확인된 장소만 경로에 추가할 수 있습니다.", true);
    return false;
  }
  if (!(["start", "via", "destination"].includes(role))) return false;
  if (role === "destination" && state.routeStartId === null && options.autoCurrentStart !== false) {
    await ensureCurrentLocationAsStart();
  }
  if (role === "destination" && place.id === state.routeStartId) {
    toast("출발지와 도착지는 서로 다른 장소로 지정해 주세요.", true);
    return false;
  }
  if (role === "start" && place.id === state.routeDestinationId) {
    toast("출발지와 도착지는 서로 다른 장소로 지정해 주세요.", true);
    return false;
  }
  if (role === "via" && (place.id === state.routeStartId || place.id === state.routeDestinationId)) {
    toast("이미 출발지 또는 도착지로 지정된 장소입니다.", true);
    return false;
  }
  if (!state.routePlaceIds.includes(place.id) && state.routePlaceIds.length >= 27) {
    toast("한 경로에는 최대 27곳까지 선택할 수 있습니다.", true);
    return false;
  }
  clearRouteDrawing();
  const replacementId = Number.isFinite(options.replaceId) ? options.replaceId : null;
  const replacementIndex = replacementId === null ? -1 : state.routePlaceIds.indexOf(replacementId);
  if (replacementId !== null && replacementId !== place.id) removeRoutePlaceId(replacementId);
  removeRoutePlaceId(place.id);
  if (role === "start") {
    if (state.routeStartId !== null) removeRoutePlaceId(state.routeStartId);
    state.routePlaceIds.unshift(place.id);
    state.routeStartId = place.id;
  } else if (role === "destination") {
    if (state.routeDestinationId !== null) removeRoutePlaceId(state.routeDestinationId);
    state.routePlaceIds.push(place.id);
    state.routeDestinationId = place.id;
  } else {
    if (replacementIndex >= 0) {
      const destinationIndex = state.routeDestinationId === null ? state.routePlaceIds.length : state.routePlaceIds.indexOf(state.routeDestinationId);
      state.routePlaceIds.splice(Math.min(replacementIndex, destinationIndex < 0 ? state.routePlaceIds.length : destinationIndex), 0, place.id);
    } else {
      const destinationIndex = state.routeDestinationId === null
        ? -1
        : state.routePlaceIds.indexOf(state.routeDestinationId);
      if (destinationIndex >= 0) state.routePlaceIds.splice(destinationIndex, 0, place.id);
      else state.routePlaceIds.push(place.id);
    }
  }
  state.routeEditTarget = null;
  updateRouteSelectionVisuals();
  renderRoutePlanner(true);
  const roleLabel = role === "start" ? "출발지" : role === "destination" ? "도착지" : "경유지";
  if (!options.silent) toast(`${place.label}을(를) ${roleLabel}로 지정했습니다.`);
  return true;
}

function beginRouteStopEdit(role, replaceId = null) {
  if (!(["start", "via", "destination"].includes(role))) return;
  state.routeEditTarget = { role, replaceId: Number.isFinite(replaceId) ? replaceId : null };
  closePlaceDetail();
  renderRoutePlanner(false);
  const roleLabel = role === "start" ? "출발지" : role === "destination" ? "도착지" : "경유지";
  els.routeStatus.textContent = `변경할 ${roleLabel}를 지도나 저장 장소 목록에서 선택하세요.`;
  toast(`${roleLabel}로 사용할 장소를 선택해 주세요.`);
}

async function applyRouteEditSelection(place) {
  const target = state.routeEditTarget;
  if (!target) return false;
  return assignRoutePlace(place, target.role, { replaceId: target.replaceId, autoCurrentStart: true });
}

function removeRouteStop(id) {
  if (!Number.isFinite(id) || !state.routePlaceIds.includes(id)) return;
  clearRouteDrawing();
  removeRoutePlaceId(id);
  if (state.routeCustomPlaces.has(id) && id !== state.currentRoutePlaceId) state.routeCustomPlaces.delete(id);
  state.routeEditTarget = null;
  updateRouteSelectionVisuals();
  renderRoutePlanner(true);
  toast("경로에서 지점을 삭제했습니다.");
}

function swapRouteEndpoints() {
  if (state.routeStartId === null || state.routeDestinationId === null) {
    toast("출발지와 도착지를 모두 지정한 뒤 교환할 수 있습니다.", true);
    return;
  }
  clearRouteDrawing();
  const oldStart = state.routeStartId;
  const oldDestination = state.routeDestinationId;
  const vias = state.routePlaceIds.filter((id) => id !== oldStart && id !== oldDestination);
  state.routeStartId = oldDestination;
  state.routeDestinationId = oldStart;
  state.routePlaceIds = [oldDestination, ...vias, oldStart];
  state.routeEditTarget = null;
  updateRouteSelectionVisuals();
  renderRoutePlanner(true);
  toast("출발지와 도착지를 교환했습니다.");
}

function handleRouteStopAction(event) {
  const button = event.target.closest?.("[data-route-action]");
  if (!button) return;
  const id = Number(button.dataset.routeId);
  const role = button.dataset.routeRole;
  if (button.dataset.routeAction === "edit") beginRouteStopEdit(role, Number.isFinite(id) ? id : null);
  else if (button.dataset.routeAction === "remove") removeRouteStop(id);
}

function updateRouteSelectionVisuals() {
  const visualIds = getRouteVisualIds();
  document.querySelectorAll(".place-card[data-id]").forEach((card) => {
    const placeId = Number(card.dataset.id);
    const index = visualIds.indexOf(placeId);
    const dot = card.querySelector(".category-dot");
    const place = getRoutePlaceById(placeId);
    card.classList.toggle("is-route-selected", index >= 0);
    dot?.classList.toggle("route-sequence", index >= 0);
    if (dot) dot.textContent = index >= 0 ? String(index + 1) : "";
    if (dot && place) dot.style.setProperty("--category-color", place.category_color);
  });
  state.markers.forEach((marker, placeId) => {
    const index = visualIds.indexOf(placeId);
    const place = getRoutePlaceById(placeId);
    marker.content?.classList.toggle("is-route-selected", index >= 0);
    const glyph = marker.content?.querySelector("span");
    if (glyph && place) glyph.textContent = index >= 0 ? String(index + 1) : place.category_name.slice(0, 1);
  });
  updateCustomRouteMarkers(visualIds);
}

function renderRoutePlanner(resetStatus = false) {
  const wasHidden = els.routePlanner.hidden;
  const visualIds = getRouteVisualIds();
  els.routePlanner.hidden = state.routePlaceIds.length === 0 && !state.routeEditTarget;
  if (wasHidden && !els.routePlanner.hidden) setMobileSheetHeight(els.routePlanner, "--route-sheet-height", .5);
  els.routeCount.textContent = `경로 지점 ${state.routePlaceIds.length}곳`;
  els.routeStopList.replaceChildren();
  const viaIds = visualIds.filter((id) => id !== state.routeStartId && id !== state.routeDestinationId);
  const stops = [
    { role: "start", id: state.routeStartId, emptyLabel: "출발지 선택" },
    ...viaIds.map((id) => ({ role: "via", id, emptyLabel: "경유지 선택" })),
    { role: "destination", id: state.routeDestinationId, emptyLabel: "도착지 선택" },
  ];
  stops.forEach(({ role, id, emptyLabel }) => {
    const place = id === null ? null : getRoutePlaceById(id);
    const item = document.createElement("li");
    item.className = `route-stop-row is-${role}`;
    if (state.routeEditTarget?.role === role && (state.routeEditTarget.replaceId === id || state.routeEditTarget.replaceId === null)) {
      item.classList.add("is-editing");
    }
    const marker = document.createElement("span");
    marker.className = "route-stop-marker";
    const name = document.createElement("strong");
    name.textContent = place?.label || emptyLabel;
    if (!place) name.classList.add("is-empty");
    const actions = document.createElement("span");
    actions.className = "route-stop-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.dataset.routeAction = "edit";
    edit.dataset.routeRole = role;
    if (id !== null) edit.dataset.routeId = String(id);
    edit.textContent = place ? "변경" : "선택";
    actions.appendChild(edit);
    if (place) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.dataset.routeAction = "remove";
      remove.dataset.routeRole = role;
      remove.dataset.routeId = String(id);
      remove.setAttribute("aria-label", `${place.label} 경로에서 삭제`);
      remove.textContent = "×";
      actions.appendChild(remove);
    }
    item.append(marker, name, actions);
    els.routeStopList.appendChild(item);
  });
  const hasEnough = state.routePlaceIds.length >= 2 && state.routeStartId !== null && state.routeDestinationId !== null;
  els.routeAddViaButton.disabled = state.routePlaceIds.length >= 27;
  els.routeAddViaButton.classList.toggle("is-active", state.routeEditTarget?.role === "via" && state.routeEditTarget.replaceId === null);
  els.routeSwapButton.disabled = state.routeStartId === null || state.routeDestinationId === null;
  els.routeOrderedButton.disabled = !hasEnough;
  els.routeOptimalButton.disabled = !hasEnough || state.routePlaceIds.length > 10;
  els.routeOptimalButton.title = state.routePlaceIds.length > 10 ? "경유지 최적화는 최대 10곳까지 지원합니다." : "";
  if (resetStatus) {
    const travelModeLabel = getTravelModeLabel();
    els.routeStatus.textContent = state.routeEditTarget
      ? "지도나 저장 장소 목록에서 변경할 지점을 선택하세요."
      : !hasEnough
      ? "장소 상세 또는 지도 메뉴에서 출발지와 도착지를 지정하세요."
      : state.routePlaceIds.length > 10
        ? "지정 순서 경로는 가능하지만 경유지 최적화는 최대 10곳입니다."
        : `두 방식 중 하나를 눌러 ${travelModeLabel} 경로를 계산하세요.`;
  }
}

function getTravelModeLabel(travelMode = state.routeTravelMode) {
  return travelMode === "TRANSIT" ? "대중교통" : "자동차";
}

function setRouteTravelMode(travelMode) {
  if (!(["DRIVING", "TRANSIT"].includes(travelMode))) return;
  state.routeTravelMode = travelMode;
  clearRouteDrawing();
  updateRouteSelectionVisuals();
  els.routeDrivingMode.classList.toggle("is-active", travelMode === "DRIVING");
  els.routeTransitMode.classList.toggle("is-active", travelMode === "TRANSIT");
  els.routeDrivingMode.setAttribute("aria-pressed", String(travelMode === "DRIVING"));
  els.routeTransitMode.setAttribute("aria-pressed", String(travelMode === "TRANSIT"));
  renderRoutePlanner(true);
}

function clearRoutePolylines() {
  state.routePolylines.forEach((polyline) => polyline.setMap(null));
  state.routePolylines = [];
}

function clearRouteDrawing() {
  clearRoutePolylines();
  state.routeDisplayIds = [];
  clearTransitDetails();
}

function clearRouteSelection() {
  clearRouteDrawing();
  state.routePlaceIds = [];
  state.routeStartId = null;
  state.routeDestinationId = null;
  state.routeEditTarget = null;
  state.routeCustomMarkers.forEach((marker) => { marker.map = null; });
  state.routeCustomMarkers.clear();
  state.routeCustomPlaces.clear();
  state.currentRoutePlaceId = null;
  updateRouteSelectionVisuals();
  renderRoutePlanner(true);
}

function updateCustomRouteMarkers(visualIds) {
  state.routeCustomMarkers.forEach((marker) => { marker.map = null; });
  state.routeCustomMarkers.clear();
  visualIds.forEach((id, index) => {
    const place = state.routeCustomPlaces.get(id);
    if (!place || !state.AdvancedMarkerElement || !state.map) return;
    const pin = document.createElement("div");
    pin.className = "map-pin is-route-selected custom-route-pin";
    const glyph = document.createElement("span");
    glyph.textContent = String(index + 1);
    pin.appendChild(glyph);
    const marker = new state.AdvancedMarkerElement({
      map: state.map,
      position: { lat: place.latitude, lng: place.longitude },
      title: place.label,
      content: pin,
      zIndex: 1100,
    });
    state.routeCustomMarkers.set(id, marker);
  });
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

function noRouteError(travelMode, allPlaces = false) {
  const error = new Error(`선택한 장소를 ${allPlaces ? "모두 " : ""}연결하는 ${getTravelModeLabel(travelMode)} 경로가 없습니다.`);
  error.code = "NO_ROUTE";
  return error;
}

async function findOptimalOpenRoute(places, travelMode) {
  if (places.length <= 2) return places;
  const locations = places.map(routeLocation);
  const { matrix } = await state.RouteMatrix.computeRouteMatrix({
    origins: locations,
    destinations: locations,
    travelMode,
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
  best[1][0] = 0;
  for (let mask = 1; mask < stateCount; mask += 1) {
    for (let last = 0; last < size; last += 1) {
      const current = best[mask][last];
      if (!Number.isFinite(current)) continue;
      const visitedAllVia = (mask & ((1 << (size - 1)) - 1)) === ((1 << (size - 1)) - 1);
      for (let next = 1; next < size; next += 1) {
        if (mask & (1 << next)) continue;
        if (next === size - 1 && !visitedAllVia) continue;
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
  let last = size - 1;
  const lowest = best[fullMask][last];
  if (last < 0 || !Number.isFinite(lowest)) throw noRouteError(travelMode, true);
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

function formatTransitTime(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", { hour: "numeric", minute: "2-digit" }).format(date);
}

function getTransitVehicleLabel(vehicle) {
  const labels = {
    BUS: "버스",
    SUBWAY: "지하철",
    HEAVY_RAIL: "기차",
    COMMUTER_TRAIN: "광역철도",
    RAIL: "철도",
    LIGHT_RAIL: "경전철",
    TRAM: "트램",
    MONORAIL: "모노레일",
    HIGH_SPEED_TRAIN: "고속철도",
    LONG_DISTANCE_TRAIN: "장거리 열차",
    FERRY: "여객선",
    CABLE_CAR: "케이블카",
    GONDOLA_LIFT: "곤돌라",
    FUNICULAR: "푸니쿨라",
  };
  return labels[String(vehicle?.vehicleType || "").toUpperCase()] || vehicle?.name || "대중교통";
}

function transitStepView(step) {
  const transit = step.transitDetails;
  const mode = String(step.travelMode || "").toUpperCase();
  const duration = Number.isFinite(step.staticDurationMillis)
    ? formatRouteDuration(step.staticDurationMillis)
    : step.localizedValues?.staticDuration || "";
  const distance = step.localizedValues?.distance
    || (Number.isFinite(step.distanceMeters) ? formatRouteDistance(step.distanceMeters) : "");
  if (transit) {
    const line = transit.transitLine;
    const vehicleLabel = getTransitVehicleLabel(line?.vehicle);
    const lineName = line?.shortName || line?.name || transit.tripShortText || "";
    const agencyNames = (line?.agencies || []).map((agency) => agency.name).filter(Boolean).join(", ");
    const departure = transit.departureStop?.name || "승차 정류장";
    const arrival = transit.arrivalStop?.name || "하차 정류장";
    const departureTime = formatTransitTime(transit.departureTime);
    const arrivalTime = formatTransitTime(transit.arrivalTime);
    const meta = [
      transit.headsign ? `${transit.headsign} 방면` : "",
      Number.isFinite(transit.stopCount) && transit.stopCount > 0 ? `${transit.stopCount}개 정류장` : "",
      departureTime && arrivalTime ? `${departureTime} 출발 · ${arrivalTime} 도착` : departureTime ? `${departureTime} 출발` : "",
      Number.isFinite(transit.headwayMillis) && transit.headwayMillis > 0
        ? `약 ${formatRouteDuration(transit.headwayMillis)} 간격`
        : "",
      duration,
      agencyNames,
    ].filter(Boolean);
    return {
      type: "transit",
      icon: vehicleLabel === "버스" ? "🚌" : vehicleLabel.includes("지하철") || vehicleLabel.includes("철도") || vehicleLabel.includes("열차") || vehicleLabel === "기차" ? "🚇" : "🚎",
      title: [vehicleLabel, lineName].filter(Boolean).join(" "),
      description: `${departure}에서 승차 → ${arrival}에서 하차`,
      meta: meta.join(" · "),
    };
  }
  if (mode === "WALKING") {
    return {
      type: "walking",
      icon: "🚶",
      title: "도보 이동",
      description: step.instructions || "다음 승차 지점까지 걸어서 이동",
      meta: [distance, duration].filter(Boolean).join(" · "),
    };
  }
  return {
    type: "other",
    icon: "→",
    title: step.instructions || "이동",
    description: "다음 구간으로 이동",
    meta: [distance, duration].filter(Boolean).join(" · "),
  };
}

function buildTransitItinerary(routes, places) {
  return routes.map((route, index) => ({
    from: places[index]?.label || `출발지 ${index + 1}`,
    to: places[index + 1]?.label || `도착지 ${index + 2}`,
    steps: (route.legs || []).flatMap((leg) => leg.steps || []).map(transitStepView),
  }));
}

function clearTransitDetails() {
  state.transitItinerary = null;
  els.routeDetailsButton.hidden = true;
  if (els.transitDialog.open) els.transitDialog.close();
  els.transitItinerary.replaceChildren();
}

function renderTransitDialog(summary) {
  const itinerary = state.transitItinerary || [];
  els.transitSummary.textContent = summary;
  els.transitItinerary.replaceChildren();
  itinerary.forEach((leg, legIndex) => {
    const section = document.createElement("section");
    section.className = "transit-leg";
    const header = document.createElement("div");
    header.className = "transit-leg-header";
    const number = document.createElement("span");
    number.textContent = String(legIndex + 1);
    const title = document.createElement("strong");
    title.textContent = `${leg.from} → ${leg.to}`;
    header.append(number, title);
    section.appendChild(header);
    if (!leg.steps.length) {
      const empty = document.createElement("p");
      empty.className = "transit-empty";
      empty.textContent = "이 구간은 상세 승하차 정보가 제공되지 않았습니다.";
      section.appendChild(empty);
    } else {
      const list = document.createElement("ol");
      list.className = "transit-step-list";
      leg.steps.forEach((step) => {
        const item = document.createElement("li");
        item.className = `transit-step is-${step.type}`;
        const icon = document.createElement("span");
        icon.className = "transit-step-icon";
        icon.textContent = step.icon;
        const copy = document.createElement("div");
        copy.className = "transit-step-copy";
        const heading = document.createElement("strong");
        heading.textContent = step.title;
        const description = document.createElement("p");
        description.textContent = step.description;
        copy.append(heading, description);
        if (step.meta) {
          const meta = document.createElement("small");
          meta.textContent = step.meta;
          copy.appendChild(meta);
        }
        item.append(icon, copy);
        list.appendChild(item);
      });
      section.appendChild(list);
    }
    els.transitItinerary.appendChild(section);
  });
}

function openTransitDialog() {
  if (!state.transitItinerary?.length) return;
  if (!els.transitDialog.open) els.transitDialog.showModal();
}

async function computeRouteSegment(origin, destination, travelMode) {
  const fields = ["path", "viewport", "distanceMeters", "durationMillis"];
  if (travelMode === "TRANSIT") fields.push("legs");
  const { routes = [] } = await state.Route.computeRoutes({
    origin,
    destination,
    travelMode,
    fields,
  });
  if (!routes.length) throw noRouteError(travelMode);
  return routes[0];
}

async function drawRoute(places, travelMode) {
  const locations = places.map(routeLocation);
  let routes;
  if (travelMode === "TRANSIT") {
    routes = [];
    for (let index = 0; index < locations.length - 1; index += 1) {
      routes.push(await computeRouteSegment(locations[index], locations[index + 1], travelMode));
    }
  } else {
    const request = {
      origin: locations[0],
      destination: locations.at(-1),
      travelMode,
      fields: ["path", "viewport", "distanceMeters", "durationMillis"],
    };
    if (locations.length > 2) request.intermediates = locations.slice(1, -1).map((location) => ({ location }));
    const { routes: computedRoutes = [] } = await state.Route.computeRoutes(request);
    if (!computedRoutes.length) throw noRouteError(travelMode);
    routes = [computedRoutes[0]];
  }
  clearRoutePolylines();
  const bounds = new google.maps.LatLngBounds();
  let pathPointCount = 0;
  let distanceMeters = 0;
  let durationMillis = 0;
  state.routePolylines = routes.flatMap((route) => {
    distanceMeters += Number(route.distanceMeters) || 0;
    durationMillis += Number(route.durationMillis) || 0;
    route.path?.forEach((point) => {
      bounds.extend(point);
      pathPointCount += 1;
    });
    return route.createPolylines();
  });
  state.routePolylines.forEach((polyline) => {
    polyline.setOptions({
      strokeColor: travelMode === "TRANSIT" ? "#7c4dcc" : "#2d6cdf",
      strokeOpacity: .9,
      strokeWeight: 6,
      zIndex: 20,
    });
    polyline.setMap(state.map);
  });
  if (pathPointCount) state.map.fitBounds(bounds, 70);
  else if (routes[0]?.viewport) state.map.fitBounds(routes[0].viewport, 70);
  return {
    distanceMeters,
    durationMillis,
    transitItinerary: travelMode === "TRANSIT" ? buildTransitItinerary(routes, places) : null,
  };
}

function isSouthKoreaPlace(place) {
  if (place.country_code === "KR") return true;
  return place.latitude >= 33 && place.latitude <= 39.5 && place.longitude >= 124 && place.longitude <= 132;
}

function openKakaoMapDrivingRoute(places) {
  if (places.length > 7) return false;
  const routePath = places.map((place) => [
    encodeURIComponent(place.label || "장소"),
    place.latitude,
    place.longitude,
  ].join(",")).join("/");
  window.open(`https://map.kakao.com/link/by/car/${routePath}`, "_blank", "noopener,noreferrer");
  return true;
}

async function drawDomesticDrivingRoute(places, mode) {
  if (!state.config.kakao_driving_configured) {
    const opened = mode === "ordered" && openKakaoMapDrivingRoute(places);
    const error = new Error(opened
      ? "카카오맵 새 창에서 자동차 길찾기를 열었습니다. 앱 지도에 경로선을 표시하려면 카카오 REST API 키를 설정해 주세요."
      : "앱 지도에서 국내 자동차 길찾기를 사용하려면 카카오 REST API 키를 설정해 주세요.");
    error.code = "KAKAO_NOT_CONFIGURED";
    throw error;
  }
  const { route } = await api("/api/routes/driving", {
    method: "POST",
    body: JSON.stringify({
      optimize: mode === "optimal",
      points: places.map((place) => ({
        latitude: place.latitude,
        longitude: place.longitude,
        label: place.label,
      })),
    }),
  });
  if (!Array.isArray(route?.path) || route.path.length < 2 || !Array.isArray(route.order)) {
    throw new Error("국내 자동차 경로 응답을 확인하지 못했습니다.");
  }
  const orderedPlaces = route.order.map((index) => places[index]).filter(Boolean);
  if (orderedPlaces.length !== places.length) throw new Error("국내 자동차 경로 순서를 확인하지 못했습니다.");
  const path = route.path.map(([lat, lng]) => ({ lat: Number(lat), lng: Number(lng) }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  if (path.length < 2) throw new Error("국내 자동차 경로 선을 확인하지 못했습니다.");
  clearRoutePolylines();
  const polyline = new google.maps.Polyline({
    path,
    strokeColor: "#1565c0",
    strokeOpacity: .94,
    strokeWeight: 6,
    zIndex: 20,
    map: state.map,
  });
  state.routePolylines = [polyline];
  const bounds = new google.maps.LatLngBounds();
  path.forEach((point) => bounds.extend(point));
  state.map.fitBounds(bounds, 70);
  return {
    orderedPlaces,
    provider: "kakao",
    distanceMeters: Number(route.distanceMeters),
    durationMillis: Number(route.durationMillis),
  };
}

async function calculateSelectedRoute(mode) {
  const selected = getSelectedRoutePlaces();
  if (selected.length < 2 || state.routeStartId === null || state.routeDestinationId === null) {
    toast("출발지와 도착지를 먼저 지정해 주세요.", true);
    return;
  }
  if (mode === "optimal" && selected.length > 10) {
    toast("경유지 최적화는 최대 10곳까지 지원합니다.", true);
    return;
  }
  clearTransitDetails();
  els.routeOrderedButton.disabled = true;
  els.routeOptimalButton.disabled = true;
  els.routeDrivingMode.disabled = true;
  els.routeTransitMode.disabled = true;
  els.routeStatus.classList.add("is-loading");
  const travelMode = state.routeTravelMode;
  const travelModeLabel = getTravelModeLabel(travelMode);
  els.routeStatus.textContent = mode === "optimal"
    ? `${travelModeLabel} 이동시간을 비교하는 중…`
    : `선택한 순서로 ${travelModeLabel} 경로를 계산하는 중…`;
  try {
    const useDomesticDriving = travelMode === "DRIVING" && selected.every(isSouthKoreaPlace);
    let ordered;
    let route;
    if (useDomesticDriving) {
      route = await drawDomesticDrivingRoute(selected, mode);
      ordered = route.orderedPlaces;
    } else {
      await ensureRoutesLibrary();
      ordered = mode === "optimal" ? await findOptimalOpenRoute(selected, travelMode) : selected;
      route = await drawRoute(ordered, travelMode);
    }
    state.routeDisplayIds = ordered.map((place) => place.id);
    updateRouteSelectionVisuals();
    renderRoutePlanner(false);
    const label = mode === "optimal" ? "경유지 최적 경로" : "지정 순서 경로";
    const providerLabel = route.provider === "kakao" ? "자동차(카카오내비)" : travelModeLabel;
    const routeSummary = `${providerLabel} · ${label} · ${formatRouteDistance(route.distanceMeters)} · 약 ${formatRouteDuration(route.durationMillis)}`;
    els.routeStatus.textContent = routeSummary;
    if (travelMode === "TRANSIT" && route.transitItinerary?.length) {
      state.transitItinerary = route.transitItinerary;
      els.routeDetailsButton.hidden = false;
      renderTransitDialog(routeSummary);
      openTransitDialog();
    }
    toast(`${providerLabel} ${label}를 지도에 표시했습니다.`);
  } catch (error) {
    console.error(error);
    const isDomesticProviderError = error.code === "KAKAO_NOT_CONFIGURED" || /카카오|국내 자동차/.test(error.message);
    let message = error.code === "NO_ROUTE" || isDomesticProviderError ? error.message : describeRouteError(error);
    if (error.code === "NO_ROUTE" && travelMode === "DRIVING") {
      message += " 국내 장소는 자동차 경로가 제공되지 않을 수 있으니 대중교통을 선택해 보세요.";
    }
    els.routeStatus.textContent = message;
    toast(message, true);
  } finally {
    els.routeStatus.classList.remove("is-loading");
    els.routeDrivingMode.disabled = false;
    els.routeTransitMode.disabled = false;
    const hasEnough = state.routePlaceIds.length >= 2 && state.routeStartId !== null && state.routeDestinationId !== null;
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

function revealMapForMobile() {
  if (window.innerWidth > 900) return;
  els.mapStage.scrollIntoView({ behavior: "smooth", block: "start" });
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
  revealMapForMobile();
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
      removeRoutePlaceId(id);
      renderRoutePlanner(true);
    }
    state.activePlaceId = null;
    if (state.activeDetailPlaceId === id) closePlaceDetail();
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
  resetCategoryForm();
  renderCategories();
  els.categoryDialog.showModal();
  els.categoryName.focus();
}

function beginCategoryEdit(category) {
  els.categoryId.value = String(category.id);
  els.categoryName.value = category.name;
  els.categoryColor.value = category.color;
  els.categorySubmit.textContent = "변경 저장";
  els.categoryEditCancel.hidden = false;
  els.categoryName.focus();
}

function resetCategoryForm() {
  els.categoryForm.reset();
  els.categoryId.value = "";
  els.categoryColor.value = "#7B5CFA";
  els.categorySubmit.textContent = "추가";
  els.categoryEditCancel.hidden = true;
}

async function saveCategory(event) {
  event.preventDefault();
  const categoryId = els.categoryId.value;
  try {
    const result = await api(categoryId ? `/api/categories/${categoryId}` : "/api/categories", {
      method: categoryId ? "PUT" : "POST",
      body: JSON.stringify({ name: els.categoryName.value, color: els.categoryColor.value }),
    });
    if (categoryId) {
      const index = state.categories.findIndex((category) => category.id === result.category.id);
      if (index >= 0) state.categories[index] = result.category;
      state.places.forEach((place) => {
        if (place.category_id !== result.category.id) return;
        place.category_name = result.category.name;
        place.category_color = result.category.color;
      });
    } else {
      state.categories.push(result.category);
    }
    renderCategories();
    renderFilters();
    applyFilters(false);
    resetCategoryForm();
    toast(categoryId ? "카테고리를 수정했습니다." : "카테고리를 추가했습니다.");
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
    renderFilters();
    resetCategoryForm();
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

if (window.location.protocol === "http:" && !["localhost", "127.0.0.1"].includes(window.location.hostname)) {
  window.location.replace(`https://${window.location.host}${window.location.pathname}${window.location.search}${window.location.hash}`);
} else {
  bootstrap();
}
