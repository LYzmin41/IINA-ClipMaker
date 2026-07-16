const POSITION_DISPLAY_SAFETY_LAG_SECONDS = 0.05;
const PREVIEW_BEFORE_OUT_SECONDS = 5;
const DRAG_PIXELS_PER_FRAME = 8;
const DRAG_START_THRESHOLD_PX = 4;
const HORIZONTAL_WHEEL_MIN_DELTA = 2;
const HORIZONTAL_WHEEL_PIXELS_PER_STEP = 24;
const TIMECODE_SENSITIVITY_DEFAULT_LEVEL = 3;
const TIMECODE_SCROLL_PIXELS_PER_STEP = {
  1: 36,
  2: 30,
  3: HORIZONTAL_WHEEL_PIXELS_PER_STEP,
  4: 18,
  5: 12,
};
const TIMECODE_DRAG_PIXELS_PER_FRAME = {
  1: 14,
  2: 11,
  3: DRAG_PIXELS_PER_FRAME,
  4: 5,
  5: 3,
};
const WHEEL_ACCUMULATOR_IDLE_RESET_MS = 300;
const WHEEL_GESTURE_DIRECTION_THRESHOLD_PX = 4;
const WHEEL_GESTURE_DIRECTION_DOMINANCE_RATIO = 1.15;
const WHEEL_GESTURE_END_MS = 120;
const MARK_WHEEL_DELTA_DIRECTION = -1;
const MARK_UNDO_VISIBLE_MS = 4200;
const REORDER_DRAG_START_THRESHOLD_PX = 5;
const DROP_ZONE_TOLERANCE_PX = 12;
const AUTO_SCROLL_EDGE_PX = 32;
const AUTO_SCROLL_MAX_PX_PER_FRAME = 10;
const NAVIGATION_HISTORY_MAX_ENTRIES = 20;
const NAVIGATION_HISTORY_DUPLICATE_TOLERANCE_SECONDS = 0.25;
const CLIP_SINGLE_CLICK_DELAY_MS = 280;
const TITLE_BUBBLE_SHOW_DELAY_MS = 200;
const TITLE_BUBBLE_HIDE_DELAY_MS = 200;
const TITLE_BUBBLE_FADE_MS = 140;
const TITLE_COPY_TOAST_VISIBLE_MS = 1000;
const TITLE_COPY_QUICK_CLICK_MAX_MS = 220;
const TITLE_COPY_SINGLE_CLICK_DELAY_MS = 320;
const TITLE_COPY_DRAG_THRESHOLD_PX = 4;
const HEADER_INFO_SHOW_DELAY_MS = 200;
const STABLE_HOVER_EXIT_DELAY_MS = 220;
const CLIP_TEXT_MAX_LENGTH = 80;
const TIMECODE_EDIT_MAX_DIGITS = 6;
const TIMECODE_SUFFIX_APPEAR_DELAY_MS = 500;
const TIMECODE_SUFFIX_DISAPPEAR_DELAY_MS = 1400;
const TIMECODE_EDIT_TRANSITION_MS = 180;
const TIMECODE_SUFFIX_DEFINITIONS = Object.freeze([
  { key: "seconds", label: "s", start: 0 },
  { key: "minutes", label: "m", start: 2 },
  { key: "hours", label: "h", start: 4 },
]);
const SELECTED_LABEL_TEXT = "selected";
const SEARCH_COLLAPSED_WIDTH_PX = 24;
const SEARCH_MIN_EXPANDED_WIDTH_PX = 120;
const SEARCH_PREFERRED_EXPANDED_WIDTH_PX = 240;
const SEARCH_SOLO_EXPANDED_WIDTH_RATIO = 0.72;
const TOOLBAR_EXPANSION_MS = 170;
const TOOLBAR_SAFETY_GAP_PX = 10;
const SELECTION_ACTIONS_ENTRY_MS = 420;
const SELECTION_ACTIONS_EXIT_MS = 280;
const SELECTION_SUMMARY_ENTRY_MS = 420;
const SELECTION_SUMMARY_EXIT_MS = 280;
const SELECTION_ACTIONS_SEARCH_RESERVED_WIDTH_PX = 104;
const CLIP_SORT_ICON_ANIMATION_MS = 170;
const DELETE_CONFIRM_GAP_PX = 16;
const DELETE_CONFIRM_VIEWPORT_MARGIN_PX = 8;
const DELETE_CONFIRM_SCROLL_DISMISS_RATIO = 1 / 3;
const CLEAR_LIST_CONFIRM_SCROLL_DISMISS_RATIO = 0.2;
const CLEAR_LIST_CONFIRM_MIN_SCROLL_PX = 24;
const CLEAR_LIST_TRIGGER_VISIBLE_DISMISS_RATIO = 0.4;
const DELETE_CONFIRM_HIDE_DELAY_MS = 300;
const CLIP_SORT_MODES = ["manual", "creation", "name", "duration", "in", "out"];
const CLIP_SORT_DIRECTIONS = ["ascending", "descending"];
const CLIP_SORT_DEFAULT_DIRECTIONS = Object.freeze({
  manual: "ascending",
  creation: "descending",
  name: "ascending",
  duration: "ascending",
  in: "ascending",
  out: "ascending",
});
let rpc = null;
let latestState = null;
let titleMeasureTimer = null;
let titleBubbleShowTimer = null;
let titleBubbleHideTimer = null;
let titleCopyToastTimer = null;
let titleCopyClickTimer = null;
let titleCopyInteraction = null;
let headerInfoShowTimer = null;
let titleResizeObserver = null;
let currentVideoTitle = "";
let titleBubbleEligible = false;
let titleBubbleTitleHover = false;
let titleBubbleBubbleHover = false;
let titleBubbleFocus = false;
let titleBubbleReady = false;
let titleCopyToastVisible = false;
let titleTextSelectionActive = false;
let headerInfoHover = false;
let smoothPositionTimer = null;
let smoothPositionTickMs = null;
let lastRealPositionSeconds = null;
let lastSyncWallClockMs = 0;
let smoothPositionPlaying = false;
let smoothPlaybackRate = 1;
let smoothDisplayFps = 30;
let smoothDurationSeconds = null;
let lastPositionText = "";
let lastPositionTitle = "";
let isShiftPreviewMode = false;
let previewRequestInFlight = false;
let navigationHistory = [];
let navigationHistoryFileId = null;
let navigationRestoreInFlight = false;
let editingMarkName = null;
let markDragState = null;
let markWheelAccumulator = { in: 0, out: 0 };
let markWheelActiveMark = null;
let markWheelIdleTimer = null;
let markWheelFileId = null;
let markWheelGestureDirection = null;
let markWheelGestureAccumulatedX = 0;
let markWheelGestureAccumulatedY = 0;
let markWheelGestureEndTimer = null;
let markWheelGestureMarkName = null;
let lastTimecodeScrollSensitivity = TIMECODE_SENSITIVITY_DEFAULT_LEVEL;
const deleteConfirmTimers = new Map();
let activeDeleteConfirmation = null;
let deleteConfirmationScrollState = null;
let deleteConfirmationScrollFrame = null;
let editingClipId = null;
let editingClipOriginalName = "";
let clipReorderState = null;
let clipDragFrame = null;
let clipDragAutoScrollFrame = null;
let suppressNextClipClickId = null;
let pendingClipClickTimer = null;
let pendingClipClickId = null;
let clipSearchExpanded = false;
let clipSearchTransitionState = "collapsed";
let clipSearchTransitionTimer = null;
let clipSearchTargetWidthPx = SEARCH_COLLAPSED_WIDTH_PX;
let clipSearchOutsidePressPending = false;
let clipSearchOutsidePressExempt = false;
let clipSearchOutsidePressTimer = null;
let clipSearchDraft = "";
let activeClipSearchQuery = "";
let clipSortMenuOpen = false;
let clipSortIconAnimationTimer = null;
let exportContextMenuOpen = false;
let exportContextMenuHideTimer = null;
let exportContextMenuTrigger = null;
let lastSyncedClipViewSignature = "";
let selectedLabelAnimationTimer = null;
let selectedLabelHidden = false;
let selectionSummaryAnimationTimer = null;
let renderedSelectedCount = 0;
let selectionActionsAnimationTimer = null;
let activeTimecodeEdit = null;
let activeTimecodeTransition = null;
let markEditUndo = null;
let markEditUndoTimer = null;
let suppressNextMarkClick = null;
const stableHoverTimers = new WeakMap();

function $(id) {
  return document.getElementById(id);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function eventPoint(event) {
  if (!event || typeof event.clientX !== "number" || typeof event.clientY !== "number") return null;
  return { x: event.clientX, y: event.clientY };
}

function pointIsInsideElement(element, point, padding = 2) {
  if (!element || !point) return false;
  const rect = element.getBoundingClientRect();
  return (
    point.x >= rect.left - padding &&
    point.x <= rect.right + padding &&
    point.y >= rect.top - padding &&
    point.y <= rect.bottom + padding
  );
}

function setStableHover(element, className, enabled, shouldKeep) {
  if (!element) return;
  const timer = stableHoverTimers.get(element);
  if (timer !== undefined) {
    window.clearTimeout(timer);
    stableHoverTimers.delete(element);
  }
  if (enabled) {
    element.classList.add(className);
    return;
  }
  stableHoverTimers.set(element, window.setTimeout(() => {
    stableHoverTimers.delete(element);
    if (typeof shouldKeep === "function" && shouldKeep()) return;
    element.classList.remove(className);
  }, STABLE_HOVER_EXIT_DELAY_MS));
}

function bindStableHover(element, className) {
  if (!element) return;
  let lastPoint = null;
  const updatePoint = (event) => {
    const point = eventPoint(event);
    if (point) lastPoint = point;
  };
  const shouldKeep = () => pointIsInsideElement(element, lastPoint, 3);
  const show = (event) => {
    updatePoint(event);
    setStableHover(element, className, true);
  };
  const hide = (event) => {
    updatePoint(event);
    if (event && event.relatedTarget && element.contains(event.relatedTarget)) return;
    if (event && event.type === "focusout") {
      setStableHover(element, className, false);
      return;
    }
    if (shouldKeep()) return;
    setStableHover(element, className, false, shouldKeep);
  };
  element.addEventListener("mouseenter", show);
  element.addEventListener("mouseover", show);
  element.addEventListener("mousemove", show);
  element.addEventListener("mouseleave", hide);
  element.addEventListener("mouseout", hide);
  element.addEventListener("focusin", show);
  element.addEventListener("focusout", hide);
}

function selectedClipCountFromState(state) {
  return state && Array.isArray(state.selectedClipIds) ? state.selectedClipIds.length : 0;
}

function selectedClipIdsFromLatestState() {
  return selectedIdsFromState(latestState);
}

function clearPendingClipSelection() {
  if (pendingClipClickTimer !== null) {
    window.clearTimeout(pendingClipClickTimer);
    pendingClipClickTimer = null;
  }
  pendingClipClickId = null;
}

function scheduleClipSelectionToggle(clipId) {
  clearPendingClipSelection();
  pendingClipClickId = clipId;
  pendingClipClickTimer = window.setTimeout(() => {
    const id = pendingClipClickId;
    pendingClipClickTimer = null;
    pendingClipClickId = null;
    if (clipReorderState || suppressNextClipClickId === id) return;
    callAction(() => rpc.$toggleClipSelection(id));
  }, CLIP_SINGLE_CLICK_DELAY_MS);
}

function clipDisplayName(clip, index) {
  return String((clip && clip.name) || `Clip ${pad(index + 1, 2)}`);
}

function normalizeClipSearchText(value) {
  return String(value || "")
    .normalize("NFC")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

function isClipSearchActive() {
  return normalizeClipSearchText(activeClipSearchQuery).length > 0;
}

function clipSearchTokens(query) {
  return normalizeClipSearchText(query).split(/\s+/).filter(Boolean);
}

function clipMatchesSearch(clip, index, query) {
  const tokens = clipSearchTokens(query);
  if (!tokens.length) return true;
  const name = normalizeClipSearchText(clipDisplayName(clip, index));
  return tokens.every((token) => name.includes(token));
}

function filteredClipEntries(clips) {
  const items = Array.isArray(clips) ? clips : [];
  const query = activeClipSearchQuery;
  return items
    .map((clip, index) => ({ type: "clip", clip, fullIndex: index }))
    .filter((entry) => clipMatchesSearch(entry.clip, entry.fullIndex, query));
}

function normalizeClipSortMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  return CLIP_SORT_MODES.includes(mode) ? mode : "manual";
}

function normalizeClipSortDirection(value) {
  const direction = String(value || "").trim().toLowerCase();
  return CLIP_SORT_DIRECTIONS.includes(direction) ? direction : "ascending";
}

function currentClipSortMode() {
  return normalizeClipSortMode(latestState && latestState.clipSortMode);
}

function currentClipSortDirection() {
  return normalizeClipSortDirection(latestState && latestState.clipSortDirection);
}

function compareStableClipIds(left, right) {
  const leftNumber = Number(left && left.id);
  const rightNumber = Number(right && right.id);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }
  return String(left && left.id || "").localeCompare(String(right && right.id || ""));
}

function compareClipEntryField(left, right, mode) {
  if (mode === "name") {
    return clipDisplayName(left.clip, left.fullIndex).localeCompare(
      clipDisplayName(right.clip, right.fullIndex),
      undefined,
      { numeric: true, sensitivity: "base" }
    );
  }

  const valueForEntry = (entry) => {
    if (mode === "creation") return Number(entry.clip && entry.clip.creationSequence);
    if (mode === "duration") {
      const stored = Number(entry.clip && entry.clip.duration);
      if (Number.isFinite(stored)) return stored;
      return Number(entry.clip && entry.clip.outPoint) - Number(entry.clip && entry.clip.inPoint);
    }
    if (mode === "in") return Number(entry.clip && entry.clip.inPoint);
    if (mode === "out") return Number(entry.clip && entry.clip.outPoint);
    return 0;
  };
  const leftValue = valueForEntry(left);
  const rightValue = valueForEntry(right);
  const normalizedLeft = Number.isFinite(leftValue) ? leftValue : Number.POSITIVE_INFINITY;
  const normalizedRight = Number.isFinite(rightValue) ? rightValue : Number.POSITIVE_INFINITY;
  return normalizedLeft === normalizedRight ? 0 : normalizedLeft < normalizedRight ? -1 : 1;
}

function sortFilteredClipEntries(entries, mode, direction) {
  const items = Array.isArray(entries) ? entries.slice() : [];
  const normalizedMode = normalizeClipSortMode(mode);
  const normalizedDirection = normalizeClipSortDirection(direction);
  if (normalizedMode === "manual") {
    return normalizedDirection === "descending" ? items.reverse() : items;
  }

  const multiplier = normalizedDirection === "descending" ? -1 : 1;
  return items.sort((left, right) => {
    const fieldOrder = compareClipEntryField(left, right, normalizedMode);
    if (fieldOrder !== 0) return fieldOrder * multiplier;
    const creationOrder = Number(left.clip && left.clip.creationSequence) - Number(right.clip && right.clip.creationSequence);
    if (Number.isFinite(creationOrder) && creationOrder !== 0) return creationOrder;
    const idOrder = compareStableClipIds(left.clip, right.clip);
    if (idOrder !== 0) return idOrder;
    return left.fullIndex - right.fullIndex;
  });
}

function displayedClipEntries(clips) {
  return sortFilteredClipEntries(
    filteredClipEntries(clips),
    currentClipSortMode(),
    currentClipSortDirection()
  );
}

function displayedClipIds(clips) {
  return displayedClipEntries(clips).map((entry) => entry.clip.id);
}

function syncDisplayedClipOrder(clips) {
  if (!rpc || typeof rpc.$setClipViewOrder !== "function") return;
  const orderedIds = displayedClipIds(clips);
  const sourceFilePath = navigationFileIdFromState(latestState);
  const signature = [
    sourceFilePath,
    currentClipSortMode(),
    currentClipSortDirection(),
    normalizeClipSearchText(activeClipSearchQuery),
    orderedIds.join(","),
  ].join("|");
  if (signature === lastSyncedClipViewSignature) return;
  lastSyncedClipViewSignature = signature;
  rpc.$setClipViewOrder(orderedIds, sourceFilePath).catch((error) => {
    if (lastSyncedClipViewSignature === signature) lastSyncedClipViewSignature = "";
    console.error("[ClipMaker UI] visible clip order sync failed", error);
  });
}

function clipReorderIsAllowed() {
  return currentClipSortMode() === "manual"
    && currentClipSortDirection() === "ascending"
    && !isClipSearchActive();
}

function clipSortMenuItems() {
  const menu = $("clipSortMenu");
  return menu ? Array.from(menu.querySelectorAll("[role='menuitemradio'][data-sort-mode]")) : [];
}

function updateClipSortControl(state) {
  const button = $("clipSortButton");
  const mode = normalizeClipSortMode(state && state.clipSortMode);
  const direction = normalizeClipSortDirection(state && state.clipSortDirection);
  if (button) {
    const previousDirection = button.dataset.sortDirection;
    const directionChanged = CLIP_SORT_DIRECTIONS.includes(previousDirection)
      && previousDirection !== direction;
    button.dataset.sortDirection = direction;
    button.classList.toggle("is-active", mode !== "manual" || direction !== "ascending");
    button.setAttribute("aria-expanded", clipSortMenuOpen ? "true" : "false");
    button.setAttribute("aria-label", `Sort clips, ${direction}`);
    if (directionChanged) {
      clearTimeout(clipSortIconAnimationTimer);
      button.classList.remove("is-changing-to-ascending", "is-changing-to-descending");
      void button.offsetWidth;
      const animationClass = `is-changing-to-${direction}`;
      button.classList.add(animationClass);
      clipSortIconAnimationTimer = setTimeout(() => {
        button.classList.remove(animationClass);
        clipSortIconAnimationTimer = null;
      }, CLIP_SORT_ICON_ANIMATION_MS + 20);
    }
  }
  const items = clipSortMenuItems();
  const menuMode = mode === "manual" ? "creation" : mode;
  const activeIndex = items.findIndex((item) => item.dataset.sortMode === menuMode);
  items.forEach((item, index) => {
    const checked = index === activeIndex;
    item.setAttribute("aria-checked", checked ? "true" : "false");
    item.tabIndex = checked || (activeIndex < 0 && index === 0) ? 0 : -1;
  });
}

function closeClipSortMenu(restoreFocus) {
  const menu = $("clipSortMenu");
  const button = $("clipSortButton");
  clipSortMenuOpen = false;
  if (menu) menu.hidden = true;
  if (button) button.setAttribute("aria-expanded", "false");
  if (restoreFocus && button) button.focus();
}

function openClipSortMenu(focusItem) {
  const menu = $("clipSortMenu");
  const button = $("clipSortButton");
  if (!menu || !button) return;
  clipSortMenuOpen = true;
  menu.hidden = false;
  button.setAttribute("aria-expanded", "true");
  updateClipSortControl(latestState);
  if (focusItem) {
    const items = clipSortMenuItems();
    const active = items.find((item) => item.getAttribute("aria-checked") === "true");
    (active || items[0] || button).focus();
  }
}

function requestClipSort(mode, direction) {
  const nextMode = normalizeClipSortMode(mode);
  const nextDirection = normalizeClipSortDirection(direction);
  if (latestState) {
    latestState.clipSortMode = nextMode;
    latestState.clipSortDirection = nextDirection;
    updateClipSortControl(latestState);
    renderClips(latestState.clips, currentDisplayFps());
  }
  callAction(() => rpc.$setClipSort(nextMode, nextDirection));
}

function reverseCurrentClipSortDirection() {
  const direction = currentClipSortDirection() === "ascending" ? "descending" : "ascending";
  requestClipSort(currentClipSortMode(), direction);
}

function selectClipSortMode(mode) {
  const nextMode = normalizeClipSortMode(mode);
  const direction = nextMode === currentClipSortMode()
    ? currentClipSortDirection() === "ascending" ? "descending" : "ascending"
    : CLIP_SORT_DEFAULT_DIRECTIONS[nextMode];
  closeClipSortMenu(true);
  requestClipSort(nextMode, direction);
}

function bindClipSortControl() {
  const control = $("clipSortControl");
  const button = $("clipSortButton");
  const menu = $("clipSortMenu");
  if (!control || !button || !menu) return;

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.shiftKey) {
      closeClipSortMenu(false);
      reverseCurrentClipSortDirection();
      return;
    }
    if (clipSortMenuOpen) closeClipSortMenu(true);
    else openClipSortMenu(false);
  });
  button.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    openClipSortMenu(true);
  });

  clipSortMenuItems().forEach((item) => {
    item.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      selectClipSortMode(item.dataset.sortMode);
    });
  });
  menu.addEventListener("keydown", (event) => {
    const items = clipSortMenuItems();
    const currentIndex = Math.max(0, items.indexOf(document.activeElement));
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeClipSortMenu(true);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const item = items[currentIndex];
      if (item) item.click();
      return;
    }
    let nextIndex = null;
    if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % items.length;
    if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + items.length) % items.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = items.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    items.forEach((item, index) => { item.tabIndex = index === nextIndex ? 0 : -1; });
    items[nextIndex].focus();
  });

  document.addEventListener("pointerdown", (event) => {
    if (!clipSortMenuOpen || control.contains(event.target)) return;
    closeClipSortMenu(true);
  }, true);
}

function sanitizeClipNameInput(value) {
  return String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CLIP_TEXT_MAX_LENGTH);
}

function sanitizeClipNameEditValue(value) {
  return String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {2,}/g, " ")
    .slice(0, CLIP_TEXT_MAX_LENGTH);
}

function sanitizeSearchEditValue(value) {
  return String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {2,}/g, " ")
    .slice(0, CLIP_TEXT_MAX_LENGTH);
}

function sanitizeSearchQuery(value) {
  return String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CLIP_TEXT_MAX_LENGTH);
}

function prefersReducedMotion() {
  return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

function measureSelectedLabelSlotWidth() {
  const slot = $("clipsSelectionLabelSlot");
  const label = $("clipsSelectedLabel");
  if (!slot || !label) return 0;
  const summary = $("clipsSelectionSummary");
  const summaryWasHidden = Boolean(summary && summary.hidden);
  const previousSummaryPosition = summary ? summary.style.position : "";
  const previousSummaryVisibility = summary ? summary.style.visibility : "";
  const previousSummaryPointerEvents = summary ? summary.style.pointerEvents : "";
  if (summaryWasHidden && summary) {
    summary.hidden = false;
    summary.style.position = "absolute";
    summary.style.visibility = "hidden";
    summary.style.pointerEvents = "none";
  }
  label.textContent = SELECTED_LABEL_TEXT;
  const width = Math.ceil(label.getBoundingClientRect().width || label.scrollWidth);
  if (summaryWasHidden && summary) {
    summary.hidden = true;
    summary.style.position = previousSummaryPosition;
    summary.style.visibility = previousSummaryVisibility;
    summary.style.pointerEvents = previousSummaryPointerEvents;
  }
  return width;
}

function syncSelectedLabelSlotWidth() {
  const slot = $("clipsSelectionLabelSlot");
  if (!slot) return 0;
  const width = measureSelectedLabelSlotWidth();
  slot.style.setProperty("--clips-selected-label-slot-width", `${width}px`);
  return width;
}

function setSelectedLabelSlotHidden(hidden, options = {}) {
  const slot = $("clipsSelectionLabelSlot");
  if (!slot) return;
  syncSelectedLabelSlotWidth();
  const shouldHide = Boolean(hidden);
  const durationMs = Math.max(0, options.durationMs === undefined ? TOOLBAR_EXPANSION_MS : Number(options.durationMs));
  const withoutMotion = Boolean(options.immediate) || prefersReducedMotion() || durationMs === 0;
  if (selectedLabelAnimationTimer !== null) {
    window.clearTimeout(selectedLabelAnimationTimer);
    selectedLabelAnimationTimer = null;
  }
  if (withoutMotion) {
    const previousTransition = slot.style.transition;
    slot.style.transition = "none";
    slot.classList.toggle("is-hidden", shouldHide);
    selectedLabelHidden = shouldHide;
    slot.offsetWidth;
    slot.style.transition = previousTransition;
    return;
  }
  slot.style.transitionDuration = `${durationMs}ms`;
  slot.classList.toggle("is-hidden", Boolean(hidden));
  selectedLabelHidden = shouldHide;
  selectedLabelAnimationTimer = window.setTimeout(() => {
    selectedLabelAnimationTimer = null;
    slot.style.transitionDuration = "";
  }, durationMs);
}

function animateSelectedLabelTo(targetCount, durationMs = TOOLBAR_EXPANSION_MS) {
  const target = clamp(Number(targetCount) || 0, 0, SELECTED_LABEL_TEXT.length);
  const shouldHide = target === 0;
  if (selectedLabelHidden === shouldHide && selectedLabelAnimationTimer === null) {
    setSelectedLabelSlotHidden(shouldHide, { immediate: true });
    return;
  }
  setSelectedLabelSlotHidden(shouldHide, { durationMs });
}

function clearSelectionSummaryAnimation() {
  const summary = $("clipsSelectionSummary");
  if (selectionSummaryAnimationTimer !== null) {
    window.clearTimeout(selectionSummaryAnimationTimer);
    selectionSummaryAnimationTimer = null;
  }
  if (summary) {
    summary.classList.remove("is-hiding", "is-showing");
    summary.style.animationDuration = "";
  }
}

function syncSelectionSummaryAnimationWidth(summary) {
  if (!summary) return 0;
  const rect = summary.getBoundingClientRect();
  const width = Math.ceil(Math.max(Number(summary.scrollWidth) || 0, Number(rect.width) || 0));
  summary.style.setProperty("--clips-selection-summary-width", `${width}px`);
  return width;
}

function setSelectionSummaryVisible(visible, options = {}) {
  const summary = $("clipsSelectionSummary");
  if (!summary) return;
  const shouldShow = Boolean(visible);
  const animated = Boolean(options.animate) && !prefersReducedMotion();
  const durationMs = Math.max(0, options.durationMs === undefined ? TOOLBAR_EXPANSION_MS : Number(options.durationMs));
  const activeAnimationTarget = summary.classList.contains("is-showing")
    ? true
    : summary.classList.contains("is-hiding")
      ? false
      : null;
  if (selectionSummaryAnimationTimer !== null && activeAnimationTarget === shouldShow) {
    summary.setAttribute("aria-hidden", shouldShow ? "false" : "true");
    return;
  }
  clearSelectionSummaryAnimation();
  if (shouldShow) {
    summary.hidden = false;
    summary.setAttribute("aria-hidden", "false");
    if (animated && durationMs > 0) {
      syncSelectionSummaryAnimationWidth(summary);
      summary.style.animationDuration = `${durationMs}ms`;
      summary.classList.add("is-showing");
      selectionSummaryAnimationTimer = window.setTimeout(() => {
        selectionSummaryAnimationTimer = null;
        summary.classList.remove("is-showing");
        summary.style.animationDuration = "";
      }, durationMs);
    }
    return;
  }
  if (summary.hidden) {
    summary.setAttribute("aria-hidden", "true");
    return;
  }
  if (!animated || durationMs === 0) {
    summary.hidden = true;
    summary.setAttribute("aria-hidden", "true");
    return;
  }
  syncSelectionSummaryAnimationWidth(summary);
  summary.style.animationDuration = `${durationMs}ms`;
  summary.classList.add("is-hiding");
  selectionSummaryAnimationTimer = window.setTimeout(() => {
    selectionSummaryAnimationTimer = null;
    summary.classList.remove("is-hiding");
    summary.style.animationDuration = "";
    summary.hidden = true;
    summary.setAttribute("aria-hidden", "true");
    const selectedNumber = $("clipsSelectedNumber");
    if (selectedNumber && renderedSelectedCount === 0) selectedNumber.textContent = "0";
  }, durationMs);
}

function isClipSearchTransitioning() {
  return clipSearchTransitionState === "expanding" || clipSearchTransitionState === "collapsing";
}

function syncClipSearchControl() {
  const control = $("clipSearchControl");
  const input = $("clipSearchInput");
  const selectionActions = $("selectionActions");
  if (control) {
    control.classList.toggle("is-expanded", clipSearchExpanded);
    control.classList.toggle("has-active-query", isClipSearchActive());
  }
  if (selectionActions) {
    selectionActions.classList.toggle("is-search-expanded", clipSearchExpanded);
  }
  if (input && input.value !== clipSearchDraft) {
    input.value = clipSearchDraft;
  }
}

function calculateClipSearchTargetWidth(compactSelectedLabel) {
  const control = $("clipSearchControl");
  const toolbar = document.querySelector(".clips-toolbar-actions");
  const selection = $("selectionActions");
  const labelSlot = $("clipsSelectionLabelSlot");
  if (!control || !toolbar) return SEARCH_COLLAPSED_WIDTH_PX;

  const toolbarWidth = toolbar.getBoundingClientRect().width;
  const labelWidthReleased = compactSelectedLabel && labelSlot && !labelSlot.hidden
    ? labelSlot.getBoundingClientRect().width
    : 0;
  const selectionVisible = selection && !selection.classList.contains("is-hidden");
  const selectionWidth = selectionVisible ? SELECTION_ACTIONS_SEARCH_RESERVED_WIDTH_PX : 0;
  const toolbarGap = selectionWidth > 0 ? 6 : 0;
  const available = Math.floor(toolbarWidth + labelWidthReleased - selectionWidth - toolbarGap - TOOLBAR_SAFETY_GAP_PX);
  if (available < SEARCH_MIN_EXPANDED_WIDTH_PX) {
    return Math.max(SEARCH_COLLAPSED_WIDTH_PX, available);
  }
  const preferredWidth = clamp(available, SEARCH_MIN_EXPANDED_WIDTH_PX, SEARCH_PREFERRED_EXPANDED_WIDTH_PX);
  if (selectionWidth <= 0) {
    return clamp(
      Math.floor(preferredWidth * SEARCH_SOLO_EXPANDED_WIDTH_RATIO),
      SEARCH_MIN_EXPANDED_WIDTH_PX,
      preferredWidth,
    );
  }
  return preferredWidth;
}

function setClipSearchTargetWidth(width) {
  const control = $("clipSearchControl");
  const toolbar = document.querySelector(".clips-toolbar-actions");
  if (!control) return;
  clipSearchTargetWidthPx = Math.max(SEARCH_COLLAPSED_WIDTH_PX, Math.floor(Number(width) || SEARCH_COLLAPSED_WIDTH_PX));
  control.style.setProperty("--clip-search-target-width", `${clipSearchTargetWidthPx}px`);
  if (toolbar) toolbar.style.setProperty("--clip-search-layout-width", `${clipSearchTargetWidthPx}px`);
}

function updateClipSearchExpandedWidth(options = {}) {
  if (!options.force && isClipSearchTransitioning()) return;
  setClipSearchTargetWidth(clipSearchExpanded
    ? calculateClipSearchTargetWidth(true)
    : SEARCH_COLLAPSED_WIDTH_PX);
}

function setClipSearchExpanded(nextExpanded) {
  const expanded = Boolean(nextExpanded);
  const alreadyTargeting = expanded === clipSearchExpanded
    && ((expanded && (clipSearchTransitionState === "expanding" || clipSearchTransitionState === "expanded"))
      || (!expanded && (clipSearchTransitionState === "collapsing" || clipSearchTransitionState === "collapsed")));
  if (alreadyTargeting) {
    syncClipSearchControl();
    if (!isClipSearchTransitioning()) updateClipSearchExpandedWidth();
    return;
  }

  if (clipSearchTransitionTimer !== null) {
    window.clearTimeout(clipSearchTransitionTimer);
    clipSearchTransitionTimer = null;
  }

  syncSelectedLabelSlotWidth();
  setClipSearchTargetWidth(expanded
    ? calculateClipSearchTargetWidth(true)
    : SEARCH_COLLAPSED_WIDTH_PX);

  clipSearchExpanded = expanded;
  clipSearchTransitionState = expanded ? "expanding" : "collapsing";
  syncClipSearchControl();
  animateSelectedLabelTo(expanded ? 0 : SELECTED_LABEL_TEXT.length, TOOLBAR_EXPANSION_MS);

  clipSearchTransitionTimer = window.setTimeout(() => {
    clipSearchTransitionTimer = null;
    clipSearchTransitionState = expanded ? "expanded" : "collapsed";
  }, prefersReducedMotion() ? 0 : TOOLBAR_EXPANSION_MS);
}

function updateClipSearchControl() {
  syncClipSearchControl();
  updateClipSearchExpandedWidth();
}

function focusClipSearchInput() {
  const input = $("clipSearchInput");
  if (!input) return;
  input.focus();
  const position = input.value.length;
  try {
    input.setSelectionRange(position, position);
  } catch (error) {
    // Some WebViews can reject selection changes while focusing; focus still succeeds.
  }
}

function expandClipSearch() {
  if (!clipSearchDraft) clipSearchDraft = activeClipSearchQuery;
  setClipSearchExpanded(true);
  window.setTimeout(focusClipSearchInput, 0);
}

function collapseClipSearch() {
  clipSearchDraft = activeClipSearchQuery;
  setClipSearchExpanded(false);
}

function isClipSearchCollapseExemptTarget(target) {
  if (!target) return false;
  const deleteSelectedButton = $("deleteSelectedButton");
  const clearSelectionButton = $("clearSelectionButton");
  return Boolean(
    (deleteSelectedButton && deleteSelectedButton.contains(target))
    || (clearSelectionButton && clearSelectionButton.contains(target)),
  );
}

function applyClipSearch(query) {
  activeClipSearchQuery = sanitizeSearchQuery(query);
  clipSearchDraft = activeClipSearchQuery;
  setClipSearchExpanded(true);
  if (clipReorderState && isClipSearchActive()) cancelClipDrag();
  updateClipSearchControl();
  renderClips(latestState && latestState.clips, currentDisplayFps());
  window.setTimeout(focusClipSearchInput, 0);
}

function updateLiveClipSearch(query) {
  const nextQuery = sanitizeSearchQuery(query);
  activeClipSearchQuery = nextQuery;
  clipSearchDraft = sanitizeSearchEditValue(query);
  if (clipReorderState && isClipSearchActive()) cancelClipDrag();
  updateClipSearchControl();
  renderClips(latestState && latestState.clips, currentDisplayFps());
}

function bindClipSearchControl() {
  const control = $("clipSearchControl");
  const input = $("clipSearchInput");
  const button = $("clipSearchButton");
  if (!control || !input || !button) return;

  bindStableHover(control, "is-hovering");
  input.maxLength = CLIP_TEXT_MAX_LENGTH;

  button.onclick = function (event) {
    event.preventDefault();
    event.stopPropagation();
    if (!clipSearchExpanded) {
      expandClipSearch();
      return;
    }
    applyClipSearch(input.value);
  };

  button.onmousedown = function (event) {
    event.preventDefault();
  };

  input.onfocus = function () {
    setClipSearchExpanded(true);
  };

  input.oninput = function (event) {
    event.stopPropagation();
    const selectionStart = input.selectionStart;
    const selectionEnd = input.selectionEnd;
    const sanitized = sanitizeSearchEditValue(input.value);
    if (input.value !== sanitized) input.value = sanitized;
    updateLiveClipSearch(input.value);
    if (document.activeElement === input && selectionStart !== null && selectionEnd !== null) {
      const position = Math.min(input.value.length, selectionStart);
      try {
        input.setSelectionRange(position, Math.min(input.value.length, selectionEnd));
      } catch (error) {
        // Some WebViews can reject selection changes during IME/input updates.
      }
    }
  };

  input.onkeydown = function (event) {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      updateLiveClipSearch(input.value);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (input.value || isClipSearchActive()) {
        activeClipSearchQuery = "";
        clipSearchDraft = "";
        input.value = "";
        updateClipSearchControl();
        renderClips(latestState && latestState.clips, currentDisplayFps());
        window.setTimeout(focusClipSearchInput, 0);
      } else {
        collapseClipSearch();
      }
    }
  };

  control.onclick = function (event) {
    event.stopPropagation();
    if (!clipSearchExpanded) expandClipSearch();
  };

  control.addEventListener("focusin", () => {
    setClipSearchExpanded(true);
  });

  control.addEventListener("focusout", (event) => {
    const nextFocus = event.relatedTarget;
    window.setTimeout(() => {
      if (clipSearchOutsidePressPending) return;
      if (control.contains(document.activeElement)) return;
      if (isClipSearchCollapseExemptTarget(nextFocus)
        || isClipSearchCollapseExemptTarget(document.activeElement)) return;
      clipSearchDraft = activeClipSearchQuery;
      collapseClipSearch();
    }, 0);
  });

  const clearPendingOutsideSearchPress = function () {
    clipSearchOutsidePressPending = false;
    clipSearchOutsidePressExempt = false;
    if (clipSearchOutsidePressTimer !== null) {
      window.clearTimeout(clipSearchOutsidePressTimer);
      clipSearchOutsidePressTimer = null;
    }
  };

  const finishPendingOutsideSearchPress = function () {
    if (!clipSearchOutsidePressPending) return;
    const exempt = clipSearchOutsidePressExempt;
    clearPendingOutsideSearchPress();
    if (exempt) return;
    if (!clipSearchExpanded) return;
    clipSearchDraft = activeClipSearchQuery;
    collapseClipSearch();
  };

  const schedulePendingOutsideSearchPressFinish = function () {
    if (!clipSearchOutsidePressPending) return;
    if (clipSearchOutsidePressTimer !== null) {
      window.clearTimeout(clipSearchOutsidePressTimer);
    }
    clipSearchOutsidePressTimer = window.setTimeout(() => {
      clipSearchOutsidePressTimer = null;
      finishPendingOutsideSearchPress();
    }, 0);
  };

  const beginSearchOutsidePress = function (event) {
    if (!clipSearchExpanded || control.contains(event.target)) return;
    clipSearchOutsidePressPending = true;
    clipSearchOutsidePressExempt = isClipSearchCollapseExemptTarget(event.target);
    const active = document.activeElement;
    if (active && control.contains(active) && typeof active.blur === "function") {
      active.blur();
    }
  };

  document.addEventListener("pointerdown", beginSearchOutsidePress, true);
  document.addEventListener("mousedown", beginSearchOutsidePress, true);
  document.addEventListener("pointerup", schedulePendingOutsideSearchPressFinish, true);
  document.addEventListener("mouseup", schedulePendingOutsideSearchPressFinish, true);
  document.addEventListener("click", finishPendingOutsideSearchPress);

  updateClipSearchControl();
}

function updateClipsHeaderCounts(totalCount, selectedCount) {
  const counterGroup = $("clipsCounterGroup");
  const total = $("clipsTotalCount");
  const summary = $("clipsSelectionSummary");
  const selectedNumber = $("clipsSelectedNumber");
  const labelSlot = $("clipsSelectionLabelSlot");
  const totalValue = Math.max(0, Number(totalCount) || 0);
  if (total) total.textContent = String(totalValue);
  if (counterGroup) {
    const hasClips = totalValue > 0;
    counterGroup.hidden = !hasClips;
    counterGroup.setAttribute("aria-hidden", hasClips ? "false" : "true");
  }
  if (!summary || !selectedNumber || !labelSlot) return;
  const count = Math.max(0, Number(selectedCount) || 0);
  syncSelectedLabelSlotWidth();
  if (count === 0) {
    if (renderedSelectedCount > 0 && !summary.hidden) {
      renderedSelectedCount = 0;
      setSelectionSummaryVisible(false, {
        animate: true,
        durationMs: SELECTION_SUMMARY_EXIT_MS,
      });
    } else {
      renderedSelectedCount = 0;
      selectedNumber.textContent = "0";
      setSelectionSummaryVisible(false, { animate: false });
    }
    setSelectedLabelSlotHidden(clipSearchExpanded, { immediate: true });
    return;
  }

  const wasVisible = !summary.hidden && renderedSelectedCount > 0;
  renderedSelectedCount = count;
  selectedNumber.textContent = String(count);
  setSelectionSummaryVisible(true, {
    animate: !wasVisible,
    durationMs: SELECTION_SUMMARY_ENTRY_MS,
  });
  animateSelectedLabelTo(clipSearchExpanded ? 0 : SELECTED_LABEL_TEXT.length, TOOLBAR_EXPANSION_MS);
}

function setSelectionActionButtonsDisabled(disabled) {
  const deleteSelectedButton = $("deleteSelectedButton");
  const clearSelectionButton = $("clearSelectionButton");
  if (deleteSelectedButton) deleteSelectedButton.disabled = Boolean(disabled);
  if (clearSelectionButton) clearSelectionButton.disabled = Boolean(disabled);
}

function updateSelectionActionsVisibility(hasSelection) {
  const actions = $("selectionActions");
  if (!actions) return;
  const visible = Boolean(hasSelection);

  if (visible) {
    if (actions.classList.contains("is-visible") || actions.classList.contains("is-entering")) {
      actions.setAttribute("aria-hidden", "false");
      setSelectionActionButtonsDisabled(false);
      return;
    }
    const isReversing = actions.classList.contains("is-exiting");
    if (selectionActionsAnimationTimer !== null) {
      window.clearTimeout(selectionActionsAnimationTimer);
      selectionActionsAnimationTimer = null;
    }
    actions.classList.remove("is-visible", "is-exiting", "is-reversing");
    if (!isReversing) {
      actions.classList.add("is-hidden");
      actions.offsetWidth;
    }
    actions.classList.remove("is-hidden");
    actions.classList.add("is-entering");
    if (isReversing) actions.classList.add("is-reversing");
    actions.setAttribute("aria-hidden", "false");
    setSelectionActionButtonsDisabled(false);
    const entryDurationMs = prefersReducedMotion() ? 0 : SELECTION_ACTIONS_ENTRY_MS;
    const finishEntry = () => {
      selectionActionsAnimationTimer = null;
      if (!actions.classList.contains("is-entering")) return;
      actions.classList.remove("is-entering", "is-reversing");
      actions.classList.add("is-visible");
    };
    if (entryDurationMs === 0) finishEntry();
    else selectionActionsAnimationTimer = window.setTimeout(finishEntry, entryDurationMs);
    return;
  }

  if (actions.classList.contains("is-exiting")) {
    actions.setAttribute("aria-hidden", "true");
    return;
  }

  if (actions.classList.contains("is-hidden")) {
    actions.setAttribute("aria-hidden", "true");
    setSelectionActionButtonsDisabled(true);
    return;
  }

  if (selectionActionsAnimationTimer !== null) {
    window.clearTimeout(selectionActionsAnimationTimer);
    selectionActionsAnimationTimer = null;
  }
  actions.classList.remove("is-entering", "is-visible", "is-reversing");
  actions.classList.add("is-exiting");
  actions.setAttribute("aria-hidden", "true");
  const exitDurationMs = prefersReducedMotion() ? 0 : SELECTION_ACTIONS_EXIT_MS;
  const finishExit = () => {
    selectionActionsAnimationTimer = null;
    if (!actions.classList.contains("is-exiting")) return;
    actions.classList.remove("is-exiting");
    actions.classList.add("is-hidden");
    setSelectionActionButtonsDisabled(true);
  };
  if (exitDurationMs === 0) finishExit();
  else selectionActionsAnimationTimer = window.setTimeout(finishExit, exitDurationMs);
}

function fpsIndicatorText(state) {
  const text = state && typeof state.fpsText === "string" ? state.fpsText.trim() : "";
  if (text && text !== "--") return `${text} fps`;
  return "-- fps";
}

function ffmpegHeaderStatus(state) {
  const available = Boolean(state && (state.ffmpegAvailable || state.ffmpegFound));
  if (available) return null;
  const status = String(state && state.ffmpegStatus || "").toLowerCase();
  if (status.includes("error") || status.includes("failed")) {
    return { label: "error", className: "is-error", title: "FFmpeg error. Click to set path." };
  }
  return { label: "error", className: "is-error", title: "FFmpeg not found. Click to set path." };
}

function renderTopHeaderStatus(state) {
  const fps = $("fpsIndicator");
  if (fps) fps.textContent = fpsIndicatorText(state);

  const ffmpeg = $("ffmpegWarningPill");
  if (!ffmpeg) return;
  const status = ffmpegHeaderStatus(state);
  if (!status) {
    ffmpeg.hidden = true;
    ffmpeg.disabled = true;
    ffmpeg.removeAttribute("title");
    ffmpeg.setAttribute("aria-hidden", "true");
    ffmpeg.classList.remove("is-ready", "is-missing", "is-error");
    return;
  }

  ffmpeg.hidden = false;
  ffmpeg.textContent = status.label;
  ffmpeg.title = status.title;
  ffmpeg.setAttribute("aria-label", status.title);
  ffmpeg.removeAttribute("aria-hidden");
  ffmpeg.classList.remove("is-ready", "is-missing", "is-error");
  ffmpeg.classList.add(status.className);
  ffmpeg.disabled = Boolean(state && state.canUseFfmpeg === false);
}

function clipIdsFromClips(clips) {
  return Array.isArray(clips) ? clips.map((clip) => clip.id) : [];
}

function moveClipIdToDropIndex(ids, clipId, startIndex, dropIndex) {
  const original = Array.isArray(ids) ? ids.slice() : [];
  const filtered = original.filter((id) => id !== clipId);
  let targetIndex = Number(dropIndex);
  if (!Number.isFinite(targetIndex)) targetIndex = startIndex;
  targetIndex = clamp(targetIndex, 0, filtered.length);
  filtered.splice(targetIndex, 0, clipId);
  return filtered;
}

function isInteractiveCardReorderTarget(target) {
  if (!target || !target.closest) return false;
  return Boolean(target.closest(
    "button, input, textarea, select, a, [contenteditable='true'], " +
    ".delete-confirm-bubble, .selection-actions, .clips-header, .clip-row-index, " +
    ".clip-delete-zone, .clip-title, .clip-title-text, .clip-title-button, " +
    ".clip-title-input, .clip-title-edit-icon, .clip-rename-button, .clip-rename-input"
  ));
}

function clipRowsForDrop() {
  return Array.from(document.querySelectorAll("#clipsList .clip-position-slot"));
}

function clipDropIndexFromPointerY(pointerY) {
  const rows = clipRowsForDrop();
  if (!rows.length) return 0;
  const maxDropIndex = clipReorderState && Array.isArray(clipReorderState.originalOrder)
    ? Math.max(0, clipReorderState.originalOrder.length - 1)
    : rows.length;
  for (let index = 0; index < rows.length; index += 1) {
    const rect = rows[index].getBoundingClientRect();
    if (pointerY < rect.top + rect.height / 2) return clamp(index, 0, maxDropIndex);
  }
  return maxDropIndex;
}

function pointIsInsideClipDropZone(point) {
  const list = $("clipsList");
  if (!list || !point) return false;
  const rect = list.getBoundingClientRect();
  return (
    point.x >= rect.left - DROP_ZONE_TOLERANCE_PX &&
    point.x <= rect.right + DROP_ZONE_TOLERANCE_PX &&
    point.y >= rect.top - DROP_ZONE_TOLERANCE_PX &&
    point.y <= rect.bottom + DROP_ZONE_TOLERANCE_PX
  );
}

function updateClipDragGhostPosition(point) {
  if (!clipReorderState || !clipReorderState.ghostElement || !point) return;
  clipReorderState.ghostX = point.x - clipReorderState.pointerOffsetX;
  clipReorderState.ghostY = point.y - clipReorderState.pointerOffsetY;
  if (clipDragFrame !== null) return;
  clipDragFrame = window.requestAnimationFrame(() => {
    clipDragFrame = null;
    if (!clipReorderState || !clipReorderState.ghostElement) return;
    clipReorderState.ghostElement.style.transform = `translate3d(${Math.round(clipReorderState.ghostX)}px, ${Math.round(clipReorderState.ghostY)}px, 0)`;
  });
}

function clipDragOverlayRoot() {
  let root = $("clipDragOverlayRoot");
  if (root) return root;
  root = document.createElement("div");
  root.id = "clipDragOverlayRoot";
  root.setAttribute("aria-hidden", "true");
  document.body.appendChild(root);
  return root;
}

function createClipDragGhost() {
  if (!clipReorderState || !clipReorderState.card) return;
  const rect = clipReorderState.card.getBoundingClientRect();
  const ghost = clipReorderState.card.cloneNode(true);
  ghost.classList.add("clip-drag-ghost", "clip-drag-lifted-card");
  ghost.classList.remove("is-reorder-candidate");
  ghost.removeAttribute("id");
  ghost.removeAttribute("role");
  ghost.removeAttribute("tabindex");
  ghost.setAttribute("aria-hidden", "true");
  ghost.querySelectorAll("[id]").forEach((element) => {
    element.removeAttribute("id");
  });
  ghost.querySelectorAll("button, input, textarea, select, a, [contenteditable='true']").forEach((element) => {
    element.setAttribute("tabindex", "-1");
    element.removeAttribute("contenteditable");
  });
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  clipDragOverlayRoot().appendChild(ghost);
  clipReorderState.pointerOffsetX = clipReorderState.startX - rect.left;
  clipReorderState.pointerOffsetY = clipReorderState.startY - rect.top;
  clipReorderState.ghostElement = ghost;
  updateClipDragGhostPosition({ x: clipReorderState.startX, y: clipReorderState.startY });
}

function updateClipDragDropTarget(point) {
  if (!clipReorderState || !clipReorderState.hasStartedDragging) return;
  const isValid = pointIsInsideClipDropZone(point);
  clipReorderState.isInsideValidDropZone = isValid;
  if (clipReorderState.ghostElement) {
    clipReorderState.ghostElement.classList.toggle("is-invalid-drop", !isValid);
  }
  if (!isValid) {
    renderClipDragSlots(null, false);
    return;
  }
  const dropIndex = clipDropIndexFromPointerY(point.y);
  clipReorderState.currentDropIndex = dropIndex;
  renderClipDragSlots(dropIndex, true);
}

function stopClipDragAutoScroll() {
  if (clipDragAutoScrollFrame !== null) {
    window.cancelAnimationFrame(clipDragAutoScrollFrame);
    clipDragAutoScrollFrame = null;
  }
}

function clipDragAutoScrollTick() {
  clipDragAutoScrollFrame = null;
  if (!clipReorderState || !clipReorderState.hasStartedDragging || !clipReorderState.lastPoint) return;
  const scroller = document.querySelector("main");
  const list = $("clipsList");
  if (!scroller || !list) return;

  const point = clipReorderState.lastPoint;
  const scrollerRect = scroller.getBoundingClientRect();
  const listRect = list.getBoundingClientRect();
  const nearListX = point.x >= listRect.left - DROP_ZONE_TOLERANCE_PX && point.x <= listRect.right + DROP_ZONE_TOLERANCE_PX;
  if (!nearListX) return;

  let delta = 0;
  if (point.y < scrollerRect.top + AUTO_SCROLL_EDGE_PX) {
    const distance = Math.max(0, point.y - scrollerRect.top);
    delta = -Math.ceil((1 - distance / AUTO_SCROLL_EDGE_PX) * AUTO_SCROLL_MAX_PX_PER_FRAME);
  } else if (point.y > scrollerRect.bottom - AUTO_SCROLL_EDGE_PX) {
    const distance = Math.max(0, scrollerRect.bottom - point.y);
    delta = Math.ceil((1 - distance / AUTO_SCROLL_EDGE_PX) * AUTO_SCROLL_MAX_PX_PER_FRAME);
  }

  if (delta === 0) return;
  const previousScrollTop = scroller.scrollTop;
  scroller.scrollTop += delta;
  if (scroller.scrollTop !== previousScrollTop) {
    updateClipDragDropTarget(point);
    clipDragAutoScrollFrame = window.requestAnimationFrame(clipDragAutoScrollTick);
  }
}

function updateClipDragAutoScroll() {
  if (clipDragAutoScrollFrame !== null) return;
  clipDragAutoScrollFrame = window.requestAnimationFrame(clipDragAutoScrollTick);
}

function removeClipDragListeners(state) {
  window.removeEventListener("pointermove", handleClipReorderPointerMove, true);
  window.removeEventListener("pointerup", handleClipReorderPointerEnd, true);
  window.removeEventListener("pointercancel", handleClipReorderPointerCancel, true);
  window.removeEventListener("keydown", handleClipReorderKeydown, true);
  window.removeEventListener("blur", handleClipReorderWindowBlur, true);
  window.removeEventListener("beforeunload", handleClipReorderWindowBlur, true);
  if (state && state.captureElement) {
    state.captureElement.removeEventListener("lostpointercapture", handleClipReorderLostCapture);
  }
}

function cleanupClipDragState(options) {
  if (!clipReorderState) return null;
  const state = clipReorderState;
  const config = options || {};
  removeClipDragListeners(state);
  stopClipDragAutoScroll();
  if (clipDragFrame !== null) {
    window.cancelAnimationFrame(clipDragFrame);
    clipDragFrame = null;
  }

  if (state.captureElement && state.captureElement.releasePointerCapture && state.pointerId !== undefined) {
    try {
      state.captureElement.releasePointerCapture(state.pointerId);
    } catch (error) {
      // Pointer capture is optional.
    }
  }

  if (state.sourceRow) {
    state.sourceRow.classList.remove("is-reorder-pressed", "is-reorder-dragging", "is-clip-drag-source");
  }
  if (state.card) state.card.classList.remove("is-reorder-candidate");
  if (state.ghostElement && state.ghostElement.parentNode) {
    state.ghostElement.parentNode.removeChild(state.ghostElement);
  }
  document.body.classList.remove("is-reordering-clips");
  clipReorderState = null;
  if (config.render !== false) {
    renderClips(latestState && latestState.clips, state.fps || currentDisplayFps());
  }
  if (config.suppressClick && state.hasStartedDragging) {
    suppressNextClipClickId = state.clipId;
    window.setTimeout(() => {
      if (suppressNextClipClickId === state.clipId) suppressNextClipClickId = null;
    }, 250);
  }
  return state;
}

function cancelClipDrag() {
  cleanupClipDragState({ suppressClick: true });
}

function commitClipDrag(dropIndex) {
  if (!clipReorderState) return;
  const state = cleanupClipDragState({ suppressClick: true, render: false });
  if (!state || !state.hasStartedDragging) return;
  const nextIds = moveClipIdToDropIndex(state.originalOrder, state.clipId, state.originalIndex, dropIndex);
  if (nextIds.join(",") === state.originalOrder.join(",")) {
    renderClips(latestState && latestState.clips, state.fps || currentDisplayFps());
    return;
  }
  const clipsById = new Map(((latestState && latestState.clips) || []).map((clip) => [clip.id, clip]));
  const nextClips = nextIds.map((id) => clipsById.get(id)).filter(Boolean);
  renderClips(nextClips, state.fps || currentDisplayFps());
  if (!rpc || typeof rpc.$reorderClips !== "function") {
    return;
  }
  callAction(() => rpc.$reorderClips(nextIds));
}

function startClipDrag(point) {
  if (!clipReorderState || clipReorderState.hasStartedDragging || !point) return;
  clearPendingClipSelection();
  clipReorderState.hasStartedDragging = true;
  clipReorderState.isInsideValidDropZone = false;
  suppressNextClipClickId = clipReorderState.clipId;
  createClipDragGhost();
  if (clipReorderState.sourceRow) {
    clipReorderState.sourceRow.classList.add("is-reorder-dragging", "is-clip-drag-source");
  }
  if (clipReorderState.card) clipReorderState.card.classList.add("is-reorder-candidate");
  document.body.classList.add("is-reordering-clips");
  renderClipDragSlots(clipReorderState.originalIndex, true);
  updateClipDragGhostPosition(point);
  updateClipDragDropTarget(point);
}

function handleClipReorderPointerMove(event) {
  if (!clipReorderState) return;
  if (event.pointerId !== undefined && event.pointerId !== clipReorderState.pointerId) return;
  const point = eventPoint(event);
  if (!point) return;

  clipReorderState.lastPoint = point;
  const deltaX = Math.abs(point.x - clipReorderState.startX);
  const deltaY = Math.abs(point.y - clipReorderState.startY);
  const delta = Math.max(deltaX, deltaY);
  if (!clipReorderState.hasStartedDragging && delta < REORDER_DRAG_START_THRESHOLD_PX) return;

  event.preventDefault();
  event.stopPropagation();
  if (!clipReorderState.hasStartedDragging) startClipDrag(point);
  updateClipDragGhostPosition(point);
  updateClipDragDropTarget(point);
  updateClipDragAutoScroll();
}

function handleClipReorderPointerEnd(event) {
  if (!clipReorderState) return;
  if (event.pointerId !== undefined && event.pointerId !== clipReorderState.pointerId) return;

  const state = clipReorderState;
  if (state.hasStartedDragging) {
    event.preventDefault();
    event.stopPropagation();
  }
  if (!state.hasStartedDragging) {
    cleanupClipDragState({ suppressClick: false, render: false });
    return;
  }
  const point = eventPoint(event) || state.lastPoint;
  const valid = pointIsInsideClipDropZone(point);
  if (!valid) {
    cancelClipDrag();
    return;
  }
  const dropIndex = clipDropIndexFromPointerY(point.y);
  commitClipDrag(dropIndex);
}

function handleClipReorderPointerCancel() {
  cancelClipDrag();
}

function handleClipReorderKeydown(event) {
  if (!clipReorderState || event.key !== "Escape") return;
  event.preventDefault();
  event.stopPropagation();
  cancelClipDrag();
}

function handleClipReorderWindowBlur() {
  cancelClipDrag();
}

function handleClipReorderLostCapture() {
  if (!clipReorderState) return;
  cancelClipDrag();
}

function beginClipReorder(event, clip, index, row, options) {
  if (!clip || !latestState || !Array.isArray(latestState.clips)) return;
  if (latestState.exporting) return;
  if (!clipReorderIsAllowed()) return;
  if (event.button !== undefined && event.button !== 0) return;
  const config = options || {};
  if (config.source === "card" && isInteractiveCardReorderTarget(event.target)) return;

  if (clipReorderState) cancelClipDrag();
  const originalOrder = clipIdsFromClips(latestState.clips);
  const captureElement = config.captureElement || row;
  clipReorderState = {
    clipId: clip.id,
    originalIndex: index,
    currentDropIndex: index,
    originalOrder,
    startX: event.clientX,
    startY: event.clientY,
    pointerOffsetX: 0,
    pointerOffsetY: 0,
    pointerId: event.pointerId,
    fileId: navigationFileIdFromState(latestState),
    sourceRow: row,
    card: config.card || null,
    captureElement,
    hasStartedDragging: false,
    isInsideValidDropZone: false,
    ghostElement: null,
    renderedDropIndex: null,
    renderedIsValidDrop: null,
    rowHeight: row ? row.getBoundingClientRect().height : 0,
    fps: currentDisplayFps(),
    format: "frames",
    lastPoint: eventPoint(event),
    ghostX: 0,
    ghostY: 0
  };

  if (row) row.classList.add("is-reorder-pressed");
  window.addEventListener("pointermove", handleClipReorderPointerMove, true);
  window.addEventListener("pointerup", handleClipReorderPointerEnd, true);
  window.addEventListener("pointercancel", handleClipReorderPointerCancel, true);
  window.addEventListener("keydown", handleClipReorderKeydown, true);
  window.addEventListener("blur", handleClipReorderWindowBlur, true);
  window.addEventListener("beforeunload", handleClipReorderWindowBlur, true);
}

function deleteConfirmationConfig(kind) {
  if (kind === "clearList") {
    return {
      overlayId: "clearListConfirm",
      triggerId: "clearListButton",
      confirmId: "confirmClearListButton",
      cancelId: "cancelClearListButton",
      preferredPlacement: "above",
      forcePlacement: true,
    };
  }
  return {
    overlayId: "deleteSelectedConfirm",
    triggerId: "deleteSelectedButton",
    confirmId: "confirmDeleteSelectedButton",
    cancelId: "cancelDeleteSelectedButton",
    preferredPlacement: "below",
    forcePlacement: false,
  };
}

function deleteConfirmationElements(kind) {
  const config = deleteConfirmationConfig(kind);
  return {
    overlay: $(config.overlayId),
    trigger: $(config.triggerId),
    confirm: $(config.confirmId),
    cancel: $(config.cancelId),
  };
}

function calculateDeleteSelectedConfirmPosition(buttonRect, bubbleSize, viewportSize, options) {
  const viewportWidth = Math.max(0, Number(viewportSize && viewportSize.width) || 0);
  const viewportHeight = Math.max(0, Number(viewportSize && viewportSize.height) || 0);
  const bubbleWidth = Math.max(0, Number(bubbleSize && bubbleSize.width) || 0);
  const bubbleHeight = Math.max(0, Number(bubbleSize && bubbleSize.height) || 0);
  const buttonLeft = Number(buttonRect && buttonRect.left) || 0;
  const buttonTop = Number(buttonRect && buttonRect.top) || 0;
  const buttonWidth = Math.max(0, Number(buttonRect && buttonRect.width) || 0);
  const buttonHeight = Math.max(0, Number(buttonRect && buttonRect.height) || 0);
  const buttonCenterX = buttonLeft + buttonWidth / 2;
  const maximumLeft = Math.max(
    DELETE_CONFIRM_VIEWPORT_MARGIN_PX,
    viewportWidth - DELETE_CONFIRM_VIEWPORT_MARGIN_PX - bubbleWidth,
  );
  const left = clamp(
    buttonCenterX - bubbleWidth / 2,
    DELETE_CONFIRM_VIEWPORT_MARGIN_PX,
    maximumLeft,
  );
  const aboveTop = buttonTop - DELETE_CONFIRM_GAP_PX - bubbleHeight;
  const belowTop = buttonTop + buttonHeight + DELETE_CONFIRM_GAP_PX;
  const aboveFits = aboveTop >= DELETE_CONFIRM_VIEWPORT_MARGIN_PX;
  const belowFits = belowTop + bubbleHeight <= viewportHeight - DELETE_CONFIRM_VIEWPORT_MARGIN_PX;
  const preferredPlacement = options && options.preferredPlacement === "above" ? "above" : "below";
  let placement = preferredPlacement;
  if (!(options && options.forcePlacement)) {
    if (preferredPlacement === "below" && !belowFits && aboveFits) placement = "above";
    if (preferredPlacement === "above" && !aboveFits && belowFits) placement = "below";
  }
  const desiredTop = placement === "above"
    ? aboveTop
    : belowTop;
  const maximumTop = Math.max(
    DELETE_CONFIRM_VIEWPORT_MARGIN_PX,
    viewportHeight - DELETE_CONFIRM_VIEWPORT_MARGIN_PX - bubbleHeight,
  );
  const top = clamp(
    desiredTop,
    DELETE_CONFIRM_VIEWPORT_MARGIN_PX,
    maximumTop,
  );
  const anchorX = clamp(
    buttonCenterX - left,
    10,
    Math.max(10, bubbleWidth - 10),
  );
  return { left, top, anchorX, placement };
}

function positionDeleteConfirmation(kind) {
  const config = deleteConfirmationConfig(kind);
  const elements = deleteConfirmationElements(kind);
  if (!elements.overlay || elements.overlay.hidden || !elements.trigger) return;
  const buttonRect = elements.trigger.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth || 0;
  const viewportHeight = document.documentElement.clientHeight || window.innerHeight || 0;
  const position = calculateDeleteSelectedConfirmPosition(
    buttonRect,
    { width: elements.overlay.offsetWidth, height: elements.overlay.offsetHeight },
    { width: viewportWidth, height: viewportHeight },
    config,
  );
  elements.overlay.dataset.placement = position.placement;
  elements.overlay.style.left = `${Math.round(position.left)}px`;
  elements.overlay.style.top = `${Math.round(position.top)}px`;
  elements.overlay.style.setProperty("--delete-confirm-anchor-x", `${Math.round(position.anchorX)}px`);
}

function deleteConfirmationIsOpen(kind) {
  const overlay = deleteConfirmationElements(kind).overlay;
  return Boolean(overlay && !overlay.hidden && overlay.getAttribute("aria-hidden") === "false");
}

function normalizedScrollTarget(target) {
  if (!target || target === document || target === document.body || target === document.documentElement) return window;
  return target;
}

function scrollOffsetForTarget(target) {
  if (target === window) {
    return Number(window.scrollY || document.documentElement.scrollTop || document.body.scrollTop) || 0;
  }
  return Number(target && target.scrollTop) || 0;
}

function snapshotDeleteConfirmationScrollOffsets() {
  const offsets = new Map();
  offsets.set(window, scrollOffsetForTarget(window));
  document.querySelectorAll("*").forEach((element) => {
    if (element.scrollHeight > element.clientHeight) offsets.set(element, scrollOffsetForTarget(element));
  });
  return offsets;
}

function scheduleActiveDeleteConfirmationPosition() {
  if (!activeDeleteConfirmation || deleteConfirmationScrollFrame !== null) return;
  deleteConfirmationScrollFrame = window.requestAnimationFrame(() => {
    deleteConfirmationScrollFrame = null;
    if (activeDeleteConfirmation) positionDeleteConfirmation(activeDeleteConfirmation);
  });
}

function handleDeleteConfirmationScroll(event) {
  if (!activeDeleteConfirmation || !deleteConfirmationScrollState) return;
  const target = normalizedScrollTarget(event && event.target);
  const currentOffset = scrollOffsetForTarget(target);
  const offsets = deleteConfirmationScrollState.offsets;
  if (!offsets.has(target)) offsets.set(target, currentOffset);
  const initialOffset = offsets.get(target);
  deleteConfirmationScrollState.distance = Math.max(
    deleteConfirmationScrollState.distance,
    Math.abs(currentOffset - initialOffset),
  );
  const viewportHeight = document.documentElement.clientHeight || window.innerHeight || 0;
  const distance = deleteConfirmationScrollState.distance;
  const clearListTrigger = deleteConfirmationElements("clearList").trigger;
  const shouldDismissClearList = activeDeleteConfirmation === "clearList" && clearListTrigger &&
    shouldDismissClearListConfirmation(distance, clearListTrigger.getBoundingClientRect(), viewportHeight);
  const shouldDismissOtherConfirmation = activeDeleteConfirmation !== "clearList" &&
    distance >= viewportHeight * DELETE_CONFIRM_SCROLL_DISMISS_RATIO;
  if (shouldDismissClearList || shouldDismissOtherConfirmation) {
    positionDeleteConfirmation(activeDeleteConfirmation);
    closeDeleteConfirmation(activeDeleteConfirmation);
    return;
  }
  scheduleActiveDeleteConfirmationPosition();
}

function visibleVerticalRatio(rect, viewportHeight) {
  const top = Number(rect && rect.top) || 0;
  const height = Math.max(0, Number(rect && rect.height) || 0);
  if (height === 0 || viewportHeight <= 0) return 0;
  const bottom = Number.isFinite(Number(rect && rect.bottom)) ? Number(rect.bottom) : top + height;
  const visibleTop = Math.max(0, top);
  const visibleBottom = Math.min(viewportHeight, bottom);
  return clamp((visibleBottom - visibleTop) / height, 0, 1);
}

function shouldDismissClearListConfirmation(distance, triggerRect, viewportHeight) {
  const scrollDistance = Math.max(0, Number(distance) || 0);
  const fallbackThreshold = Math.max(
    CLEAR_LIST_CONFIRM_MIN_SCROLL_PX,
    viewportHeight * CLEAR_LIST_CONFIRM_SCROLL_DISMISS_RATIO,
  );
  if (scrollDistance >= fallbackThreshold) return true;
  if (scrollDistance < CLEAR_LIST_CONFIRM_MIN_SCROLL_PX) return false;
  return visibleVerticalRatio(triggerRect, viewportHeight) <= CLEAR_LIST_TRIGGER_VISIBLE_DISMISS_RATIO;
}

function setHeaderInfoVisible(visible) {
  const group = $("pluginTitleGroup");
  if (!group) return;
  group.classList.toggle("is-info-visible", Boolean(visible));
}

function setHeaderInfoHintVisible(visible) {
  const group = $("pluginTitleGroup");
  const popover = $("pluginInfoPopover");
  const shown = Boolean(visible);
  if (group) group.classList.toggle("is-info-hint-visible", shown);
  if (popover) popover.setAttribute("aria-hidden", shown ? "false" : "true");
}

function bindHeaderInfoHover() {
  const group = $("pluginTitleGroup");
  const button = $("pluginInfoButton");
  if (!group || !button) return;

  group.addEventListener("mouseenter", () => {
    headerInfoHover = true;
    if (headerInfoShowTimer !== null) window.clearTimeout(headerInfoShowTimer);
    headerInfoShowTimer = window.setTimeout(() => {
      headerInfoShowTimer = null;
      if (headerInfoHover) setHeaderInfoVisible(true);
    }, HEADER_INFO_SHOW_DELAY_MS);
  });

  group.addEventListener("mouseleave", () => {
    headerInfoHover = false;
    if (headerInfoShowTimer !== null) {
      window.clearTimeout(headerInfoShowTimer);
      headerInfoShowTimer = null;
    }
    setHeaderInfoHintVisible(false);
    setHeaderInfoVisible(false);
  });

  button.addEventListener("mouseenter", () => {
    setHeaderInfoHintVisible(true);
  });

  button.addEventListener("mouseleave", () => {
    setHeaderInfoHintVisible(false);
    setHeaderInfoVisible(false);
  });

  button.addEventListener("focus", () => {
    setHeaderInfoVisible(true);
    setHeaderInfoHintVisible(true);
  });

  button.addEventListener("blur", () => {
    setHeaderInfoHintVisible(false);
    setHeaderInfoVisible(false);
  });
}

function clearDeleteConfirmationTimer(kind) {
  const timer = deleteConfirmTimers.get(kind);
  if (timer !== undefined) {
    window.clearTimeout(timer);
    deleteConfirmTimers.delete(kind);
  }
}

function closeDeleteConfirmation(kind, immediate) {
  const targetKind = kind || activeDeleteConfirmation;
  if (!targetKind) return;
  const elements = deleteConfirmationElements(targetKind);
  if (!elements.overlay) return;
  clearDeleteConfirmationTimer(targetKind);
  if (elements.trigger) {
    elements.trigger.classList.remove("is-confirmation-open");
    elements.trigger.setAttribute("aria-expanded", "false");
  }
  elements.overlay.classList.remove("is-open");
  elements.overlay.setAttribute("aria-hidden", "true");
  if (activeDeleteConfirmation === targetKind) {
    activeDeleteConfirmation = null;
    deleteConfirmationScrollState = null;
    if (deleteConfirmationScrollFrame !== null) {
      window.cancelAnimationFrame(deleteConfirmationScrollFrame);
      deleteConfirmationScrollFrame = null;
    }
  }
  if (immediate) {
    elements.overlay.hidden = true;
    return;
  }
  const timer = window.setTimeout(() => {
    deleteConfirmTimers.delete(targetKind);
    elements.overlay.hidden = true;
  }, DELETE_CONFIRM_HIDE_DELAY_MS);
  deleteConfirmTimers.set(targetKind, timer);
}

function closeDeleteSelectedConfirm() {
  closeDeleteConfirmation("deleteSelected");
}

function openDeleteConfirmation(kind) {
  const elements = deleteConfirmationElements(kind);
  if (!elements.overlay || !elements.trigger) return;
  ["deleteSelected", "clearList"].forEach((otherKind) => {
    if (otherKind === kind) return;
    const otherOverlay = deleteConfirmationElements(otherKind).overlay;
    if (otherOverlay && !otherOverlay.hidden) closeDeleteConfirmation(otherKind, true);
  });
  clearDeleteConfirmationTimer(kind);
  elements.overlay.hidden = false;
  elements.overlay.setAttribute("aria-hidden", "false");
  elements.trigger.classList.add("is-confirmation-open");
  elements.trigger.setAttribute("aria-expanded", "true");
  activeDeleteConfirmation = kind;
  deleteConfirmationScrollState = {
    offsets: snapshotDeleteConfirmationScrollOffsets(),
    distance: 0,
  };
  positionDeleteConfirmation(kind);
  window.requestAnimationFrame(() => {
    if (activeDeleteConfirmation !== kind) return;
    elements.overlay.classList.add("is-open");
    if (elements.cancel) elements.cancel.focus();
  });
}

function openDeleteSelectedConfirm() {
  if (selectedClipCountFromState(latestState) === 0) return;
  openDeleteConfirmation("deleteSelected");
}

function openClearListConfirm() {
  if (!latestState || latestState.canClearList === false) return;
  openDeleteConfirmation("clearList");
}

function deleteConfirmationEnabled() {
  return Boolean(latestState && latestState.deleteWithoutConfirmation !== true);
}

function shouldDeleteWithoutPrompt(event) {
  if (latestState && latestState.deleteWithoutConfirmation === true) return true;
  return Boolean((event && event.shiftKey) || isShiftPreviewMode);
}

function updateShiftDeleteArmedState() {
  const button = $("deleteSelectedButton");
  if (!button) return;
  button.classList.toggle("is-shift-delete-armed", deleteConfirmationEnabled() && isShiftPreviewMode);
}

function deleteSelectedClipsThroughExistingAction() {
  const ids = selectedClipIdsFromLatestState();
  callAction(() => rpc.$deleteSelectedClips(ids));
}

function clearClipListThroughExistingAction() {
  callAction(() => rpc.$clearList());
}

function titleElements() {
  const viewport = $("videoTitleViewport");
  return {
    wrapper: $("videoTitleWrap"),
    viewport,
    text: $("videoTitleText"),
    measure: $("videoTitleMeasure"),
    bubble: $("videoTitleBubble"),
    bubbleText: $("videoTitleBubbleText")
  };
}

function clearTitleBubbleShowTimer() {
  if (titleBubbleShowTimer !== null) {
    window.clearTimeout(titleBubbleShowTimer);
    titleBubbleShowTimer = null;
  }
}

function clearTitleBubbleHideTimer() {
  if (titleBubbleHideTimer !== null) {
    window.clearTimeout(titleBubbleHideTimer);
    titleBubbleHideTimer = null;
  }
}

function updateTitleBubble() {
  const elements = titleElements();
  if (!elements.bubble) return;
  const visible = titleBubbleEligible && titleBubbleReady && (
    titleBubbleTitleHover ||
    titleBubbleBubbleHover ||
    titleBubbleFocus ||
    titleCopyToastVisible ||
    titleTextSelectionActive ||
    Boolean(titleCopyInteraction)
  );
  if (visible) elements.bubble.hidden = false;
  elements.bubble.classList.toggle("is-visible", visible);
  elements.bubble.setAttribute("aria-hidden", visible ? "false" : "true");
  if (!visible && !titleBubbleEligible) elements.bubble.hidden = true;
}

function scheduleTitleBubbleShow() {
  clearTitleBubbleHideTimer();
  if (!titleBubbleEligible) return;
  if (titleBubbleReady) {
    updateTitleBubble();
    return;
  }
  if (titleBubbleShowTimer !== null) return;
  clearTitleBubbleShowTimer();
  titleBubbleShowTimer = window.setTimeout(() => {
    titleBubbleShowTimer = null;
    titleBubbleReady = true;
    updateTitleBubble();
  }, TITLE_BUBBLE_SHOW_DELAY_MS);
}

function scheduleTitleBubbleHide() {
  clearTitleBubbleShowTimer();
  clearTitleBubbleHideTimer();
  if (titleBubbleTitleHover || titleBubbleBubbleHover || titleBubbleFocus || titleCopyToastVisible || titleTextSelectionActive || titleCopyInteraction) return;
  titleBubbleHideTimer = window.setTimeout(() => {
    titleBubbleHideTimer = null;
    if (!titleBubbleTitleHover && !titleBubbleBubbleHover && !titleBubbleFocus && !titleCopyToastVisible && !titleTextSelectionActive && !titleCopyInteraction) {
      titleBubbleReady = false;
      updateTitleBubble();
    }
  }, TITLE_BUBBLE_HIDE_DELAY_MS);
}

function resetTitleBubble() {
  clearTitleBubbleShowTimer();
  clearTitleBubbleHideTimer();
  titleBubbleTitleHover = false;
  titleBubbleBubbleHover = false;
  titleBubbleFocus = false;
  titleBubbleReady = false;
  titleCopyInteraction = null;
  titleTextSelectionActive = false;
  titleCopyToastVisible = false;
  if (titleCopyClickTimer !== null) {
    window.clearTimeout(titleCopyClickTimer);
    titleCopyClickTimer = null;
  }
  if (titleCopyToastTimer !== null) {
    window.clearTimeout(titleCopyToastTimer);
    titleCopyToastTimer = null;
  }
  const elements = titleElements();
  if (!elements.bubble) return;
  const toast = elements.bubble.querySelector(".title-copy-toast");
  if (toast) {
    toast.classList.remove("is-visible");
    toast.setAttribute("aria-hidden", "true");
  }
  elements.bubble.classList.remove("is-visible");
  elements.bubble.hidden = true;
  elements.bubble.setAttribute("aria-hidden", "true");
}

function updateTitleOverflow() {
  titleMeasureTimer = null;
  const elements = titleElements();
  if (!elements.viewport || !elements.measure) return;
  const viewportWidth = elements.viewport.clientWidth;
  const measureRect = elements.measure.getBoundingClientRect();
  const measuredTitleWidth = Math.max(elements.measure.scrollWidth, measureRect.width);
  titleBubbleEligible = Boolean(viewportWidth) && measuredTitleWidth > viewportWidth + 1;
  if (!titleBubbleEligible) resetTitleBubble();
  updateTitleBubble();
}

function scheduleTitleOverflowCheck() {
  if (titleMeasureTimer !== null) return;
  titleMeasureTimer = window.setTimeout(updateTitleOverflow, 0);
}

function setVideoTitle(title) {
  const text = title || "No file";
  const elements = titleElements();
  if (!elements.viewport || !elements.text || !elements.measure) return;
  if (currentVideoTitle !== text) {
    resetTitleBubble();
    currentVideoTitle = text;
    elements.text.textContent = text;
    elements.measure.textContent = text;
    if (elements.bubble) {
      setTitleBubbleText(elements.bubble, text);
    }
  }
  elements.viewport.removeAttribute("title");
  elements.viewport.setAttribute("aria-label", text);
  elements.viewport.dataset.fullTitle = text;
  scheduleTitleOverflowCheck();
}

function setTitleBubbleText(bubble, text) {
  if (!bubble) return;
  let textElement = bubble.querySelector(".video-title-bubble-text");
  if (!textElement) {
    textElement = document.createElement("span");
    textElement.className = "video-title-bubble-text";
    bubble.insertBefore(textElement, bubble.firstChild);
  }
  textElement.textContent = text;
}

function showTitleCopyToast() {
  const bubble = titleElements().bubble;
  if (!bubble) return;
  let toast = bubble.querySelector(".title-copy-toast");
  if (!toast) {
    toast = document.createElement("span");
    toast.className = "title-copy-toast";
    toast.textContent = "Copied!";
    toast.setAttribute("aria-hidden", "true");
    toast.setAttribute("role", "status");
    bubble.appendChild(toast);
  }
  if (titleCopyToastTimer !== null) {
    window.clearTimeout(titleCopyToastTimer);
    titleCopyToastTimer = null;
  }
  titleCopyToastVisible = true;
  titleBubbleReady = true;
  updateTitleBubble();
  toast.setAttribute("aria-hidden", "false");
  toast.classList.remove("is-visible");
  void toast.offsetWidth;
  window.requestAnimationFrame(() => {
    toast.classList.add("is-visible");
  });
  titleCopyToastTimer = window.setTimeout(() => {
    titleCopyToastTimer = null;
    toast.classList.remove("is-visible");
    toast.setAttribute("aria-hidden", "true");
    titleCopyToastVisible = false;
    updateTitleBubble();
  }, TITLE_COPY_TOAST_VISIBLE_MS);
}

async function copyTextToClipboard(text) {
  const value = String(text || "");
  if (!value) return false;
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (error) {
      console.error("[ClipMaker UI] clipboard write failed", error);
    }
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    return ok;
  } catch (error) {
    console.error("[ClipMaker UI] clipboard fallback failed", error);
    return false;
  }
}

function titleSelectionIsNonCollapsed() {
  const selection = window.getSelection && window.getSelection();
  return Boolean(selection && !selection.isCollapsed && String(selection).length > 0);
}

function titleSelectionIntersectsSource() {
  const selection = window.getSelection && window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount < 1) return false;
  const range = selection.getRangeAt(0);
  const elements = titleElements();
  return [elements.viewport, elements.bubble].some((element) => {
    if (!element) return false;
    try {
      return element.contains(range.commonAncestorContainer) || range.intersectsNode(element);
    } catch (error) {
      return false;
    }
  });
}

function clearTitleCopyClickTimer() {
  if (titleCopyClickTimer === null) return;
  window.clearTimeout(titleCopyClickTimer);
  titleCopyClickTimer = null;
}

function titleCopyGestureIsQuick(interaction, event) {
  if (!interaction || !event || interaction.pointerId !== event.pointerId) return false;
  const endTime = Number(event.timeStamp);
  const elapsed = Number.isFinite(endTime)
    ? Math.max(0, endTime - interaction.startedAt)
    : TITLE_COPY_QUICK_CLICK_MAX_MS + 1;
  return !interaction.moved && elapsed <= TITLE_COPY_QUICK_CLICK_MAX_MS;
}

function handleTitleCopyPointerDown(event) {
  clearTitleCopyClickTimer();
  if (!event || event.button !== 0 || event.isPrimary === false) {
    titleCopyInteraction = null;
    return;
  }
  titleCopyInteraction = {
    pointerId: event.pointerId,
    startedAt: Number(event.timeStamp) || 0,
    startX: Number(event.clientX) || 0,
    startY: Number(event.clientY) || 0,
    moved: false,
  };
  clearTitleBubbleHideTimer();
  updateTitleBubble();
}

function handleTitleCopyPointerMove(event) {
  const interaction = titleCopyInteraction;
  if (!interaction || !event || interaction.pointerId !== event.pointerId) return;
  const deltaX = (Number(event.clientX) || 0) - interaction.startX;
  const deltaY = (Number(event.clientY) || 0) - interaction.startY;
  if (Math.hypot(deltaX, deltaY) >= TITLE_COPY_DRAG_THRESHOLD_PX) interaction.moved = true;
}

function handleTitleCopyPointerEnd(event) {
  const interaction = titleCopyInteraction;
  titleCopyInteraction = null;
  if (!titleCopyGestureIsQuick(interaction, event) || titleSelectionIsNonCollapsed()) {
    scheduleTitleBubbleHide();
    return;
  }
  clearTitleCopyClickTimer();
  titleCopyClickTimer = window.setTimeout(() => {
    titleCopyClickTimer = null;
    if (titleSelectionIsNonCollapsed()) return;
    copyTextToClipboard(currentVideoTitle).then((ok) => {
      if (ok) showTitleCopyToast();
    });
  }, TITLE_COPY_SINGLE_CLICK_DELAY_MS);
}

function cancelTitleCopyGesture() {
  titleCopyInteraction = null;
  clearTitleCopyClickTimer();
}

function handleTitleSelectionChange() {
  const nextActive = titleSelectionIntersectsSource();
  titleTextSelectionActive = nextActive;
  if (nextActive) {
    clearTitleCopyClickTimer();
    clearTitleBubbleHideTimer();
  }
  updateTitleBubble();
  if (!nextActive) scheduleTitleBubbleHide();
}

function bindTitleCopySource(source) {
  if (!source) return;
  source.addEventListener("pointerdown", handleTitleCopyPointerDown);
  source.addEventListener("pointermove", handleTitleCopyPointerMove);
  source.addEventListener("pointerup", handleTitleCopyPointerEnd);
  source.addEventListener("pointercancel", cancelTitleCopyGesture);
  source.addEventListener("dblclick", cancelTitleCopyGesture);
}

function observeTitleResize() {
  const elements = titleElements();
  if (!elements.viewport || titleResizeObserver || typeof ResizeObserver === "undefined") return;
  titleResizeObserver = new ResizeObserver(scheduleTitleOverflowCheck);
  titleResizeObserver.observe(elements.viewport);
  if (elements.wrapper && elements.wrapper !== elements.viewport) {
    titleResizeObserver.observe(elements.wrapper);
  }
}

function bindTitleBubble() {
  const elements = titleElements();
  const target = elements.viewport || elements.wrapper;
  if (!target) return;
  target.tabIndex = 0;
  target.addEventListener("mouseenter", () => {
    titleBubbleTitleHover = true;
    clearTitleBubbleHideTimer();
    scheduleTitleBubbleShow();
  });
  target.addEventListener("mouseleave", () => {
    titleBubbleTitleHover = false;
    scheduleTitleBubbleHide();
  });
  target.addEventListener("focus", () => {
    titleBubbleFocus = true;
    clearTitleBubbleHideTimer();
    scheduleTitleBubbleShow();
  });
  target.addEventListener("blur", () => {
    titleBubbleFocus = false;
    scheduleTitleBubbleHide();
  });
  bindTitleCopySource(target);
  if (elements.bubble) {
    elements.bubble.addEventListener("mouseenter", () => {
      titleBubbleBubbleHover = true;
      clearTitleBubbleHideTimer();
      titleBubbleReady = true;
      updateTitleBubble();
    });
    elements.bubble.addEventListener("mouseleave", () => {
      titleBubbleBubbleHover = false;
      scheduleTitleBubbleHide();
    });
    bindTitleCopySource(elements.bubbleText || elements.bubble);
  }
  window.addEventListener("pointermove", handleTitleCopyPointerMove);
  window.addEventListener("pointerup", handleTitleCopyPointerEnd);
  window.addEventListener("pointercancel", cancelTitleCopyGesture);
  document.addEventListener("selectionchange", handleTitleSelectionChange);
}

function rpcClient(iinaModule) {
  const pendingCalls = new Map();

  function invoke(name, args) {
    return new Promise((resolve) => {
      iinaModule.onMessage(`#on.${name}`, function (message) {
        iinaModule.onMessage(`#on.${name}`, null);
        resolve(message ? message.res : undefined);
      });
      iinaModule.postMessage(`#call.${name}`, { args });
    });
  }

  return new Proxy({}, {
    set(target, name, value) {
      if (typeof value !== "function") {
        throw new Error("RPC server only accepts functions");
      }
      if (!name.startsWith("$")) {
        throw new Error("Define RPC functions with $ prefix");
      }

      target[name] = value;
      iinaModule.onMessage(`#call.${name}`, async function (message) {
        const args = message && Array.isArray(message.args) ? message.args : [];
        let result = value.apply(null, args);
        if (result instanceof Promise) {
          result = await result;
        }
        iinaModule.postMessage(`#on.${name}`, { res: result });
      });
      return true;
    },
    get(target, name) {
      if (typeof name !== "string" || !name.startsWith("$")) {
        return target[name];
      }

      return function (...args) {
        const previous = pendingCalls.get(name) || Promise.resolve();
        const current = previous.catch(() => undefined).then(() => invoke(name, args));
        const tracked = current.finally(() => {
          if (pendingCalls.get(name) === tracked) pendingCalls.delete(name);
        });
        pendingCalls.set(name, tracked);
        return tracked;
      };
    }
  });
}

function hasIinaBridge() {
  return Boolean(
    typeof iina !== "undefined" &&
    iina &&
    typeof iina.postMessage === "function" &&
    typeof iina.onMessage === "function"
  );
}

function pad(number, size) {
  let text = String(number);
  while (text.length < size) text = `0${text}`;
  return text;
}

function normalizeDisplayFps(fps) {
  const number = Number(fps);
  if (!Number.isFinite(number) || number <= 0) return 30;
  return Math.min(240, Math.max(1, Math.round(number)));
}

function absoluteDisplayFrameIndex(seconds, fps) {
  const displayFps = normalizeDisplayFps(fps);
  const safe = Math.max(0, Number(seconds) || 0);
  return Math.max(0, Math.floor((safe * displayFps) + 0.000001));
}

function absoluteFrameToTimecode(seconds, fps) {
  const displayFps = normalizeDisplayFps(fps);
  const absoluteFrame = absoluteDisplayFrameIndex(seconds, displayFps);
  const totalSeconds = Math.floor(absoluteFrame / displayFps);
  return {
    displayFps,
    frame: absoluteFrame % displayFps,
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    wholeSeconds: totalSeconds % 60
  };
}

function timecodeToAbsoluteFrame(hours, minutes, seconds, frames, fps) {
  const displayFps = normalizeDisplayFps(fps);
  const safeHours = Math.max(0, Math.floor(Number(hours) || 0));
  const safeMinutes = Math.max(0, Math.floor(Number(minutes) || 0));
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const safeFrames = Math.max(0, Math.floor(Number(frames) || 0));
  return (((safeHours * 60) + safeMinutes) * 60 + safeSeconds) * displayFps + safeFrames;
}

function timeParts(seconds, fps) {
  return absoluteFrameToTimecode(seconds, fps);
}

function durationParts(seconds, fps) {
  return absoluteFrameToTimecode(seconds, fps);
}

function displayedRangeSeconds(inPoint, outPoint, fps) {
  if (!hasTimeMark(inPoint) || !hasTimeMark(outPoint) || outPoint < inPoint) return null;
  const displayFps = normalizeDisplayFps(fps);
  const inFrame = absoluteDisplayFrameIndex(inPoint, displayFps);
  const outFrame = absoluteDisplayFrameIndex(outPoint, displayFps);
  return Math.max(0, outFrame - inFrame) / displayFps;
}

function formatTimecode(seconds, fps) {
  if (typeof seconds !== "number" || !isFinite(seconds)) return "--:--:--:--";
  const { frame, hours, minutes, wholeSeconds } = timeParts(seconds, fps);
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(wholeSeconds, 2)}:${pad(frame, 2)}`;
}

function formatDurationTimecode(seconds, fps) {
  if (typeof seconds !== "number" || !isFinite(seconds)) return "--:--:--:--";
  const { frame, hours, minutes, wholeSeconds } = durationParts(seconds, fps);
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(wholeSeconds, 2)}:${pad(frame, 2)}`;
}

function formatFrame(frame, fps) {
  return normalizeDisplayFps(fps) >= 10 ? pad(frame, 2) : String(frame);
}

function formatFrameTimecode(seconds, fps) {
  if (typeof seconds !== "number" || !isFinite(seconds)) return "--";
  const { displayFps, frame, hours, minutes, wholeSeconds } = timeParts(seconds, fps);
  const frameText = `${formatFrame(frame, displayFps)}f`;

  if (hours > 0) {
    return `${hours}h ${pad(minutes, 2)}m ${pad(wholeSeconds, 2)}s ${frameText}`;
  }
  if (minutes > 0) {
    return `${minutes}m ${pad(wholeSeconds, 2)}s ${frameText}`;
  }
  return `${wholeSeconds}s ${frameText}`;
}

function formatFrameRangeDuration(seconds, fps) {
  if (typeof seconds !== "number" || !isFinite(seconds)) return "--";
  const { displayFps, frame, hours, minutes, wholeSeconds } = durationParts(seconds, fps);
  const parts = [];

  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(hours > 0 ? `${pad(minutes, 2)}m` : `${minutes}m`);
  if (wholeSeconds > 0) {
    parts.push((hours > 0 || minutes > 0) ? `${pad(wholeSeconds, 2)}s` : `${wholeSeconds}s`);
  }
  if (!parts.length) return `${frame}f`;
  if (frame > 0) parts.push(`${formatFrame(frame, displayFps)}f`);

  return parts.length ? parts.join(" ") : "0s";
}

function displayTime(seconds, fps) {
  if (typeof seconds !== "number" || !isFinite(seconds)) {
    return { text: "--", title: "" };
  }
  return { text: formatFrameTimecode(seconds, fps), title: formatTimecode(seconds, fps) };
}

function navigationFileIdFromState(state) {
  return String(state && state.currentFilePath || "");
}

function currentNavigationFileId() {
  return navigationFileIdFromState(latestState);
}

function updateNavigationBackButton() {
  const button = $("navigationBackButton");
  if (!button) return;
  const latestEntry = navigationHistory[navigationHistory.length - 1] || null;
  const currentFileId = currentNavigationFileId();
  const isAvailable = Boolean(
    latestEntry &&
    latestEntry.fileId &&
    latestEntry.fileId === currentFileId &&
    !navigationRestoreInFlight
  );

  button.disabled = !isAvailable;
  button.classList.toggle("is-available", isAvailable);
  button.setAttribute("aria-hidden", isAvailable ? "false" : "true");

  if (isAvailable) {
    const time = displayTime(latestEntry.position, currentDisplayFps()).text;
    const label = `Back to ${time}`;
    button.setAttribute("aria-label", label);
    button.setAttribute("data-back-label", label);
  } else {
    button.setAttribute("aria-label", "Back to previous timeline position");
    button.setAttribute("data-back-label", "");
  }
}

function syncNavigationHistoryFile(state) {
  const fileId = navigationFileIdFromState(state);
  if (navigationHistoryFileId === null) {
    navigationHistoryFileId = fileId;
  } else if (fileId !== navigationHistoryFileId) {
    navigationHistory = [];
    navigationHistoryFileId = fileId;
  }
  if (!fileId && navigationHistory.length) navigationHistory = [];
}

function appendNavigationPoint(point) {
  if (!point || !point.fileId || !hasTimeMark(point.position)) return false;
  const entry = {
    fileId: String(point.fileId),
    position: Math.max(0, Number(point.position)),
    paused: point.paused !== false,
    reason: String(point.reason || "timeline-jump"),
    createdAt: Number(point.createdAt) || Date.now()
  };
  const previous = navigationHistory[navigationHistory.length - 1] || null;
  if (
    previous &&
    previous.fileId === entry.fileId &&
    previous.paused === entry.paused &&
    Math.abs(previous.position - entry.position) <= NAVIGATION_HISTORY_DUPLICATE_TOLERANCE_SECONDS
  ) {
    return false;
  }
  navigationHistory.push(entry);
  if (navigationHistory.length > NAVIGATION_HISTORY_MAX_ENTRIES) {
    navigationHistory = navigationHistory.slice(-NAVIGATION_HISTORY_MAX_ENTRIES);
  }
  navigationHistoryFileId = entry.fileId;
  updateNavigationBackButton();
  return true;
}

async function pushNavigationPoint(reason) {
  try {
    if (!rpc || typeof rpc.$getNavigationSnapshot !== "function") return false;
    const snapshot = await rpc.$getNavigationSnapshot();
    if (!snapshot || snapshot.ok === false || !snapshot.fileId || !hasTimeMark(snapshot.position)) {
      return false;
    }
    return appendNavigationPoint({
      fileId: snapshot.fileId,
      position: snapshot.position,
      paused: snapshot.paused,
      reason,
      createdAt: Date.now()
    });
  } catch (error) {
    console.error("[ClipMaker UI] navigation snapshot failed", error);
    return false;
  }
}

async function restoreNavigationBack(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  if (navigationRestoreInFlight) return;
  const point = navigationHistory[navigationHistory.length - 1] || null;
  if (!point) return;
  if (!rpc || typeof rpc.$restoreNavigationPoint !== "function") {
    return;
  }

  navigationRestoreInFlight = true;
  updateNavigationBackButton();
  try {
    const state = await rpc.$restoreNavigationPoint(point);
    if (!state || state.ok === false) {
      return;
    }
    navigationHistory.pop();
    renderState(state);
  } catch (error) {
    console.error("[ClipMaker UI] navigation restore failed", error);
  } finally {
    navigationRestoreInFlight = false;
    updateNavigationBackButton();
  }
}

function displayRangeDuration(seconds, fps) {
  if (typeof seconds !== "number" || !isFinite(seconds)) {
    return { text: "--", title: "" };
  }
  return { text: formatFrameRangeDuration(seconds, fps), title: formatDurationTimecode(seconds, fps) };
}

function setTimeElement(id, seconds, fps) {
  const element = $(id);
  if (!element) return;
  const time = displayTime(seconds, fps);
  element.textContent = time.text;
  element.removeAttribute("title");
}

function setMarkTimeElement(markName, seconds, fps) {
  const id = markElementId(markName);
  setTimeElement(id, seconds, fps);
}

function setRangeElement(seconds, fps) {
  const element = $("rangeValue");
  if (!element) return;
  const time = displayRangeDuration(seconds, fps);
  element.textContent = time.text;
  element.removeAttribute("title");
}

function clockNowMs() {
  if (window.performance && typeof window.performance.now === "function") {
    return window.performance.now();
  }
  return Date.now();
}

function smoothPositionValue(nowMs) {
  if (typeof lastRealPositionSeconds !== "number" || !Number.isFinite(lastRealPositionSeconds)) {
    return null;
  }
  if (!smoothPositionPlaying) return lastRealPositionSeconds;
  const elapsedSeconds = Math.max(0, ((nowMs || clockNowMs()) - lastSyncWallClockMs) / 1000);
  const estimatedPosition = lastRealPositionSeconds + (elapsedSeconds * smoothPlaybackRate);
  const minimumLaggedPosition = Math.max(0, lastRealPositionSeconds - POSITION_DISPLAY_SAFETY_LAG_SECONDS);
  const position = Math.max(
    minimumLaggedPosition,
    estimatedPosition - POSITION_DISPLAY_SAFETY_LAG_SECONDS
  );
  if (typeof smoothDurationSeconds === "number" && Number.isFinite(smoothDurationSeconds)) {
    return Math.min(position, smoothDurationSeconds);
  }
  return position;
}

function setPositionDisplay(seconds) {
  if (activeTimecodeEdit && activeTimecodeEdit.kind === "position") return;
  const element = $("positionValue");
  if (!element) return;
  const time = displayTime(seconds, smoothDisplayFps);
  const hasInlineEditor =
    element.classList.contains("is-editing") ||
    Boolean(element.querySelector && element.querySelector(".mark-edit-input"));
  if (
    !hasInlineEditor &&
    element.textContent === time.text &&
    time.text === lastPositionText &&
    time.title === lastPositionTitle
  ) {
    return;
  }
  element.textContent = time.text;
  element.removeAttribute("title");
  lastPositionText = time.text;
  lastPositionTitle = time.title;
  updatePositionValueState(seconds);
}

function updatePositionValueState(seconds) {
  const element = $("positionValue");
  if (!element) return;
  const editable = hasTimeMark(seconds);
  element.classList.toggle("is-editable", editable);
  element.classList.toggle("is-empty", !editable);
  element.setAttribute("aria-disabled", editable ? "false" : "true");
  element.setAttribute("aria-label", editable ? "Position, click to edit" : "Position unavailable");
}

function smoothPositionTickInterval(fps) {
  return clamp(Math.floor(1000 / normalizeDisplayFps(fps)), 16, 50);
}

function stopSmoothPositionTicker() {
  if (smoothPositionTimer !== null) {
    window.clearInterval(smoothPositionTimer);
    smoothPositionTimer = null;
  }
  smoothPositionTickMs = null;
}

function smoothPositionTick() {
  if (!smoothPositionPlaying) {
    stopSmoothPositionTicker();
    return;
  }
  const position = smoothPositionValue(clockNowMs());
  if (position !== null) setPositionDisplay(position);
}

function startSmoothPositionTicker() {
  const tickMs = smoothPositionTickInterval(smoothDisplayFps);
  if (smoothPositionTimer !== null && smoothPositionTickMs === tickMs) return;
  stopSmoothPositionTicker();
  smoothPositionTickMs = tickMs;
  smoothPositionTimer = window.setInterval(smoothPositionTick, tickMs);
}

function updateSmoothPositionSync(state, fps) {
  const realPosition = Number(state.positionSeconds);
  smoothDisplayFps = normalizeDisplayFps(fps);
  const durationSeconds = Number(state.durationSeconds);
  smoothDurationSeconds = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : null;

  if (!Number.isFinite(realPosition)) {
    lastRealPositionSeconds = null;
    smoothPositionPlaying = false;
    lastPositionText = "";
    lastPositionTitle = "";
    stopSmoothPositionTicker();
    setPositionDisplay(null);
    return;
  }

  const nowMs = clockNowMs();
  const previousDisplayPosition = smoothPositionValue(nowMs);
  const speed = Number(state.playbackSpeed);
  smoothPlaybackRate = Number.isFinite(speed) && speed > 0 ? speed : 1;
  smoothPositionPlaying = state.paused === false && state.canUsePrecisionControls !== false;
  lastRealPositionSeconds = realPosition;
  lastSyncWallClockMs = nowMs;

  const drift = previousDisplayPosition === null ? Infinity : Math.abs(previousDisplayPosition - realPosition);
  const action = String(state.lastAction || "");
  const actionNeedsExactSync = action.startsWith("stepped ") || action.startsWith("playback ");
  const shouldRenderExact = actionNeedsExactSync || !smoothPositionPlaying || drift > 0.15 || !lastPositionText;
  if (shouldRenderExact) setPositionDisplay(realPosition);

  if (smoothPositionPlaying) {
    startSmoothPositionTicker();
  } else {
    stopSmoothPositionTicker();
  }

}

function selectedIdsFromState(state) {
  if (state && Array.isArray(state.selectedClipIds)) {
    return state.selectedClipIds.slice();
  }
  const clips = state && Array.isArray(state.clips) ? state.clips : [];
  return clips.filter((clip) => clip.selected).map((clip) => clip.id);
}

function hasTimeMark(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function markPointName(markName) {
  return markName === "out" ? "outPoint" : "inPoint";
}

function markElementId(markName) {
  return markName === "out" ? "outValue" : "inValue";
}

function markLabel(markName) {
  return markName === "out" ? "Out" : "In";
}

function currentDisplayFps() {
  return normalizeDisplayFps(latestState && (latestState.displayFps || latestState.fps) || smoothDisplayFps || 30);
}

function getTimecodeScrollDirectionMultiplier() {
  return latestState && latestState.invertTimecodeScrolling ? -1 : 1;
}

function getTimecodeDragDirectionMultiplier() {
  return latestState && latestState.invertTimecodeDragging ? -1 : 1;
}

function normalizeSensitivityLevel(value) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return TIMECODE_SENSITIVITY_DEFAULT_LEVEL;
  return clamp(parsed, 1, 5);
}

function getTimecodeScrollPixelsPerStep(level) {
  return TIMECODE_SCROLL_PIXELS_PER_STEP[normalizeSensitivityLevel(level)] || HORIZONTAL_WHEEL_PIXELS_PER_STEP;
}

function getTimecodeDragPixelsPerFrame(level) {
  return TIMECODE_DRAG_PIXELS_PER_FRAME[normalizeSensitivityLevel(level)] || DRAG_PIXELS_PER_FRAME;
}

function currentTimecodeScrollSensitivity() {
  return normalizeSensitivityLevel(latestState && latestState.timecodeScrollSensitivity);
}

function currentTimecodeDragSensitivity() {
  return normalizeSensitivityLevel(latestState && latestState.timecodeDragSensitivity);
}

function durationLimitSeconds() {
  const duration = Number(latestState && latestState.durationSeconds);
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

function manualTimecodeWholeSeconds(kind, markName, seconds) {
  const requested = Number(seconds);
  let value = Number.isFinite(requested) ? Math.max(0, Math.floor(requested)) : 0;
  const duration = durationLimitSeconds();
  let lowerBound = 0;
  let upperBound = duration !== null ? Math.max(0, Math.floor(duration)) : Number.MAX_SAFE_INTEGER;

  if (kind === "mark" && markName === "in" && hasTimeMark(latestState && latestState.outPoint)) {
    upperBound = Math.min(upperBound, Math.max(0, Math.floor(latestState.outPoint)));
  } else if (kind === "mark" && markName === "out" && hasTimeMark(latestState && latestState.inPoint)) {
    lowerBound = Math.max(0, Math.ceil(latestState.inPoint));
  }

  // A fractional mark at the very end can leave no whole-second value satisfying
  // both bounds. Preserve the media boundary and the manual editor's 00f contract.
  if (lowerBound > upperBound) return upperBound;
  value = Math.max(lowerBound, Math.min(value, upperBound));
  return value;
}

function clampEditedMark(markName, seconds) {
  let value = Math.max(0, Number(seconds));
  const duration = durationLimitSeconds();
  if (duration !== null) value = Math.min(value, duration);

  const inPoint = latestState && latestState.inPoint;
  const outPoint = latestState && latestState.outPoint;
  if (markName === "in" && hasTimeMark(outPoint)) {
    value = Math.min(value, outPoint);
  } else if (markName === "out" && hasTimeMark(inPoint)) {
    value = Math.max(value, inPoint);
  }
  return value;
}

function clampedMarkFromPoints(markName, seconds, inPoint, outPoint) {
  let value = Math.max(0, Number(seconds));
  const duration = durationLimitSeconds();
  if (duration !== null) value = Math.min(value, duration);

  if (markName === "in" && hasTimeMark(outPoint)) {
    value = Math.min(value, outPoint);
  } else if (markName === "out" && hasTimeMark(inPoint)) {
    value = Math.max(value, inPoint);
  }
  return value;
}

function sanitizeReverseTimeDigits(value) {
  return String(value || "").replace(/\D+/g, "").slice(0, TIMECODE_EDIT_MAX_DIGITS);
}

function parseReverseTimeDigits(rawDigits) {
  const digits = sanitizeReverseTimeDigits(rawDigits);
  if (!digits) return null;
  const seconds = Number(digits.slice(0, 2)) || 0;
  const minutes = Number(digits.slice(2, 4)) || 0;
  const hours = Number(digits.slice(4, 6)) || 0;
  return {
    seconds,
    minutes,
    hours,
    totalSeconds: (hours * 3600) + (minutes * 60) + seconds
  };
}

function getTimeInputSlots(rawDigits) {
  const digits = sanitizeReverseTimeDigits(rawDigits);
  const pair = (start) => [digits[start] || null, digits[start + 1] || null];
  return {
    seconds: pair(0),
    minutes: pair(2),
    hours: pair(4)
  };
}

function timecodeGroupDigitCount(rawDigits, start) {
  return sanitizeReverseTimeDigits(rawDigits).slice(start, start + 2).length;
}

function timecodeCaretColumn(rawDigits) {
  return [1, 2, 4, 5, 7, 8, 10][sanitizeReverseTimeDigits(rawDigits).length];
}

function reverseTimeDigitsFromNormalizedParts(parts) {
  const seconds = Math.max(0, Math.min(59, Number(parts && parts.wholeSeconds) || 0));
  const minutes = Math.max(0, Math.min(59, Number(parts && parts.minutes) || 0));
  const hours = Math.max(0, Math.min(99, Number(parts && parts.hours) || 0));
  const secondsText = seconds < 10 ? String(seconds) : pad(seconds, 2);
  if (hours > 0) return `${pad(seconds, 2)}${pad(minutes, 2)}${pad(hours, 2)}`;
  if (minutes > 0) return `${pad(seconds, 2)}${pad(minutes, 2)}`;
  return secondsText;
}

function parseStandardTimecodePaste(text, fps) {
  const source = String(text || "").trim();
  if (!/^\d+\s*(?::\s*\d+\s*){1,3}$/.test(source)) return null;
  const values = source.split(":").map((part) => Number(part.trim()));
  if (values.some((value) => !Number.isFinite(value) || value < 0)) return null;

  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  let frames = 0;
  if (values.length === 2) [minutes, seconds] = values;
  if (values.length === 3) [hours, minutes, seconds] = values;
  if (values.length === 4) [hours, minutes, seconds, frames] = values;

  const displayFps = normalizeDisplayFps(fps);
  const absoluteFrame = timecodeToAbsoluteFrame(hours, minutes, seconds, frames, displayFps);
  const totalSeconds = absoluteFrame / displayFps;
  return {
    rawDigits: reverseTimeDigitsFromNormalizedParts(absoluteFrameToTimecode(totalSeconds, displayFps)),
    totalSeconds
  };
}

function parsePastedTimeInput(text, fps) {
  const standard = parseStandardTimecodePaste(text, fps);
  if (standard) return standard;
  return {
    rawDigits: sanitizeReverseTimeDigits(text),
    totalSeconds: null
  };
}

function describeReverseTimeDigits(rawDigits) {
  const parsed = parseReverseTimeDigits(rawDigits);
  if (!parsed) return "No time entered";
  const parts = [];
  if (parsed.seconds || (!parsed.minutes && !parsed.hours)) parts.push(`${parsed.seconds} seconds`);
  if (parsed.minutes) parts.push(`${parsed.minutes} minutes`);
  if (parsed.hours) parts.push(`${parsed.hours} hours`);
  return parts.join(", ");
}

function timecodeEditWidthPx(element) {
  if (!element) return 0;
  const computed = window.getComputedStyle ? window.getComputedStyle(element) : null;
  const computedWidth = computed ? Number.parseFloat(computed.width) : NaN;
  if (Number.isFinite(computedWidth) && computedWidth > 0) return computedWidth;
  const rect = element.getBoundingClientRect ? element.getBoundingClientRect() : null;
  return rect && Number.isFinite(rect.width) ? rect.width : 0;
}

function validatedTimecodeEditSeconds(rawDigits, fps, pastedSecondsOverride = null) {
  const parsed = parseReverseTimeDigits(rawDigits);
  const requested = Number.isFinite(pastedSecondsOverride)
    ? Math.max(0, pastedSecondsOverride)
    : parsed ? parsed.totalSeconds : 0;
  const wholeSeconds = Math.max(0, Math.floor(requested));
  const duration = durationLimitSeconds();
  return duration !== null ? Math.min(wholeSeconds, Math.max(0, Math.floor(duration))) : wholeSeconds;
}

function renderMarkValue(markName, seconds, fps) {
  if (editingMarkName === markName) return;
  if (markDragState && markDragState.markName === markName) return;
  const element = $(markElementId(markName));
  if (!element) return;
  setMarkTimeElement(markName, seconds, fps);
  const hasValue = hasTimeMark(seconds);
  element.classList.add("is-editable", "mark-value-interactive");
  element.classList.toggle("is-empty", !hasValue);
  element.setAttribute("aria-disabled", "false");
  element.setAttribute(
    "aria-label",
    hasValue
      ? `${markLabel(markName)} mark, click to edit or drag to adjust`
      : `${markLabel(markName)} mark not set, click to enter manually`
  );
  if (!hasValue) resetMarkWheelAccumulator(markName);
}

function renderRangeValue(inPoint, outPoint, fps) {
  const range = displayedRangeSeconds(inPoint, outPoint, fps);
  setRangeElement(range, fps);
}

function applyMarkValue(markName, seconds, shouldSeek) {
  if (!rpc || typeof rpc.$setMarkTime !== "function") {
    return;
  }
  const value = clampEditedMark(markName, seconds);
  callAction(() => rpc.$setMarkTime(markName, value, Boolean(shouldSeek)));
}

function applyMarkValueOnly(markName, seconds) {
  applyMarkValue(markName, seconds, false);
}

function applyPositionValue(seconds) {
  if (!rpc || typeof rpc.$setPositionTime !== "function") {
    return;
  }
  const duration = durationLimitSeconds();
  let value = Math.max(0, Number(seconds));
  if (duration !== null) value = Math.min(value, duration);
  callAction(() => rpc.$setPositionTime(value));
}

function clearMarkEditUndo() {
  markEditUndo = null;
  if (markEditUndoTimer !== null) {
    window.clearTimeout(markEditUndoTimer);
    markEditUndoTimer = null;
  }
  updateMarkEditUndoButton();
}

function updateMarkEditUndoButton() {
  const button = $("markEditUndoButton");
  if (!button) return;
  const isAvailable = Boolean(
    markEditUndo &&
    markEditUndo.fileId &&
    markEditUndo.fileId === currentNavigationFileId()
  );
  button.hidden = !isAvailable;
  button.disabled = !isAvailable;
  button.classList.toggle("is-available", isAvailable);
  button.setAttribute("aria-hidden", isAvailable ? "false" : "true");

  if (isAvailable) {
    const label = `Undo ${markLabel(markEditUndo.markName)} edit`;
    button.setAttribute("aria-label", label);
    button.setAttribute("data-back-label", label);
  } else {
    button.setAttribute("aria-label", "Undo mark edit");
    button.setAttribute("data-back-label", "");
  }
}

function showMarkEditUndo(markName, previousValue, nextValue) {
  if (!hasTimeMark(previousValue) || !hasTimeMark(nextValue) || previousValue === nextValue) {
    clearMarkEditUndo();
    return;
  }
  if (markEditUndoTimer !== null) {
    window.clearTimeout(markEditUndoTimer);
    markEditUndoTimer = null;
  }
  markEditUndo = {
    markName,
    previousValue,
    nextValue,
    fileId: currentNavigationFileId()
  };
  updateMarkEditUndoButton();
  markEditUndoTimer = window.setTimeout(() => {
    markEditUndoTimer = null;
    clearMarkEditUndo();
  }, MARK_UNDO_VISIBLE_MS);
}

function undoLastManualMarkEdit() {
  if (!markEditUndo || markEditUndo.fileId !== currentNavigationFileId()) {
    clearMarkEditUndo();
    return;
  }
  const undo = markEditUndo;
  clearMarkEditUndo();
  if (latestState) latestState[markPointName(undo.markName)] = undo.previousValue;
  const inPoint = undo.markName === "in" ? undo.previousValue : latestState && latestState.inPoint;
  const outPoint = undo.markName === "out" ? undo.previousValue : latestState && latestState.outPoint;
  renderMarkValue(undo.markName, undo.previousValue, currentDisplayFps());
  renderRangeValue(inPoint, outPoint, currentDisplayFps());
  applyMarkValueOnly(undo.markName, undo.previousValue);
}

function resetMarkWheelAccumulator(markName) {
  if (markName === "in" || markName === "out") {
    markWheelAccumulator[markName] = 0;
    if (markWheelActiveMark === markName) markWheelActiveMark = null;
  } else {
    markWheelAccumulator.in = 0;
    markWheelAccumulator.out = 0;
    markWheelActiveMark = null;
  }
  if (markWheelIdleTimer !== null) {
    window.clearTimeout(markWheelIdleTimer);
    markWheelIdleTimer = null;
  }
}

function resetMarkWheelGesture() {
  markWheelGestureDirection = null;
  markWheelGestureAccumulatedX = 0;
  markWheelGestureAccumulatedY = 0;
  markWheelGestureMarkName = null;
  if (markWheelGestureEndTimer !== null) {
    window.clearTimeout(markWheelGestureEndTimer);
    markWheelGestureEndTimer = null;
  }
}

function scheduleMarkWheelGestureReset() {
  if (markWheelGestureEndTimer !== null) window.clearTimeout(markWheelGestureEndTimer);
  markWheelGestureEndTimer = window.setTimeout(() => {
    markWheelGestureEndTimer = null;
    markWheelGestureDirection = null;
    markWheelGestureAccumulatedX = 0;
    markWheelGestureAccumulatedY = 0;
    markWheelGestureMarkName = null;
  }, WHEEL_GESTURE_END_MS);
}

function scheduleMarkWheelAccumulatorReset(markName) {
  if (markWheelIdleTimer !== null) window.clearTimeout(markWheelIdleTimer);
  markWheelIdleTimer = window.setTimeout(() => {
    markWheelIdleTimer = null;
    resetMarkWheelAccumulator(markName);
  }, WHEEL_ACCUMULATOR_IDLE_RESET_MS);
}

function normalizedWheelDelta(value, event) {
  const delta = Number(value) || 0;
  if (event.deltaMode === 1) return delta * 16;
  if (event.deltaMode === 2) return delta * Math.max(1, window.innerWidth || 800);
  return delta;
}

function applyMarkHorizontalWheelDelta(markName, horizontalDelta, event) {
  const current = latestState && latestState[markPointName(markName)];
  if (!hasTimeMark(current)) return;

  if (markWheelActiveMark !== markName) {
    resetMarkWheelAccumulator(markWheelActiveMark);
    markWheelActiveMark = markName;
  }

  const pixelsPerStep = getTimecodeScrollPixelsPerStep(currentTimecodeScrollSensitivity());
  markWheelAccumulator[markName] += horizontalDelta;
  const steps = Math.trunc(markWheelAccumulator[markName] / pixelsPerStep);
  if (steps === 0) {
    scheduleMarkWheelAccumulatorReset(markName);
    return;
  }

  markWheelAccumulator[markName] -= steps * pixelsPerStep;
  const fps = currentDisplayFps();
  const framesPerStep = event.shiftKey ? 10 : 1;
  const deltaFrames = steps * framesPerStep * MARK_WHEEL_DELTA_DIRECTION * getTimecodeScrollDirectionMultiplier();
  const proposedValue = current + (deltaFrames / fps);
  const proposedIn = markName === "in" ? proposedValue : latestState && latestState.inPoint;
  const proposedOut = markName === "out" ? proposedValue : latestState && latestState.outPoint;
  const nextValue = clampedMarkFromPoints(markName, proposedValue, proposedIn, proposedOut);
  if (nextValue === current) {
    markWheelAccumulator[markName] = 0;
    scheduleMarkWheelAccumulatorReset(markName);
    return;
  }

  latestState[markPointName(markName)] = nextValue;
  const inPoint = markName === "in" ? nextValue : latestState && latestState.inPoint;
  const outPoint = markName === "out" ? nextValue : latestState && latestState.outPoint;
  setMarkTimeElement(markName, nextValue, fps);
  renderRangeValue(inPoint, outPoint, fps);
  applyMarkValueOnly(markName, nextValue);
  scheduleMarkWheelAccumulatorReset(markName);
}

function handleMarkHorizontalWheel(event) {
  if (event.target && event.target.closest && event.target.closest(".mark-edit-input")) return;
  if (editingMarkName || markDragState) return;

  const target = event.target && event.target.closest
    ? event.target.closest(".mark-value-interactive[data-mark]")
    : null;
  const targetMarkName = target && target.dataset ? target.dataset.mark : "";
  const markName = markWheelGestureMarkName || targetMarkName;
  if (markName !== "in" && markName !== "out") return;

  const deltaX = normalizedWheelDelta(event.deltaX, event);
  const deltaY = normalizedWheelDelta(event.deltaY, event);

  if (markWheelGestureDirection === null) {
    if (!targetMarkName) return;
    markWheelGestureMarkName = targetMarkName;
    markWheelGestureAccumulatedX += deltaX;
    markWheelGestureAccumulatedY += deltaY;

    const absX = Math.abs(markWheelGestureAccumulatedX);
    const absY = Math.abs(markWheelGestureAccumulatedY);
    const shiftHorizontal =
      event.shiftKey &&
      absY >= WHEEL_GESTURE_DIRECTION_THRESHOLD_PX &&
      absY >= absX;

    if (
      absX < WHEEL_GESTURE_DIRECTION_THRESHOLD_PX &&
      absY < WHEEL_GESTURE_DIRECTION_THRESHOLD_PX
    ) {
      scheduleMarkWheelGestureReset();
      return;
    }

    markWheelGestureDirection =
      shiftHorizontal || absX > absY * WHEEL_GESTURE_DIRECTION_DOMINANCE_RATIO
        ? "horizontal"
        : "vertical";
  }

  if (markWheelGestureDirection === "vertical") {
    scheduleMarkWheelGestureReset();
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const horizontalDelta = event.shiftKey ? deltaY : deltaX;
  if (Math.abs(horizontalDelta) >= HORIZONTAL_WHEEL_MIN_DELTA) {
    applyMarkHorizontalWheelDelta(markName, horizontalDelta, event);
  } else {
    scheduleMarkWheelAccumulatorReset(markName);
  }
  scheduleMarkWheelGestureReset();
}

function clearBrowserSelection() {
  const selection = window.getSelection && window.getSelection();
  if (selection && typeof selection.removeAllRanges === "function") selection.removeAllRanges();
}

function createTimecodeSuffixStates() {
  const states = {};
  TIMECODE_SUFFIX_DEFINITIONS.forEach(({ key }) => {
    states[key] = {
      visible: false,
      hasAppeared: false,
      appearTimer: null,
      disappearTimer: null
    };
  });
  return states;
}

function clearTimecodeSuffixTimer(state, timerName) {
  if (!state || state[timerName] === null) return;
  window.clearTimeout(state[timerName]);
  state[timerName] = null;
}

function cleanupTimecodeSuffixTimers(edit) {
  if (!edit || !edit.suffixStates) return;
  Object.values(edit.suffixStates).forEach((state) => {
    clearTimecodeSuffixTimer(state, "appearTimer");
    clearTimecodeSuffixTimer(state, "disappearTimer");
  });
}

function setTimecodeSuffixVisibility(edit, key, visible) {
  const state = edit && edit.suffixStates && edit.suffixStates[key];
  if (!state) return;
  state.visible = Boolean(visible);
  if (visible) state.hasAppeared = true;
  const node = edit.suffixNodes && edit.suffixNodes.get(key);
  if (node) node.classList.toggle("is-visible", state.visible);
}

function ensureTimecodeEditSlots(edit) {
  if (!edit || !edit.display || edit.slotsRoot) return;
  const root = document.createElement("span");
  root.className = "timecode-edit-slots";
  root.setAttribute("aria-hidden", "true");
  edit.digitNodes = new Map();
  edit.suffixNodes = new Map();

  TIMECODE_SUFFIX_DEFINITIONS.forEach(({ key, label, start }) => {
    const firstGridColumn = ((start / 2) * 3) + 1;
    for (let offset = 0; offset < 2; offset += 1) {
      const digit = document.createElement("span");
      digit.className = "timecode-edit-digit";
      digit.dataset.slot = `${key}-${offset + 1}`;
      digit.style.gridColumn = String(firstGridColumn + offset);
      digit.style.gridRow = "1";
      root.appendChild(digit);
      edit.digitNodes.set(start + offset, digit);
    }
    const suffix = document.createElement("span");
    suffix.className = "timecode-edit-suffix";
    suffix.textContent = label;
    suffix.style.gridColumn = String(firstGridColumn + 2);
    suffix.style.gridRow = "1";
    root.appendChild(suffix);
    edit.suffixNodes.set(key, suffix);
  });

  const caret = document.createElement("span");
  caret.className = "timecode-edit-caret";
  root.appendChild(caret);
  edit.caretNode = caret;
  edit.slotsRoot = root;
  edit.display.replaceChildren(root);
}

function updateTimecodeSuffixAnimations(edit) {
  if (!edit || edit.finished) return;
  ensureTimecodeEditSlots(edit);
  TIMECODE_SUFFIX_DEFINITIONS.forEach(({ key, start }) => {
    const state = edit.suffixStates[key];
    const count = timecodeGroupDigitCount(edit.rawDigits, start);

    if (count === 2) {
      clearTimecodeSuffixTimer(state, "disappearTimer");
      if (state.visible || state.appearTimer !== null) return;
      if (state.hasAppeared) {
        setTimecodeSuffixVisibility(edit, key, true);
        return;
      }
      state.appearTimer = window.setTimeout(() => {
        state.appearTimer = null;
        if (edit.finished || activeTimecodeEdit !== edit) return;
        if (timecodeGroupDigitCount(edit.rawDigits, start) === 2) {
          setTimecodeSuffixVisibility(edit, key, true);
        }
      }, TIMECODE_SUFFIX_APPEAR_DELAY_MS);
      return;
    }

    clearTimecodeSuffixTimer(state, "appearTimer");
    if (count === 1) {
      clearTimecodeSuffixTimer(state, "disappearTimer");
      if (state.hasAppeared && !state.visible) setTimecodeSuffixVisibility(edit, key, true);
      return;
    }

    if (!state.visible || state.disappearTimer !== null) return;
    state.disappearTimer = window.setTimeout(() => {
      state.disappearTimer = null;
      if (edit.finished || activeTimecodeEdit !== edit) return;
      if (timecodeGroupDigitCount(edit.rawDigits, start) === 0) {
        setTimecodeSuffixVisibility(edit, key, false);
      }
    }, TIMECODE_SUFFIX_DISAPPEAR_DELAY_MS);
  });
}

function renderActiveTimecodeEdit() {
  if (!activeTimecodeEdit || !activeTimecodeEdit.input) return;
  const edit = activeTimecodeEdit;
  const digits = sanitizeReverseTimeDigits(edit.rawDigits);
  const slots = getTimeInputSlots(digits);
  ensureTimecodeEditSlots(edit);

  edit.rawDigits = digits;
  edit.input.value = digits;
  edit.input.setAttribute("aria-valuetext", describeReverseTimeDigits(digits));
  edit.input.style.setProperty("--mark-editor-width", `${edit.editorWidthPx || 0}px`);
  if (edit.element) edit.element.style.setProperty("--mark-editor-width", `${edit.editorWidthPx || 0}px`);
  [...slots.seconds, ...slots.minutes, ...slots.hours].forEach((digit, index) => {
    const node = edit.digitNodes.get(index);
    if (node && node.textContent !== (digit || "")) node.textContent = digit || "";
  });
  TIMECODE_SUFFIX_DEFINITIONS.forEach(({ key }) => {
    setTimecodeSuffixVisibility(edit, key, edit.suffixStates[key].visible);
  });
  edit.caretNode.style.setProperty("--timecode-caret-column", String(timecodeCaretColumn(digits)));

  const position = edit.input.value.length;
  try {
    edit.input.setSelectionRange(position, position);
  } catch (error) {
    // Some WebViews can reject selection changes while focus is moving.
  }
}

function prefersReducedTimecodeMotion() {
  return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

function completeActiveTimecodeTransition() {
  if (!activeTimecodeTransition) return;
  const transition = activeTimecodeTransition;
  activeTimecodeTransition = null;
  if (transition.timer !== null) window.clearTimeout(transition.timer);
  transition.finalize();
}

function finishTimecodeEdit(apply, options = {}) {
  if (!activeTimecodeEdit || activeTimecodeEdit.finished) return false;
  const edit = activeTimecodeEdit;
  const hasValue = sanitizeReverseTimeDigits(edit.rawDigits).length > 0;
  if (apply && !hasValue) return false;

  const requested = apply
    ? validatedTimecodeEditSeconds(edit.rawDigits, edit.fps, edit.pastedSecondsOverride)
    : edit.originalValue;
  const finalValue = apply
    ? manualTimecodeWholeSeconds(edit.kind, edit.markName, requested)
    : requested;

  edit.finished = true;
  activeTimecodeEdit = null;
  cleanupTimecodeSuffixTimers(edit);
  clearBrowserSelection();
  edit.input.disabled = true;

  const incoming = document.createElement("span");
  incoming.className = "timecode-edit-committed";
  incoming.textContent = displayTime(finalValue, edit.fps).text;
  edit.element.appendChild(incoming);
  // Commit the initial opacity before starting the crossfade in the same task.
  if (edit.element.getBoundingClientRect) edit.element.getBoundingClientRect();
  edit.display.classList.add("is-exiting");
  edit.element.classList.add("is-timecode-transitioning");

  let finalized = false;
  const finalize = () => {
    if (finalized) return;
    finalized = true;
    edit.element.classList.remove("is-editing", "is-timecode-transitioning");
    edit.element.style.removeProperty("--mark-editor-width");
    if (edit.kind === "mark" && editingMarkName === edit.markName) editingMarkName = null;

    if (!apply) {
      renderState(latestState);
      return;
    }

    if (edit.kind === "position") {
      const duration = durationLimitSeconds();
      let value = Math.max(0, Number(finalValue));
      if (duration !== null) value = Math.min(value, duration);
      if (latestState) latestState.positionSeconds = value;
      setPositionDisplay(value);
      applyPositionValue(value);
      return;
    }

    if (latestState) latestState[markPointName(edit.markName)] = finalValue;
    const inPoint = edit.markName === "in" ? finalValue : latestState && latestState.inPoint;
    const outPoint = edit.markName === "out" ? finalValue : latestState && latestState.outPoint;
    renderMarkValue(edit.markName, finalValue, edit.fps);
    renderRangeValue(inPoint, outPoint, edit.fps);
    applyMarkValueOnly(edit.markName, finalValue);
    showMarkEditUndo(edit.markName, edit.originalValue, finalValue);
  };

  const duration = options.immediate || prefersReducedTimecodeMotion() ? 0 : TIMECODE_EDIT_TRANSITION_MS;
  const transition = { edit, finalize, timer: null };
  activeTimecodeTransition = transition;
  transition.timer = window.setTimeout(() => {
    if (activeTimecodeTransition === transition) activeTimecodeTransition = null;
    finalize();
  }, duration);
  return true;
}

function cancelActiveTimecodeEdit(options = {}) {
  const didFinish = finishTimecodeEdit(false, options);
  if (options.immediate && didFinish) completeActiveTimecodeTransition();
}

function finishTimecodeEditForInput(input, apply, options = {}) {
  if (!activeTimecodeEdit || activeTimecodeEdit.input !== input) return;
  finishTimecodeEdit(apply, options);
}

function handleTimecodeEditorPaste(event) {
  if (!activeTimecodeEdit) return;
  event.preventDefault();
  event.stopPropagation();
  const text = event.clipboardData && event.clipboardData.getData
    ? event.clipboardData.getData("text")
    : "";
  const parsed = parsePastedTimeInput(text, activeTimecodeEdit.fps);
  if (!parsed.rawDigits) return;
  const edit = activeTimecodeEdit;
  edit.rawDigits = parsed.rawDigits;
  edit.pastedSecondsOverride = parsed.totalSeconds;
  edit.replaceOnNextDigit = false;
  renderActiveTimecodeEdit();
  updateTimecodeSuffixAnimations(edit);
}

function appendTimecodeEditDigits(digits) {
  if (!activeTimecodeEdit) return false;
  const cleanDigits = sanitizeReverseTimeDigits(digits);
  if (cleanDigits.length === 0) return false;
  if (activeTimecodeEdit.replaceOnNextDigit) {
    activeTimecodeEdit.rawDigits = "";
    activeTimecodeEdit.replaceOnNextDigit = false;
  }
  const edit = activeTimecodeEdit;
  const available = TIMECODE_EDIT_MAX_DIGITS - edit.rawDigits.length;
  if (available <= 0) return false;
  edit.pastedSecondsOverride = null;
  edit.rawDigits = `${edit.rawDigits}${cleanDigits.slice(0, available)}`;
  renderActiveTimecodeEdit();
  updateTimecodeSuffixAnimations(edit);
  return true;
}

function removeProgressiveTimecodeDigit(rawDigits) {
  const digits = sanitizeReverseTimeDigits(rawDigits);
  return digits.slice(0, -1);
}

function handleTimecodeEditorBeforeInput(event) {
  if (!activeTimecodeEdit) return;
  event.preventDefault();
  event.stopPropagation();

  const pendingSkip = activeTimecodeEdit.skipNextBeforeInputText;
  if (pendingSkip) {
    const isMatchingKeydownInput =
      pendingSkip.text === event.data &&
      Number.isFinite(pendingSkip.at) &&
      Math.abs(event.timeStamp - pendingSkip.at) < 80;
    activeTimecodeEdit.skipNextBeforeInputText = null;
    if (isMatchingKeydownInput) return;
  }

  if (event.inputType === "insertText" || event.inputType === "insertCompositionText") {
    appendTimecodeEditDigits(event.data);
  }
}

function handleTimecodeEditorKeydown(event) {
  if (!activeTimecodeEdit) return;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
    event.preventDefault();
    event.stopPropagation();
    activeTimecodeEdit.replaceOnNextDigit = true;
    clearBrowserSelection();
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v") {
    return;
  }
  if (/^\d$/.test(event.key)) {
    event.preventDefault();
    event.stopPropagation();
    appendTimecodeEditDigits(event.key);
    activeTimecodeEdit.skipNextBeforeInputText = {
      text: event.key,
      at: event.timeStamp
    };
    return;
  }
  if (event.key === "Backspace") {
    event.preventDefault();
    event.stopPropagation();
    const edit = activeTimecodeEdit;
    edit.pastedSecondsOverride = null;
    edit.rawDigits = edit.replaceOnNextDigit ? "" : removeProgressiveTimecodeDigit(edit.rawDigits);
    edit.replaceOnNextDigit = false;
    renderActiveTimecodeEdit();
    updateTimecodeSuffixAnimations(edit);
    return;
  }
  if (event.key === "Delete") {
    event.preventDefault();
    event.stopPropagation();
    const edit = activeTimecodeEdit;
    edit.pastedSecondsOverride = null;
    edit.rawDigits = "";
    edit.replaceOnNextDigit = false;
    renderActiveTimecodeEdit();
    updateTimecodeSuffixAnimations(edit);
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    event.stopPropagation();
    finishTimecodeEdit(true);
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    finishTimecodeEdit(false);
    return;
  }
  if (
    event.key === " " ||
    event.key.startsWith("Arrow") ||
    event.key === "Home" ||
    event.key === "End" ||
    event.key === "PageUp" ||
    event.key === "PageDown" ||
    event.key === "Tab"
  ) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (event.key.length === 1) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function beginMarkEdit(markName) {
  completeActiveTimecodeTransition();
  resetMarkWheelAccumulator(markName);
  if (activeTimecodeEdit) cancelActiveTimecodeEdit({ immediate: true });
  const element = $(markElementId(markName));
  const current = latestState && latestState[markPointName(markName)];
  if (!element) {
    return;
  }
  const hadOriginalValue = hasTimeMark(current);
  const originalValue = hadOriginalValue ? current : null;
  const editorWidthPx = timecodeEditWidthPx(element);

  editingMarkName = markName;
  element.classList.add("is-editing");
  const input = document.createElement("input");
  input.className = "mark-edit-input mark-timecode-editor";
  input.type = "text";
  input.inputMode = "numeric";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("aria-label", `Enter ${markLabel(markName)} time: seconds, then minutes, then hours`);
  input.setAttribute("role", "textbox");
  const display = document.createElement("span");
  display.className = "mark-edit-display";
  display.setAttribute("aria-hidden", "true");

  activeTimecodeEdit = {
    kind: "mark",
    markName,
    element,
    input,
    display,
    hadOriginalValue,
    originalValue,
    rawDigits: "",
    pastedSecondsOverride: null,
    fps: currentDisplayFps(),
    editorWidthPx,
    suffixStates: createTimecodeSuffixStates(),
    digitNodes: null,
    suffixNodes: null,
    slotsRoot: null,
    caretNode: null,
    replaceOnNextDigit: false,
    skipNextBeforeInputText: null,
    finished: false
  };

  input.addEventListener("keydown", handleTimecodeEditorKeydown);
  input.addEventListener("paste", handleTimecodeEditorPaste);
  input.addEventListener("beforeinput", handleTimecodeEditorBeforeInput);
  input.addEventListener("mousedown", (event) => event.stopPropagation());
  input.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    renderActiveTimecodeEdit();
  });
  input.addEventListener("blur", () => finishTimecodeEditForInput(input, false));

  element.textContent = "";
  element.appendChild(input);
  element.appendChild(display);
  renderActiveTimecodeEdit();
  input.focus({ preventScroll: true });
  renderActiveTimecodeEdit();
  window.requestAnimationFrame(() => {
    if (!activeTimecodeEdit || activeTimecodeEdit.input !== input || activeTimecodeEdit.finished) return;
    if (document.activeElement !== input) input.focus({ preventScroll: true });
    renderActiveTimecodeEdit();
  });
}

function currentPositionEditValue() {
  const statePosition = Number(latestState && latestState.positionSeconds);
  if (Number.isFinite(statePosition)) return Math.max(0, statePosition);
  const smoothPosition = smoothPositionValue(clockNowMs());
  return typeof smoothPosition === "number" && Number.isFinite(smoothPosition)
    ? Math.max(0, smoothPosition)
    : null;
}

function beginPositionEdit() {
  completeActiveTimecodeTransition();
  if (activeTimecodeEdit) cancelActiveTimecodeEdit({ immediate: true });
  const element = $("positionValue");
  const current = currentPositionEditValue();
  if (!element || !hasTimeMark(current)) {
    return;
  }

  const editorWidthPx = timecodeEditWidthPx(element);
  element.classList.add("is-editing");
  const input = document.createElement("input");
  input.className = "mark-edit-input mark-timecode-editor";
  input.type = "text";
  input.inputMode = "numeric";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("aria-label", "Enter Position time: seconds, then minutes, then hours");
  input.setAttribute("role", "textbox");
  const display = document.createElement("span");
  display.className = "mark-edit-display";
  display.setAttribute("aria-hidden", "true");

  activeTimecodeEdit = {
    kind: "position",
    markName: "",
    element,
    input,
    display,
    originalValue: current,
    rawDigits: "",
    pastedSecondsOverride: null,
    fps: currentDisplayFps(),
    editorWidthPx,
    suffixStates: createTimecodeSuffixStates(),
    digitNodes: null,
    suffixNodes: null,
    slotsRoot: null,
    caretNode: null,
    replaceOnNextDigit: false,
    skipNextBeforeInputText: null,
    finished: false
  };

  input.addEventListener("keydown", handleTimecodeEditorKeydown);
  input.addEventListener("paste", handleTimecodeEditorPaste);
  input.addEventListener("beforeinput", handleTimecodeEditorBeforeInput);
  input.addEventListener("mousedown", (event) => event.stopPropagation());
  input.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    renderActiveTimecodeEdit();
  });
  input.addEventListener("blur", () => finishTimecodeEditForInput(input, false));

  element.textContent = "";
  element.appendChild(input);
  element.appendChild(display);
  renderActiveTimecodeEdit();
  input.focus({ preventScroll: true });
  renderActiveTimecodeEdit();
  window.requestAnimationFrame(() => {
    if (!activeTimecodeEdit || activeTimecodeEdit.input !== input || activeTimecodeEdit.finished) return;
    if (document.activeElement !== input) input.focus({ preventScroll: true });
    renderActiveTimecodeEdit();
  });
}

function updateDraggedMark(event) {
  if (!markDragState) return;
  if (event.pointerId !== undefined && event.pointerId !== markDragState.pointerId) return;
  const deltaX = event.clientX - markDragState.startX;
  if (!markDragState.hasStartedDragging && Math.abs(deltaX) >= DRAG_START_THRESHOLD_PX) {
    markDragState.hasStartedDragging = true;
    markDragState.element.classList.add("is-dragging");
    document.body.classList.add("is-dragging-mark");
  }
  if (!markDragState.hasStartedDragging) return;
  event.preventDefault();
  event.stopPropagation();

  const frameMultiplier = event.shiftKey ? 10 : 1;
  const pixelsPerFrame = markDragState.pixelsPerFrame || DRAG_PIXELS_PER_FRAME;
  const deltaFrames = Math.round(deltaX / pixelsPerFrame) * frameMultiplier * markDragState.directionMultiplier;
  const proposedValue = markDragState.originalValue + (deltaFrames / markDragState.fps);
  const proposedIn = markDragState.markName === "in" ? proposedValue : markDragState.originalIn;
  const proposedOut = markDragState.markName === "out" ? proposedValue : markDragState.originalOut;
  const nextValue = clampedMarkFromPoints(markDragState.markName, proposedValue, proposedIn, proposedOut);
  markDragState.latestValue = nextValue;
  markDragState.lastX = event.clientX;

  const inPoint = markDragState.markName === "in" ? nextValue : latestState && latestState.inPoint;
  const outPoint = markDragState.markName === "out" ? nextValue : latestState && latestState.outPoint;
  setMarkTimeElement(markDragState.markName, nextValue, markDragState.fps);
  renderRangeValue(inPoint, outPoint, markDragState.fps);
}

function endDraggedMark(apply, event) {
  if (!markDragState) return;
  if (event && event.pointerId !== undefined && event.pointerId !== markDragState.pointerId) return;
  const state = markDragState;
  const didDrag = state.hasStartedDragging;
  if (event && didDrag) {
    event.preventDefault();
    event.stopPropagation();
  }
  state.element.classList.remove("is-dragging");
  document.body.classList.remove("is-dragging-mark");
  try {
    if (typeof state.element.releasePointerCapture === "function") state.element.releasePointerCapture(state.pointerId);
  } catch (error) {
    // Pointer capture is optional.
  }
  window.removeEventListener("pointermove", updateDraggedMark, true);
  window.removeEventListener("pointerup", handleMarkPointerUp, true);
  window.removeEventListener("pointercancel", handleMarkPointerCancel, true);
  window.removeEventListener("mousemove", updateDraggedMark, true);
  window.removeEventListener("mouseup", handleMarkMouseUp, true);
  window.removeEventListener("keydown", handleMarkDragKeydown, true);
  markDragState = null;

  if (didDrag) {
    suppressNextMarkClick = {
      markName: state.markName,
      until: Date.now() + 160
    };
    if (apply) {
      applyMarkValueOnly(state.markName, state.latestValue);
    } else {
      renderState(latestState);
    }
  } else if (apply) {
    suppressNextMarkClick = {
      markName: state.markName,
      until: Date.now() + 160
    };
    beginMarkEdit(state.markName);
  }
}

function handleMarkPointerUp(event) {
  endDraggedMark(true, event);
}

function handleMarkMouseUp(event) {
  endDraggedMark(true, event);
}

function handleMarkPointerCancel(event) {
  endDraggedMark(false, event);
}

function handleMarkDragKeydown(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    endDraggedMark(false);
  }
}

function handleMarkPointerDown(event) {
  if (markDragState) return;
  const target = event.target && event.target.closest ? event.target.closest(".mark-value") : null;
  if (!target || !target.dataset || !target.dataset.mark) return;
  if (event.target && event.target.closest && event.target.closest(".mark-edit-input")) return;
  if (editingMarkName) return;
  if (event.button !== undefined && event.button !== 0) return;
  const element = target;
  const markName = element && element.dataset ? element.dataset.mark : "";
  const current = latestState && latestState[markPointName(markName)];
  if (!hasTimeMark(current)) {
    return;
  }
  resetMarkWheelAccumulator(markName);
  event.preventDefault();
  event.stopPropagation();

  markDragState = {
    markName,
    element,
    pointerId: event.pointerId,
    startX: event.clientX,
    lastX: event.clientX,
    originalValue: current,
    originalIn: latestState && latestState.inPoint,
    originalOut: latestState && latestState.outPoint,
    latestValue: current,
    fps: currentDisplayFps(),
    pixelsPerFrame: getTimecodeDragPixelsPerFrame(currentTimecodeDragSensitivity()),
    directionMultiplier: getTimecodeDragDirectionMultiplier(),
    hasStartedDragging: false
  };
  try {
    if (event.pointerId !== undefined && typeof element.setPointerCapture === "function") {
      element.setPointerCapture(event.pointerId);
    }
  } catch (error) {
    // Pointer capture is optional.
  }
  window.addEventListener("pointermove", updateDraggedMark, true);
  window.addEventListener("pointerup", handleMarkPointerUp, true);
  window.addEventListener("pointercancel", handleMarkPointerCancel, true);
  window.addEventListener("mousemove", updateDraggedMark, true);
  window.addEventListener("mouseup", handleMarkMouseUp, true);
  window.addEventListener("keydown", handleMarkDragKeydown, true);
}

function handleMarkMouseDown(event) {
  handleMarkPointerDown(event);
}

function editableTimecodeTargetFromEvent(event) {
  const target = event && event.target;
  if (!target || !target.closest) return null;
  const markTarget = target.closest(".mark-value-interactive[data-mark]");
  if (markTarget && markTarget.dataset && (markTarget.dataset.mark === "in" || markTarget.dataset.mark === "out")) {
    return { kind: "mark", markName: markTarget.dataset.mark, element: markTarget };
  }
  const positionTarget = target.closest("#positionValue.timecode-value");
  if (positionTarget) return { kind: "position", markName: "", element: positionTarget };
  return null;
}

function activeTimecodeEditMatchesTarget(target) {
  if (!activeTimecodeEdit || !target) return false;
  if (activeTimecodeEdit.kind !== target.kind) return false;
  if (target.kind === "mark") return activeTimecodeEdit.markName === target.markName;
  return true;
}

function beginTimecodeEditFromTarget(target) {
  if (!target) return;
  if (target.kind === "position") {
    beginPositionEdit();
    return;
  }
  beginMarkEdit(target.markName);
}

function switchActiveTimecodeEditOnPointerDown(event) {
  if (!activeTimecodeEdit) return;
  const editor = activeTimecodeEdit.input;
  const element = activeTimecodeEdit.element;
  if (editor && event.target && editor.contains(event.target)) return;
  if (element && event.target && element.contains(event.target)) return;

  const nextTarget = editableTimecodeTargetFromEvent(event);
  if (nextTarget && !activeTimecodeEditMatchesTarget(nextTarget)) {
    event.preventDefault();
    event.stopPropagation();
    finishTimecodeEdit(false);
    if (nextTarget.kind === "mark") {
      suppressNextMarkClick = {
        markName: nextTarget.markName,
        until: Date.now() + 160
      };
    }
    beginTimecodeEditFromTarget(nextTarget);
    return;
  }

  finishTimecodeEdit(false);
}

function handleMarkClick(event) {
  const target = event.target && event.target.closest
    ? event.target.closest(".mark-value-interactive[data-mark]")
    : null;
  if (!target || !target.dataset) return;
  const markName = target.dataset.mark;
  if (markName !== "in" && markName !== "out") return;

  if (
    suppressNextMarkClick &&
    suppressNextMarkClick.markName === markName &&
    Date.now() <= suppressNextMarkClick.until
  ) {
    event.preventDefault();
    event.stopPropagation();
    suppressNextMarkClick = null;
    return;
  }
  suppressNextMarkClick = null;
  if (markDragState) return;

  event.preventDefault();
  event.stopPropagation();
  beginMarkEdit(markName);
}

function bindMarkInteractions() {
  const readout = document.querySelector(".readout");
  if (!readout) return;
  document.addEventListener("pointerdown", switchActiveTimecodeEditOnPointerDown, true);
  document.addEventListener("mousedown", switchActiveTimecodeEditOnPointerDown, true);
  readout.addEventListener("pointerdown", handleMarkPointerDown, true);
  readout.addEventListener("mousedown", handleMarkMouseDown, true);
  readout.addEventListener("click", handleMarkClick, true);
  readout.addEventListener("wheel", handleMarkHorizontalWheel, { passive: false });
  readout.addEventListener("pointerout", (event) => {
    const target = event.target && event.target.closest
      ? event.target.closest(".mark-value-interactive[data-mark]")
      : null;
    if (!target || !target.dataset) return;
    if (event.relatedTarget && target.contains(event.relatedTarget)) return;
    resetMarkWheelAccumulator(target.dataset.mark);
  });
  readout.addEventListener("keydown", (event) => {
    const target = event.target && event.target.closest ? event.target.closest(".mark-value") : null;
    const markName = target && target.dataset ? target.dataset.mark : "";
    if (!markName) return;
    if (event.key === "Enter") {
      event.preventDefault();
      beginMarkEdit(markName);
    }
  });
}

function isEditableKeyTarget(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  if (target.closest) {
    if (target.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']")) return true;
    if (target.closest(".mark-edit-input")) return true;
    if (target.closest("button, a, summary, [role='button']")) return true;
  }
  const active = document.activeElement;
  return Boolean(active && active.classList && active.classList.contains("mark-edit-input"));
}

function isKeyboardScrollKey(event) {
  return event.key === " " ||
    event.key === "Spacebar" ||
    event.code === "Space" ||
    event.key === "PageUp" ||
    event.key === "PageDown" ||
    event.key === "Home" ||
    event.key === "End" ||
    event.key === "ArrowUp" ||
    event.key === "ArrowDown";
}

function isPlayerHotkey(event) {
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  const key = event.key;
  const code = event.code;
  if (key === " " || key === "Spacebar" || code === "Space") return true;
  if (key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown") return true;
  const letter = key && key.length === 1 ? key.toUpperCase() : "";
  return letter === "M" || letter === "K";
}

function playerHotkeyPayload(event) {
  return {
    key: event.key,
    code: event.code,
    shiftKey: Boolean(event.shiftKey),
    altKey: Boolean(event.altKey),
    ctrlKey: Boolean(event.ctrlKey),
    metaKey: Boolean(event.metaKey)
  };
}

function callPlayerHotkeyRpc(event) {
  if (!rpc || typeof rpc.$playerHotkey !== "function") {
    return;
  }
  const payload = playerHotkeyPayload(event);
  rpc.$playerHotkey(payload)
    .then((state) => {
      if (state && state.ok === false) return;
      if (state && Array.isArray(state.clips)) {
        renderState(state);
      }
    })
    .catch((error) => {
      console.error("[ClipMaker UI] hotkey RPC failed", error);
    });
}

function handleSidebarKeydown(event) {
  if (isEditableKeyTarget(event.target)) return;
  if (event.metaKey) return;

  if (isPlayerHotkey(event)) {
    event.preventDefault();
    event.stopPropagation();
    callPlayerHotkeyRpc(event);
    return;
  }

  if (isKeyboardScrollKey(event)) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
}

function bindKeyboardHotkeys() {
  document.addEventListener("keydown", handleSidebarKeydown, true);
}

function updateMarkButtonMode() {
  const setInButton = $("setInButton");
  const setOutButton = $("setOutButton");
  if (!setInButton || !setOutButton) return;

  const canSetMarks = !latestState || latestState.canSetMarks !== false;

  setInButton.textContent = isShiftPreviewMode ? "Preview In" : "Set In";
  setOutButton.textContent = isShiftPreviewMode ? "Preview Out" : "Set Out";
  setInButton.disabled = !canSetMarks;
  setOutButton.disabled = !canSetMarks;
}

function setShiftPreviewMode(enabled) {
  const next = Boolean(enabled);
  if (isShiftPreviewMode === next) return;
  isShiftPreviewMode = next;
  updateMarkButtonMode();
  updateShiftDeleteArmedState();
}

function bindShiftPreviewMode() {
  window.addEventListener("keydown", (event) => {
    if (event.key === "Shift") setShiftPreviewMode(true);
  });
  window.addEventListener("keyup", (event) => {
    if (event.key === "Shift") setShiftPreviewMode(false);
  });
  window.addEventListener("blur", () => setShiftPreviewMode(false));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) setShiftPreviewMode(false);
  });
}

function previewTargetSeconds(markName, seconds) {
  if (!hasTimeMark(seconds)) return null;
  return markName === "out" ? Math.max(0, seconds - PREVIEW_BEFORE_OUT_SECONDS) : seconds;
}

function previewStopAtSeconds(markName, seconds) {
  return markName === "out" && hasTimeMark(seconds) ? seconds : null;
}

async function previewFromMark(markName, seconds) {
  try {
    const target = previewTargetSeconds(markName, seconds);
    const stopAt = previewStopAtSeconds(markName, seconds);

    if (!hasTimeMark(target)) {
      return;
    }
    if (previewRequestInFlight) return;
    if (!rpc || typeof rpc.$previewPlay !== "function") {
      return;
    }

    previewRequestInFlight = true;
    await pushNavigationPoint(markName === "out" ? "preview-out" : "preview-in");
    const state = await rpc.$previewPlay({ target, stopAt });
    if (state && state.ok === false) return;
    renderState(state);
  } catch (error) {
    console.error("[ClipMaker UI] preview handler failed", error);
  } finally {
    previewRequestInFlight = false;
  }
}

async function previewClip(clip) {
  try {
    if (!clip || !hasTimeMark(clip.inPoint) || !hasTimeMark(clip.outPoint) || clip.outPoint <= clip.inPoint) {
      return;
    }
    if (previewRequestInFlight) return;
    if (!rpc || typeof rpc.$previewPlay !== "function") {
      return;
    }

    const target = clip.inPoint;
    const stopAt = clip.outPoint;
    previewRequestInFlight = true;
    await pushNavigationPoint("clip-preview");
    const state = await rpc.$previewPlay({ target, stopAt });
    if (state && state.ok === false) return;
    renderState(state);
  } catch (error) {
    console.error("[ClipMaker UI] clip preview handler failed", error);
  } finally {
    previewRequestInFlight = false;
  }
}

function handleSetMarkButtonClick(markName, event) {
  try {
    resetMarkWheelAccumulator(markName);
    if (event && (event.shiftKey || isShiftPreviewMode)) {
      previewFromMark(markName, latestState && latestState[markName === "in" ? "inPoint" : "outPoint"]);
      return;
    }
    if (markName === "in") {
      callAction(() => rpc.$setIn());
    } else {
      callAction(() => rpc.$setOut());
    }
  } catch (error) {
    console.error("[ClipMaker UI] set mark click failed", error);
  }
}

function callAction(action) {
  if (!rpc || typeof action !== "function") return;

  action()
    .then(renderState)
    .catch((error) => {
      console.error("[ClipMaker UI] RPC failed", error);
    });
}

function finishClipRename(input, clipId, originalName, shouldApply) {
  if (!input || editingClipId !== clipId) return;
  const value = sanitizeClipNameInput(input.value);
  editingClipId = null;
  editingClipOriginalName = "";
  if (!shouldApply || !value) {
    renderState(latestState);
    return;
  }
  if (value === originalName) {
    renderState(latestState);
    return;
  }
  callAction(() => rpc.$renameClip(clipId, value));
}

function beginClipRename(clip, index) {
  if (!clip || editingClipId === clip.id || (latestState && latestState.exporting)) return;
  const clipId = clip.id;
  const originalName = clipDisplayName(clip, index);
  editingClipId = clipId;
  editingClipOriginalName = originalName;
  renderClips(latestState && latestState.clips, currentDisplayFps());
  const input = document.querySelector(`.clip-rename-input[data-clip-id="${clipId}"]`);
  if (!input) return;
  input.focus();
  input.select();
}

function createClipPositionRow(entry, slotIndex, fps) {
  const row = document.createElement("div");
  row.className = "clip-row clip-position-slot";
  row.dataset.slotIndex = String(slotIndex);

  const rowIndex = document.createElement("div");
  rowIndex.className = "clip-row-index";
  const slotIndexText = String(slotIndex + 1);
  rowIndex.textContent = slotIndexText;
  rowIndex.dataset.digits = String(Math.min(4, slotIndexText.length));
  rowIndex.setAttribute("aria-hidden", "true");
  row.appendChild(rowIndex);

  if (!entry || entry.type === "placeholder") {
    row.classList.add("clip-drag-placeholder");
    row.setAttribute("aria-hidden", "true");
    if (clipReorderState && clipReorderState.rowHeight) {
      row.style.height = `${clipReorderState.rowHeight}px`;
    }
    const cardSlot = document.createElement("div");
    cardSlot.className = "clip-drag-placeholder-card";
    row.appendChild(cardSlot);
    return row;
  }

  const clip = entry.clip;
  if (!clip) return row;
  const index = Number.isInteger(entry.fullIndex) ? entry.fullIndex : slotIndex;
  const rowIndexText = String(slotIndex + 1);
  rowIndex.textContent = rowIndexText;
  rowIndex.dataset.digits = String(Math.min(4, rowIndexText.length));
  row.dataset.clipId = String(clip.id);

    const item = document.createElement("article");
    item.className = clip.selected ? "clip clip-card selected" : "clip clip-card";
    item.tabIndex = 0;
    item.setAttribute("role", "button");
    item.setAttribute("aria-pressed", clip.selected ? "true" : "false");
    item.onpointerdown = function (event) {
      beginClipReorder(event, clip, index, row, { source: "card", card: item, captureElement: item });
    };
    item.onclick = function (event) {
      if (suppressNextClipClickId === clip.id) {
        suppressNextClipClickId = null;
        clearPendingClipSelection();
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.detail > 1) {
        clearPendingClipSelection();
        return;
      }
      scheduleClipSelectionToggle(clip.id);
    };
    item.ondblclick = function (event) {
      if (isInteractiveCardReorderTarget(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      clearPendingClipSelection();
      previewClip(clip);
    };
    item.onkeydown = function (event) {
      if (isEditableKeyTarget(event.target)) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        callAction(() => rpc.$toggleClipSelection(clip.id));
      }
    };

    const main = document.createElement("div");
    main.className = "clip-card-main";

    const deleteButton = document.createElement("button");
    deleteButton.className = "clip-delete-zone";
    deleteButton.type = "button";
    deleteButton.disabled = Boolean(latestState && latestState.exporting);
    deleteButton.setAttribute("aria-label", "Delete clip");
    deleteButton.innerHTML = '<svg class="clip-delete-icon" aria-hidden="true" viewBox="0 0 18 18" focusable="false"><path d="m13.474 7.25-.374 7.105c-.056 1.062-.934 1.895-1.997 1.895H6.898c-1.064 0-1.941-.833-1.997-1.895L4.527 7.25" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"></path><line x1="2.75" y1="4.75" x2="15.25" y2="4.75" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"></line><path d="M6.75 4.75v-2c0-.552.448-1 1-1h2.5c.552 0 1 .448 1 1v2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"></path><line x1="7.375" y1="8.75" x2="7.625" y2="13.25" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"></line><line x1="10.625" y1="8.75" x2="10.375" y2="13.25" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"></line></svg>';
    bindStableHover(deleteButton, "is-hovering");
    deleteButton.onclick = function (event) {
      event.preventDefault();
      event.stopPropagation();
      callAction(() => rpc.$deleteClip(clip.id));
    };

    const title = document.createElement("div");
    title.className = "clip-title";
    bindStableHover(title, "is-hovering");
    const titleText = document.createElement("span");
    titleText.className = "clip-title-text";
    titleText.textContent = clipDisplayName(clip, index);
    titleText.ondblclick = function (event) {
      event.preventDefault();
      event.stopPropagation();
      beginClipRename(clip, index);
    };

    const renameButton = document.createElement("button");
    renameButton.className = "clip-rename-button";
    renameButton.type = "button";
    renameButton.disabled = Boolean(latestState && latestState.exporting);
    renameButton.setAttribute("aria-label", "Rename clip");
    renameButton.innerHTML = '<svg class="clip-rename-icon" aria-hidden="true" viewBox="0 0 24 24" focusable="false"><line x1="14.328" y1="4.672" x2="19.328" y2="9.672" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="2"></line><path d="M8,21,2,22l1-6L16.414,2.586a2,2,0,0,1,2.828,0l2.172,2.172a2,2,0,0,1,0,2.828Z" fill="none" stroke="currentColor" stroke-linecap="square" stroke-miterlimit="10" stroke-width="2"></path></svg>';
    bindStableHover(renameButton, "is-hovering");
    renameButton.onclick = function (event) {
      event.preventDefault();
      event.stopPropagation();
      beginClipRename(clip, index);
    };

    title.onmousedown = function (event) {
      event.stopPropagation();
    };
    title.onclick = function (event) {
      event.stopPropagation();
    };

    if (editingClipId === clip.id) {
      const input = document.createElement("input");
      input.className = "clip-rename-input";
      input.type = "text";
      input.value = editingClipOriginalName || clipDisplayName(clip, index);
      input.maxLength = CLIP_TEXT_MAX_LENGTH;
      input.dataset.clipId = String(clip.id);
      input.setAttribute("aria-label", "Rename clip");
      input.onmousedown = function (event) {
        event.stopPropagation();
      };
      input.onclick = function (event) {
        event.stopPropagation();
      };
      input.oninput = function (event) {
        event.stopPropagation();
        const sanitized = sanitizeClipNameEditValue(input.value);
        if (input.value !== sanitized) input.value = sanitized;
      };
      input.onkeydown = function (event) {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          finishClipRename(input, clip.id, editingClipOriginalName, true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          finishClipRename(input, clip.id, editingClipOriginalName, false);
        }
      };
      input.onkeyup = function (event) {
        event.stopPropagation();
      };
      input.onkeypress = function (event) {
        event.stopPropagation();
      };
      input.onpaste = function (event) {
        event.preventDefault();
        event.stopPropagation();
        const clipboard = event.clipboardData || window.clipboardData;
        const pasted = clipboard ? clipboard.getData("text") : "";
        const sanitized = sanitizeClipNameInput(pasted);
        if (typeof input.setRangeText === "function") {
          input.setRangeText(sanitized, input.selectionStart || 0, input.selectionEnd || 0, "end");
        } else {
          input.value = sanitizeClipNameInput(`${input.value} ${sanitized}`);
        }
        input.value = sanitizeClipNameEditValue(input.value);
      };
      input.onblur = function () {
        finishClipRename(input, clip.id, editingClipOriginalName, true);
      };
      title.appendChild(input);
    } else {
      title.appendChild(titleText);
      title.appendChild(renameButton);
    }

    const time = document.createElement("div");
    time.className = "clip-time";
    const inTime = displayTime(clip.inPoint, fps);
    const outTime = displayTime(clip.outPoint, fps);
    const displayedDuration = displayedRangeSeconds(clip.inPoint, clip.outPoint, fps);
    const durationTime = displayRangeDuration(displayedDuration === null ? clip.duration : displayedDuration, fps);
    const arrow = "→";
    time.textContent = `${inTime.text} ${arrow} ${outTime.text}`;

    const duration = document.createElement("div");
    duration.className = "clip-duration";
    duration.textContent = `${durationTime.text} duration`;

    main.appendChild(title);
    main.appendChild(time);
    main.appendChild(duration);
    if (clip.exportStatus && clip.exportStatus !== "pending") {
      const status = document.createElement("div");
      status.className = `clip-status ${clip.exportStatus}`;
      status.textContent = clip.exportStatus;
      main.appendChild(status);
    }
    item.appendChild(main);
    item.appendChild(deleteButton);
    row.appendChild(item);
  return row;
}

function renderClipRows(rowEntries, fps) {
  const list = $("clipsList");
  if (!list) return;
  const entries = Array.isArray(rowEntries) ? rowEntries : [];
  if (!entries.length) {
    list.innerHTML = isClipSearchActive()
      ? '<div class="empty empty-search"><span>No clips found</span><span class="empty-search-subtitle">Try another name</span></div>'
      : '<div class="empty">No clips yet</div>';
    return;
  }

  list.innerHTML = "";
  entries.forEach((entry, slotIndex) => {
    const row = createClipPositionRow(entry, slotIndex, fps);
    list.appendChild(row);
  });
}

function renderClipDragSlots(dropIndex, isValid) {
  if (!clipReorderState || !latestState || !Array.isArray(latestState.clips)) return;
  const valid = Boolean(isValid);
  const remainingClips = latestState.clips.filter((clip) => clip.id !== clipReorderState.clipId);
  const maxDropIndex = remainingClips.length;
  const normalizedDropIndex = valid ? clamp(Number(dropIndex) || 0, 0, maxDropIndex) : null;
  if (
    clipReorderState.renderedDropIndex === normalizedDropIndex &&
    clipReorderState.renderedIsValidDrop === valid
  ) {
    return;
  }

  const rows = [];
  let remainingIndex = 0;
  const totalSlots = valid ? remainingClips.length + 1 : remainingClips.length;
  for (let slotIndex = 0; slotIndex < totalSlots; slotIndex += 1) {
    if (valid && slotIndex === normalizedDropIndex) {
      rows.push({ type: "placeholder" });
    } else {
      rows.push({ type: "clip", clip: remainingClips[remainingIndex] });
      remainingIndex += 1;
    }
  }

  clipReorderState.renderedDropIndex = normalizedDropIndex;
  clipReorderState.renderedIsValidDrop = valid;
  renderClipRows(rows, clipReorderState.fps || currentDisplayFps());
}

function renderClips(clips, fps) {
  if (clipReorderState) return;
  if (editingClipId !== null) {
    const editingInput = document.querySelector(".clip-rename-input");
    if (editingInput && document.activeElement === editingInput) return;
  }

  const items = Array.isArray(clips) ? clips : [];
  renderClipRows(displayedClipEntries(items), fps);
  syncDisplayedClipOrder(items);
}

function renderState(state) {
  if (!state) return;
  const nextMarkWheelFileId = navigationFileIdFromState(state);
  if (nextMarkWheelFileId !== markWheelFileId) {
    cancelActiveTimecodeEdit({ immediate: true });
    resetMarkWheelAccumulator();
    resetMarkWheelGesture();
    clearMarkEditUndo();
    markWheelFileId = nextMarkWheelFileId;
  }
  const nextScrollSensitivity = normalizeSensitivityLevel(state.timecodeScrollSensitivity);
  if (nextScrollSensitivity !== lastTimecodeScrollSensitivity) {
    resetMarkWheelAccumulator();
    resetMarkWheelGesture();
    lastTimecodeScrollSensitivity = nextScrollSensitivity;
  }
  latestState = state;
  if (state.clipViewOrderNeedsSync) lastSyncedClipViewSignature = "";
  updateClipSortControl(state);
  syncNavigationHistoryFile(state);
  if (clipReorderState && clipReorderState.fileId && clipReorderState.fileId !== navigationFileIdFromState(state)) {
    cancelClipDrag();
  }

  const fps = normalizeDisplayFps(state.displayFps || state.fps || 30);
  $("title").textContent = "ClipMaker";
  renderTopHeaderStatus(state);
  setVideoTitle(state.currentFileName || "No file");
  updateSmoothPositionSync(state, fps);
  renderMarkValue("in", state.inPoint, fps);
  renderMarkValue("out", state.outPoint, fps);
  if (markDragState) {
    const inPoint = markDragState.markName === "in" ? markDragState.latestValue : state.inPoint;
    const outPoint = markDragState.markName === "out" ? markDragState.latestValue : state.outPoint;
    renderRangeValue(inPoint, outPoint, fps);
  } else {
    renderRangeValue(state.inPoint, state.outPoint, fps);
  }
  updateMarkButtonMode();
  $("clearListButton").disabled = !state.canClearList;
  $("addClipButton").disabled = !state.canAddClip;
  $("exportSelectedButton").disabled = !state.canExportSelected;
  $("exportAllButton").disabled = !state.canExportAll;
  const selectedCount = selectedClipCountFromState(state);
  updateClipsHeaderCounts(Array.isArray(state.clips) ? state.clips.length : 0, selectedCount);
  const deleteConfirmOverlay = $("deleteSelectedConfirm");
  if (selectedCount === 0 && deleteConfirmOverlay && !deleteConfirmOverlay.hidden) closeDeleteSelectedConfirm();
  const clearListConfirmOverlay = $("clearListConfirm");
  if (!state.canClearList && clearListConfirmOverlay && !clearListConfirmOverlay.hidden) {
    closeDeleteConfirmation("clearList");
  }
  if (state.deleteWithoutConfirmation === true && activeDeleteConfirmation) {
    closeDeleteConfirmation(activeDeleteConfirmation);
  }
  updateShiftDeleteArmedState();
  updateSelectionActionsVisibility(selectedCount > 0);
  if (state.exporting) setSelectionActionButtonsDisabled(true);
  updateClipSearchControl();
  renderClips(state.clips, fps);
  updateNavigationBackButton();
  updateMarkEditUndoButton();

}

function registerStateListener() {
  if (!hasIinaBridge()) return;

  iina.onMessage("state", function (state) {
    renderState(state);
  });
}

function closeExportContextMenu(restoreFocus, immediate) {
  const menu = $("exportContextMenu");
  if (!menu) return;
  if (!exportContextMenuOpen && menu.hidden && exportContextMenuHideTimer === null) return;
  if (exportContextMenuHideTimer !== null) {
    window.clearTimeout(exportContextMenuHideTimer);
    exportContextMenuHideTimer = null;
  }
  const trigger = exportContextMenuTrigger;
  exportContextMenuOpen = false;
  exportContextMenuTrigger = null;
  menu.classList.remove("is-open");
  if (immediate) {
    menu.hidden = true;
  } else {
    exportContextMenuHideTimer = window.setTimeout(() => {
      exportContextMenuHideTimer = null;
      menu.hidden = true;
    }, 150);
  }
  if (restoreFocus && trigger) trigger.focus();
}

function openExportContextMenu(event, trigger) {
  const menu = $("exportContextMenu");
  const item = $("showExportFolderMenuItem");
  if (!menu || !trigger) return;
  if (exportContextMenuHideTimer !== null) {
    window.clearTimeout(exportContextMenuHideTimer);
    exportContextMenuHideTimer = null;
  }
  closeClipSortMenu(false);
  if (activeDeleteConfirmation) closeDeleteConfirmation(activeDeleteConfirmation);
  exportContextMenuOpen = true;
  exportContextMenuTrigger = trigger;
  menu.hidden = false;
  menu.classList.remove("is-open");
  const triggerRect = trigger.getBoundingClientRect();
  const pointerX = Number(event && event.clientX) || triggerRect.left + triggerRect.width / 2;
  const pointerY = Number(event && event.clientY) || triggerRect.top + triggerRect.height / 2;
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth || 0;
  const viewportHeight = document.documentElement.clientHeight || window.innerHeight || 0;
  const left = clamp(pointerX, 8, Math.max(8, viewportWidth - menu.offsetWidth - 8));
  const top = clamp(pointerY, 8, Math.max(8, viewportHeight - menu.offsetHeight - 8));
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
  window.requestAnimationFrame(() => {
    if (!exportContextMenuOpen) return;
    menu.classList.add("is-open");
    if (item) item.focus();
  });
}

function bindExportContextMenu() {
  const menu = $("exportContextMenu");
  const item = $("showExportFolderMenuItem");
  const triggers = [$("exportAllButton"), $("exportSelectedButton")].filter(Boolean);
  if (!menu || !item || !triggers.length) return;

  triggers.forEach((trigger) => {
    trigger.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openExportContextMenu(event, trigger);
    });
  });
  item.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeExportContextMenu(false, true);
    callAction(() => rpc.$showExportFolder());
  });
  menu.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    closeExportContextMenu(true);
  });
  document.addEventListener("pointerdown", (event) => {
    if (!exportContextMenuOpen || menu.contains(event.target)) return;
    closeExportContextMenu(false);
  }, true);
  document.addEventListener("contextmenu", (event) => {
    if (!exportContextMenuOpen || menu.contains(event.target) || triggers.some((trigger) => trigger.contains(event.target))) return;
    closeExportContextMenu(false, true);
  }, true);
  document.addEventListener("scroll", () => closeExportContextMenu(false), true);
  window.addEventListener("resize", () => closeExportContextMenu(false));
  window.addEventListener("blur", () => closeExportContextMenu(false, true));
}

function bindButtons() {
  const navigationBackButton = $("navigationBackButton");
  if (navigationBackButton) {
    navigationBackButton.onclick = restoreNavigationBack;
  }
  const markEditUndoButton = $("markEditUndoButton");
  if (markEditUndoButton) {
    markEditUndoButton.onclick = undoLastManualMarkEdit;
  }
  const positionValue = $("positionValue");
  if (positionValue) {
    positionValue.onclick = function (event) {
      event.preventDefault();
      event.stopPropagation();
      beginPositionEdit();
    };
    positionValue.onkeydown = function (event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      event.stopPropagation();
      beginPositionEdit();
    };
  }
  $("setInButton").onclick = function (event) {
    handleSetMarkButtonClick("in", event);
  };
  $("setOutButton").onclick = function (event) {
    handleSetMarkButtonClick("out", event);
  };
  $("addClipButton").onclick = function () {
    callAction(() => rpc.$addClip());
  };
  $("clearListButton").onclick = function (event) {
    if (shouldDeleteWithoutPrompt(event)) {
      closeDeleteConfirmation("clearList", true);
      clearClipListThroughExistingAction();
      return;
    }
    if (deleteConfirmationIsOpen("clearList")) {
      closeDeleteConfirmation("clearList");
      return;
    }
    openClearListConfirm();
  };
  $("ffmpegWarningPill").onclick = function () {
    callAction(() => rpc.$setFfmpeg());
  };
  $("exportSelectedButton").onclick = function () {
    const orderedVisibleIds = displayedClipIds(latestState && latestState.clips);
    callAction(() => rpc.$exportSelected(selectedIdsFromState(latestState), orderedVisibleIds));
  };
  $("exportAllButton").onclick = function () {
    const orderedVisibleIds = displayedClipIds(latestState && latestState.clips);
    callAction(() => rpc.$exportAll(orderedVisibleIds));
  };
  const clearSelectionButton = $("clearSelectionButton");
  if (clearSelectionButton) {
    const setClearSelectionActionActive = () => {
      clearSelectionButton.classList.add("is-action-active");
      window.setTimeout(() => {
        clearSelectionButton.classList.remove("is-action-active");
      }, 180);
    };
    clearSelectionButton.onpointerdown = function () {
      if (!clearSelectionButton.disabled) setClearSelectionActionActive();
    };
    clearSelectionButton.onclick = function () {
      setClearSelectionActionActive();
      callAction(() => rpc.$clearClipSelection());
    };
  }
  $("deleteSelectedButton").onclick = function (event) {
    if (shouldDeleteWithoutPrompt(event)) {
      closeDeleteConfirmation("deleteSelected", true);
      deleteSelectedClipsThroughExistingAction();
      return;
    }
    if (deleteConfirmationIsOpen("deleteSelected")) {
      closeDeleteSelectedConfirm();
      return;
    }
    openDeleteSelectedConfirm();
  };
  bindStableHover($("deleteSelectedButton"), "is-hovering");
  $("cancelDeleteSelectedButton").onclick = function () {
    closeDeleteSelectedConfirm();
  };
  $("confirmDeleteSelectedButton").onclick = function () {
    closeDeleteSelectedConfirm();
    deleteSelectedClipsThroughExistingAction();
  };
  $("cancelClearListButton").onclick = function () {
    closeDeleteConfirmation("clearList");
  };
  $("confirmClearListButton").onclick = function () {
    closeDeleteConfirmation("clearList");
    clearClipListThroughExistingAction();
  };
  ["deleteSelected", "clearList"].forEach((kind) => {
    const elements = deleteConfirmationElements(kind);
    if (!elements.overlay) return;
    elements.overlay.onclick = function (event) {
      event.stopPropagation();
    };
    elements.overlay.addEventListener("focusout", function () {
      window.setTimeout(() => {
        if (!deleteConfirmationIsOpen(kind)) return;
        if (elements.overlay.contains(document.activeElement)) return;
        closeDeleteConfirmation(kind);
      }, 0);
    });
  });
  document.addEventListener("pointerdown", function (event) {
    if (!activeDeleteConfirmation) return;
    const elements = deleteConfirmationElements(activeDeleteConfirmation);
    if (!elements.overlay || !deleteConfirmationIsOpen(activeDeleteConfirmation)) return;
    if (elements.overlay.contains(event.target)) return;
    if (elements.trigger && elements.trigger.contains(event.target)) return;
    closeDeleteConfirmation(activeDeleteConfirmation);
  }, true);
  document.addEventListener("scroll", handleDeleteConfirmationScroll, true);
  window.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && clipSortMenuOpen) {
      event.preventDefault();
      closeClipSortMenu(true);
      return;
    }
    if (event.key === "Escape" && activeDeleteConfirmation) {
      event.preventDefault();
      closeDeleteConfirmation(activeDeleteConfirmation);
      return;
    }
  });
}

function boot() {
  if (!hasIinaBridge()) return;

  rpc = rpcClient(iina);
  observeTitleResize();
  bindHeaderInfoHover();
  bindTitleBubble();
  bindClipSearchControl();
  bindClipSortControl();
  bindExportContextMenu();
  bindShiftPreviewMode();
  bindMarkInteractions();
  bindKeyboardHotkeys();
  window.addEventListener("resize", () => {
    scheduleTitleOverflowCheck();
    updateClipSearchExpandedWidth();
    if (activeDeleteConfirmation) positionDeleteConfirmation(activeDeleteConfirmation);
  });
  window.addEventListener("blur", resetTitleBubble);
  window.addEventListener("beforeunload", () => {
    resetTitleBubble();
    cancelActiveTimecodeEdit({ immediate: true });
    completeActiveTimecodeTransition();
    stopSmoothPositionTicker();
  });
  registerStateListener();
  bindButtons();
  callAction(() => rpc.$getState());
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
