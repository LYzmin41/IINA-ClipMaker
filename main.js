const sidebar = iina.sidebar;
const { core, event, file, menu, mpv, utils } = iina;
const rpc = rpcClient(sidebar);

const STATUS_PENDING = "pending";
const STATUS_EXPORTING = "exporting";
const STATUS_EXPORTED = "exported";
const STATUS_FAILED = "failed";
const PREVIEW_STOP_POLL_MS = 50;
const PREVIEW_STOP_TOLERANCE_SECONDS = 0.03;

const state = {
  currentSourcePath: null,
  currentSourceName: "No file loaded",
  positionSeconds: null,
  inPoint: null,
  outPoint: null,
  clips: [],
  selectedClipIds: [],
  selectedClipId: null,
  nextClipId: 1,
  nextCreationSequence: 1,
  visibleClipIds: null,
  exporting: false,
  exportMessage: "Idle",
  ffmpegAvailable: false,
  ffmpegFound: false,
  ffmpegStatus: "ffmpeg unchecked",
  ffmpegPath: "",
  fps: null,
  currentVideoFps: null,
  displayFps: null,
  fpsSource: "",
  fpsFallbackUsed: false,
  lastExportedFile: "",
  lastExportFolder: "",
  lastError: "",
  lastAction: "none"
};

const menuItems = {};
let exportPreflightInFlight = false;
let lastObservedFfmpegPathPreference = null;
let ffmpegPreferenceCheckInFlight = false;
let lastFfmpegPreferencePollTime = 0;
const eventListenerIds = [];
const stableTimeoutIds = [];
const rpcMessageNames = [];

let sidebarLoaded = false;
let menuRegistered = false;
let handlersRegistered = false;
let updateTimerId = null;
let isDisposed = false;
let exportGeneration = 0;
let previewStopIntervalId = null;
let previewStopTimeoutId = null;
let previewStopToken = 0;

const FALLBACK_FPS = 30;
const FFMPEG_CANDIDATE_PATHS = [
  "/opt/homebrew/bin/ffmpeg",
  "/usr/local/bin/ffmpeg",
  "/usr/bin/ffmpeg",
  "/opt/local/bin/ffmpeg"
];
const DEFAULT_OUTPUT_FOLDER = "~/Movies/IINA clips";
const SOURCE_CONTAINER_VALUE = "source";
const CLIP_SORT_MODES = ["manual", "creation", "name", "duration", "in", "out"];
const CLIP_SORT_DIRECTIONS = ["ascending", "descending"];
const SHORTCUT_PREFERENCE_KEYS = [
  "shortcutShowPanel",
  "shortcutSetIn",
  "shortcutSetOut",
  "shortcutAddClip",
  "shortcutExportSelected",
  "shortcutExportAll",
  "shortcutClearMarks",
  "shortcutClearList"
];

let lastObservedShortcutPreferenceSignature = null;
let lastShortcutPreferencePollTime = 0;

function logError(message, error) {
  const detail = error && error.stack ? error.stack : String(error || "");
  iina.console.error(`[ClipMaker] ${message}${detail ? `: ${detail}` : ""}`);
}

function osd(message) {
  try {
    core.osd(`ClipMaker: ${message}`);
  } catch (error) {
    logError("Could not show OSD", error);
  }
}

function pref(key, fallback) {
  const value = iina.preferences.get(key);
  return value === undefined || value === null ? fallback : value;
}

function normalizeContainerPreference(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text ||
    text === SOURCE_CONTAINER_VALUE ||
    text === "original" ||
    text === "original-extension" ||
    text === "original_extension" ||
    text === "originalextension" ||
    text === "same-as-source" ||
    text === "same_as_source" ||
    text === "same-as-original") {
    return SOURCE_CONTAINER_VALUE;
  }
  if (["mp4", "mov", "mkv"].includes(text)) {
    return text;
  }
  return SOURCE_CONTAINER_VALUE;
}

function normalizeExportModePreference(value) {
  const text = String(value || "").trim().toLowerCase();
  if (text === "precise" || text === "reencode" || text === "re-encode") return "precise";
  return "fast";
}

function exportMode() {
  return normalizeExportModePreference(pref("exportMode", "fast"));
}

function containerSupportsFastStart(container) {
  const text = String(container || "").toLowerCase();
  return text === "mp4" || text === "mov" || text === "m4v";
}

function normalizeSensitivityLevel(value) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return 3;
  return Math.min(5, Math.max(1, parsed));
}

function sensitivityPreference(key) {
  return normalizeSensitivityLevel(pref(key, 3));
}

function booleanPreference(key, fallback) {
  const value = pref(key, fallback);
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return Boolean(fallback);
}

function normalizeClipSortMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  return CLIP_SORT_MODES.includes(mode) ? mode : "manual";
}

function normalizeClipSortDirection(value) {
  const direction = String(value || "").trim().toLowerCase();
  return CLIP_SORT_DIRECTIONS.includes(direction) ? direction : "ascending";
}

function clipSortModePreference() {
  return normalizeClipSortMode(pref("clipSortMode", "manual"));
}

function clipSortDirectionPreference() {
  return normalizeClipSortDirection(pref("clipSortDirection", "ascending"));
}

function addNewClipsToTopPreference() {
  return booleanPreference("addNewClipsToTop", true);
}

function stableClipIdCompare(left, right) {
  const leftNumber = Number(left && left.id);
  const rightNumber = Number(right && right.id);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }
  return String(left && left.id || "").localeCompare(String(right && right.id || ""));
}

function ensureClipCreationSequences() {
  const clips = Array.isArray(state.clips) ? state.clips : [];
  const used = new Set();
  let maximum = 0;
  const missing = [];

  clips.forEach((clip, manualIndex) => {
    const sequence = Number(clip && clip.creationSequence);
    if (Number.isInteger(sequence) && sequence > 0 && !used.has(sequence)) {
      clip.creationSequence = sequence;
      used.add(sequence);
      maximum = Math.max(maximum, sequence);
    } else {
      missing.push({ clip, manualIndex });
    }
  });

  missing.sort((left, right) => {
    const idOrder = stableClipIdCompare(left.clip, right.clip);
    if (idOrder !== 0) return idOrder;
    const leftCreated = Date.parse(left.clip && left.clip.createdAt || "");
    const rightCreated = Date.parse(right.clip && right.clip.createdAt || "");
    if (Number.isFinite(leftCreated) && Number.isFinite(rightCreated) && leftCreated !== rightCreated) {
      return leftCreated - rightCreated;
    }
    return left.manualIndex - right.manualIndex;
  });

  missing.forEach((entry) => {
    maximum += 1;
    while (used.has(maximum)) maximum += 1;
    entry.clip.creationSequence = maximum;
    used.add(maximum);
  });

  state.nextCreationSequence = Math.max(state.nextCreationSequence, maximum + 1, 1);
}

function insertClipIntoManualOrder(clip) {
  if (addNewClipsToTopPreference()) state.clips.unshift(clip);
  else state.clips.push(clip);
  state.visibleClipIds = null;
}

function invertTimecodeScrollingPreference() {
  return booleanPreference("invertTimecodeScrolling", false);
}

function invertTimecodeDraggingPreference() {
  return booleanPreference("invertTimecodeDragging", false);
}

function timecodeScrollSensitivityPreference() {
  return sensitivityPreference("timecodeScrollSensitivity");
}

function timecodeDragSensitivityPreference() {
  return sensitivityPreference("timecodeDragSensitivity");
}

function askWhereToSavePreference() {
  return booleanPreference("askWhereToSave", false);
}

function deleteWithoutConfirmationPreference() {
  return booleanPreference("deleteWithoutConfirmation", false);
}

function revealAfterExportPreference() {
  return booleanPreference("revealAfterExport", true);
}

function deleteClipsAfterExportPreference() {
  return booleanPreference("deleteClipsAfterExport", false);
}

function getShortcut(prefKey, fallback) {
  const value = pref(prefKey, fallback);
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function shortcutPreferenceSignature() {
  return JSON.stringify(SHORTCUT_PREFERENCE_KEYS.map((key) => pref(key, "")));
}

function makeMenuItem(title, action, shortcutPrefKey, fallbackShortcut) {
  const shortcut = getShortcut(shortcutPrefKey, fallbackShortcut);
  if (!shortcut) {
    return menu.item(title, action);
  }

  try {
    return menu.item(title, action, { keyBinding: shortcut });
  } catch (error) {
    logError(`Invalid shortcut for ${title}: ${shortcut}`, error);
    try {
      return menu.item(title, action);
    } catch (fallbackError) {
      logError(`Could not create menu item without shortcut: ${title}`, fallbackError);
      throw fallbackError;
    }
  }
}

function setEventListener(eventName, callback) {
  const id = event.on(eventName, callback);
  eventListenerIds.push({ eventName, id });
  return id;
}

function setTrackedTimeout(callback, delay) {
  const timeoutId = setTimeout(() => {
    const index = stableTimeoutIds.indexOf(timeoutId);
    if (index >= 0) stableTimeoutIds.splice(index, 1);
    if (isDisposed) return;
    callback();
  }, delay);
  stableTimeoutIds.push(timeoutId);
  return timeoutId;
}

function registerOptionalCleanupEvent(eventName) {
  try {
    setEventListener(eventName, cleanup);
  } catch (error) {
    // Some IINA builds do not expose plugin unload events.
  }
}

function cleanup() {
  if (isDisposed) return;
  isDisposed = true;
  exportGeneration += 1;
  state.exporting = false;
  cancelPreviewWatcher();
  if (updateTimerId !== null) {
    try {
      clearInterval(updateTimerId);
    } catch (error) {
      logError("Could not clear update timer", error);
    }
    updateTimerId = null;
  }

  while (stableTimeoutIds.length) {
    const timeoutId = stableTimeoutIds.pop();
    try {
      clearTimeout(timeoutId);
    } catch (error) {
      logError("Could not clear stable timer", error);
    }
  }

  while (rpcMessageNames.length) {
    const messageName = rpcMessageNames.pop();
    try {
      sidebar.onMessage(messageName, null);
    } catch (error) {
      logError(`Could not remove RPC handler ${messageName}`, error);
    }
  }

  while (eventListenerIds.length) {
    const listener = eventListenerIds.pop();
    try {
      event.off(listener.eventName, listener.id);
    } catch (error) {
      logError(`Could not remove listener ${listener.eventName}`, error);
    }
  }
  handlersRegistered = false;
  sidebarLoaded = false;
}

function hasPlayableFile() {
  return Boolean(state.currentSourcePath) && !core.status.idle;
}

function hasLocalPlayableFile() {
  if (!hasPlayableFile() || core.status.isNetworkResource || isRemoteSourcePath(state.currentSourcePath)) {
    return false;
  }
  try {
    return file.exists(state.currentSourcePath);
  } catch (error) {
    return false;
  }
}

function exportIsBusy() {
  return state.exporting || exportPreflightInFlight;
}

function rejectClipMutationWhileExporting(action) {
  if (!exportIsBusy()) return false;
  state.lastAction = `${action} ignored: export running`;
  return true;
}

function getCurrentPositionSeconds() {
  try {
    const mpvPosition = mpv.getNumber("time-pos");
    if (typeof mpvPosition === "number" && isFinite(mpvPosition)) return mpvPosition;
  } catch (error) {
    // Fall through to the cached/sidebar position.
  }

  if (typeof state.positionSeconds === "number" && isFinite(state.positionSeconds)) {
    return state.positionSeconds;
  }

  try {
    const position = Number(core.status.position);
    if (typeof position === "number" && isFinite(position)) return position;
  } catch (error) {
    // No usable position is available.
  }

  return null;
}

function getCurrentDurationSeconds() {
  try {
    const mpvDuration = mpv.getNumber("duration");
    if (typeof mpvDuration === "number" && isFinite(mpvDuration) && mpvDuration > 0) return mpvDuration;
  } catch (error) {
    // Fall through to core.status duration.
  }

  try {
    const duration = Number(core.status.duration);
    if (typeof duration === "number" && isFinite(duration) && duration > 0) return duration;
  } catch (error) {
    // Duration is optional for display clamping only.
  }

  return null;
}

function decodeFileUrl(url) {
  if (!url) return null;
  if (!url.startsWith("file://")) return url;
  let path = url.replace(/^file:\/\/localhost/i, "").replace(/^file:\/\//i, "");
  try {
    return decodeURIComponent(path);
  } catch (error) {
    return path;
  }
}

function getStringProperty(getter, fallback) {
  try {
    const value = getter();
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
  } catch (error) {
    logError("failed to read core/mpv status", error);
    return fallback;
  }
}

function readCurrentMediaUrl() {
  const statusUrl = getStringProperty(() => core.status.url, "");
  if (statusUrl) return statusUrl;

  const mpvPath = getStringProperty(() => mpv.getString("path"), "");
  if (mpvPath) return mpvPath;

  const streamFilename = getStringProperty(() => mpv.getString("stream-open-filename"), "");
  if (streamFilename) return streamFilename;

  return "";
}

function readCurrentMediaTitle() {
  const statusTitle = getStringProperty(() => core.status.title, "");
  if (statusTitle) return statusTitle;

  const mediaTitle = getStringProperty(() => mpv.getString("media-title"), "");
  if (mediaTitle) return mediaTitle;

  return "";
}

function basename(path) {
  if (!path) return "";
  const clean = path.replace(/\/+$/, "");
  const index = clean.lastIndexOf("/");
  return index >= 0 ? clean.slice(index + 1) : clean;
}

function dirname(path) {
  if (!path) return "";
  const index = path.lastIndexOf("/");
  return index > 0 ? path.slice(0, index) : "/";
}

function extension(path) {
  const name = basename(path);
  const index = name.lastIndexOf(".");
  return index > 0 ? name.slice(index + 1).toLowerCase() : "";
}

function utf8ByteLength(value) {
  let length = 0;
  for (const character of String(value || "")) {
    const codePoint = character.codePointAt(0);
    if (codePoint <= 0x7f) length += 1;
    else if (codePoint <= 0x7ff) length += 2;
    else if (codePoint <= 0xffff) length += 3;
    else length += 4;
  }
  return length;
}

function truncateUtf8(value, maxBytes) {
  let result = "";
  let bytes = 0;
  for (const character of String(value || "")) {
    const characterBytes = utf8ByteLength(character);
    if (bytes + characterBytes > maxBytes) break;
    result += character;
    bytes += characterBytes;
  }
  return result;
}

function sanitizeFilename(value) {
  const sanitized = String(value || "Clip")
    .replace(/[\u0000-\u001f\u007f\/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  const truncated = truncateUtf8(sanitized, 180);
  return !truncated || truncated === "." || truncated === ".." ? "Clip" : truncated;
}

function pad(number, size) {
  let text = String(number);
  while (text.length < size) text = `0${text}`;
  return text;
}

function absoluteFrameToTimecode(seconds, fps) {
  if (typeof seconds !== "number" || !isFinite(seconds)) return "--:--:--:--";
  const roundedFps = normalizeDisplayFps(fps);
  const safe = Math.max(0, seconds);
  const absoluteFrame = Math.max(0, Math.floor((safe * roundedFps) + 0.000001));
  const totalSeconds = Math.floor(absoluteFrame / roundedFps);
  const frame = absoluteFrame % roundedFps;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const wholeSeconds = totalSeconds % 60;
  return { hours, minutes, wholeSeconds, frame };
}

function formatTimecode(seconds, fps) {
  if (typeof seconds !== "number" || !isFinite(seconds)) return "--:--:--:--";
  const { hours, minutes, wholeSeconds, frame } = absoluteFrameToTimecode(seconds, fps);
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(wholeSeconds, 2)}:${pad(frame, 2)}`;
}

function formatDurationTimecode(seconds, fps) {
  return formatTimecode(seconds, fps);
}

function hasValidRange() {
  return state.inPoint !== null && state.outPoint !== null && state.outPoint > state.inPoint;
}

function normalizeDisplayFps(fps) {
  const number = Number(fps);
  if (!Number.isFinite(number) || number <= 0) return FALLBACK_FPS;
  return Math.min(240, Math.max(1, Math.round(number)));
}

function displayFps() {
  return state.displayFps || normalizeDisplayFps(state.currentVideoFps || state.fps || FALLBACK_FPS);
}

function fpsLabel() {
  if (!state.currentVideoFps && !state.fps) return "--";
  const fps = state.currentVideoFps || state.fps;
  return Number.isInteger(fps) ? String(fps) : fps.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function readMpvFpsProperty(name) {
  try {
    const value = mpv.getNumber(name);
    if (typeof value === "number" && isFinite(value) && value > 0) {
      return value;
    }
  } catch (error) {
    logError(`Could not read FPS property ${name}`, error);
  }
  return null;
}

function updateFps() {
  if (core.status.idle || !state.currentSourcePath) {
    state.fps = null;
    state.currentVideoFps = null;
    state.displayFps = null;
    state.fpsSource = "";
    state.fpsFallbackUsed = false;
    return;
  }

  const properties = ["container-fps", "estimated-vf-fps", "fps"];
  for (const property of properties) {
    const value = readMpvFpsProperty(property);
    if (value) {
      state.fps = value;
      state.currentVideoFps = value;
      state.displayFps = normalizeDisplayFps(value);
      state.fpsSource = property;
      state.fpsFallbackUsed = false;
      return;
    }
  }

  state.fps = FALLBACK_FPS;
  state.currentVideoFps = null;
  state.displayFps = FALLBACK_FPS;
  state.fpsSource = "fallback";
  if (!state.fpsFallbackUsed) {
    iina.console.warn(`[ClipMaker] FPS unavailable, using fallback FPS: ${FALLBACK_FPS}`);
  }
  state.fpsFallbackUsed = true;
}

function setSelectedClipIds(ids) {
  const requested = new Set(
    (Array.isArray(ids) ? ids : [])
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id))
  );
  state.selectedClipIds = state.clips
    .filter((clip) => requested.has(clip.id))
    .map((clip) => clip.id);
  state.selectedClipId = state.selectedClipIds.length ? state.selectedClipIds[state.selectedClipIds.length - 1] : null;
  return state.selectedClipIds;
}

function toggleSelectedClipId(id) {
  const numericId = Number(id);
  if (!Number.isFinite(numericId) || !state.clips.some((clip) => clip.id === numericId)) {
    return state.selectedClipIds;
  }

  const selected = new Set(Array.isArray(state.selectedClipIds) ? state.selectedClipIds : []);
  if (selected.has(numericId)) {
    selected.delete(numericId);
  } else {
    selected.add(numericId);
  }
  return setSelectedClipIds(Array.from(selected));
}

function selectedClipIdSet() {
  return new Set(Array.isArray(state.selectedClipIds) ? state.selectedClipIds : []);
}

function getSelectedClips(ids) {
  const selectedIds = Array.isArray(ids) ? setSelectedClipIds(ids) : state.selectedClipIds;
  const selected = new Set(Array.isArray(selectedIds) ? selectedIds : []);
  return state.clips.filter((clip) => selected.has(clip.id));
}

function playbackPaused() {
  try {
    const paused = mpv.getFlag("pause");
    if (typeof paused === "boolean") return paused;
  } catch (error) {
    // Some IINA plugin builds expose pause as a string property only.
  }

  try {
    const paused = mpv.getString("pause");
    if (paused === "yes" || paused === "true") return true;
    if (paused === "no" || paused === "false") return false;
  } catch (error) {
    // Fall through to core.status.
  }

  try {
    if (typeof core.status.paused === "boolean") return core.status.paused;
    if (typeof core.status.isPaused === "boolean") return core.status.isPaused;
    return false;
  } catch (error) {
    return false;
  }
}

function setPlaybackPaused(paused) {
  const value = paused ? "yes" : "no";
  try {
    runMpvCommand("set", ["pause", value]);
    return true;
  } catch (error) {
    try {
      runMpvCommand(`set pause ${value}`);
      return true;
    } catch (fallbackError) {
      logError(`Could not set pause=${value}`, fallbackError);
      return false;
    }
  }
}

function playbackSpeed() {
  try {
    const speed = mpv.getNumber("speed");
    if (typeof speed === "number" && isFinite(speed) && speed > 0) {
      return speed;
    }
  } catch (error) {
    // Default speed is good enough for display interpolation.
  }
  return 1;
}

function runMpvCommand(command, args) {
  if (Array.isArray(args)) {
    return mpv.command(command, args);
  }
  return mpv.command(command);
}

function cancelPreviewWatcher() {
  previewStopToken += 1;
  if (previewStopIntervalId !== null) {
    try {
      clearInterval(previewStopIntervalId);
    } catch (error) {
      logError("Could not clear preview stop watcher", error);
    }
    previewStopIntervalId = null;
  }
  if (previewStopTimeoutId !== null) {
    try {
      clearTimeout(previewStopTimeoutId);
    } catch (error) {
      logError("Could not clear preview stop timeout", error);
    }
    previewStopTimeoutId = null;
  }
}

function pausePreviewAtStop(token) {
  if (token !== previewStopToken || isDisposed) return;
  cancelPreviewWatcher();
  setPlaybackPaused(true);
  state.positionSeconds = getCurrentPositionSeconds();
  state.lastAction = "preview stopped at Out";
  postStableState("preview-stop");
}

function startPreviewStopWatcher(target, stopAt) {
  cancelPreviewWatcher();
  const numericTarget = Number(target);
  const numericStopAt = Number(stopAt);
  if (!Number.isFinite(numericStopAt)) return;

  const token = previewStopToken;
  const maxPreviewMs = Math.max(10000, ((numericStopAt - numericTarget) + 2) * 1000);

  if (numericStopAt <= numericTarget) {
    previewStopTimeoutId = setTimeout(() => pausePreviewAtStop(token), 100);
    return;
  }

  previewStopIntervalId = setInterval(() => {
    if (token !== previewStopToken || isDisposed) return;
    try {
      if (playbackPaused()) {
        cancelPreviewWatcher();
        return;
      }
      const position = getCurrentPositionSeconds();
      if (typeof position !== "number" || !Number.isFinite(position)) {
        cancelPreviewWatcher();
        return;
      }
      if (position >= numericStopAt - PREVIEW_STOP_TOLERANCE_SECONDS) {
        pausePreviewAtStop(token);
      }
    } catch (error) {
      logError("preview stop watcher failed safely", error);
      cancelPreviewWatcher();
    }
  }, PREVIEW_STOP_POLL_MS);

  previewStopTimeoutId = setTimeout(() => {
    if (token !== previewStopToken || isDisposed) return;
    cancelPreviewWatcher();
  }, maxPreviewMs);
}

function togglePlayback() {
  try {
    cancelPreviewWatcher();
    if (!hasPlayableFile()) {
      state.lastAction = "playback toggle failed: no video loaded";
      const noFileState = buildStableState();
      if (noFileState) {
        noFileState.ok = false;
        noFileState.error = "no-video-loaded";
      }
      return noFileState;
    }

    const nextPaused = !playbackPaused();
    try {
      if (!setPlaybackPaused(nextPaused)) {
        throw new Error("could not set pause property");
      }
    } catch (setError) {
      try {
        runMpvCommand("cycle", ["pause"]);
      } catch (cycleError) {
        runMpvCommand("cycle pause");
      }
    }

    state.positionSeconds = getCurrentPositionSeconds();
    const paused = playbackPaused();
    state.lastAction = paused ? "playback paused" : "playback playing";
    const playbackState = buildStableState();
    if (playbackState) {
      playbackState.ok = true;
      playbackState.paused = paused;
    }
    return playbackState;
  } catch (error) {
    logError("playback toggle failed safely", error);
    state.lastAction = `playback toggle failed: ${error && error.message ? error.message : String(error)}`;
    try {
      const errorState = buildStableState();
      if (errorState) {
        errorState.ok = false;
        errorState.error = error && error.message ? error.message : String(error);
      }
      return errorState;
    } catch (stateError) {
      logError("playback toggle failure state build failed safely", stateError);
      return {
        ok: false,
        error: error && error.message ? error.message : String(error)
      };
    }
  }
}

function normalizedHotkeyName(payload) {
  const key = String(payload && payload.key || "");
  const code = String(payload && payload.code || "");
  if (code === "Space" || key === " " || key === "Spacebar") return "Space";
  if (key === "ArrowLeft" || code === "ArrowLeft") return "ArrowLeft";
  if (key === "ArrowRight" || code === "ArrowRight") return "ArrowRight";
  if (key === "ArrowUp" || code === "ArrowUp") return "ArrowUp";
  if (key === "ArrowDown" || code === "ArrowDown") return "ArrowDown";
  const letter = key.length === 1 ? key.toUpperCase() : "";
  if (letter === "M" || code === "KeyM") return "M";
  if (letter === "K" || code === "KeyK") return "K";
  return "";
}

function seekRelative(seconds) {
  const amount = Number(seconds);
  if (!Number.isFinite(amount) || amount === 0) return false;
  try {
    runMpvCommand("seek", [String(amount), "relative", "exact"]);
    return true;
  } catch (error) {
    try {
      runMpvCommand("seek", [String(amount), "relative"]);
      return true;
    } catch (fallbackError) {
      logError(`relative seek ${amount} failed safely`, fallbackError);
      return false;
    }
  }
}

function addVolume(delta) {
  const amount = Number(delta);
  if (!Number.isFinite(amount) || amount === 0) return false;
  try {
    runMpvCommand("add", ["volume", String(amount)]);
    return true;
  } catch (error) {
    try {
      runMpvCommand(`add volume ${amount}`);
      return true;
    } catch (fallbackError) {
      logError(`volume add ${amount} failed safely`, fallbackError);
      return false;
    }
  }
}

function toggleMute() {
  try {
    runMpvCommand("cycle", ["mute"]);
    return true;
  } catch (error) {
    try {
      runMpvCommand("cycle mute");
      return true;
    } catch (fallbackError) {
      logError("mute toggle failed safely", fallbackError);
      return false;
    }
  }
}

function playerHotkey(payload) {
  try {
    const data = payload && typeof payload === "object" ? payload : {};
    const keyName = normalizedHotkeyName(data);
    const shiftKey = Boolean(data.shiftKey);
    if (!keyName) {
      return { ok: false, error: "unsupported-hotkey" };
    }

    if ((keyName === "Space" || keyName === "K") && !hasPlayableFile()) {
      return { ok: false, error: "No player" };
    }

    if (keyName === "Space" || keyName === "K") {
      const toggleState = togglePlayback();
      if (toggleState && toggleState.ok !== false) toggleState.hotkey = keyName;
      return toggleState;
    }

    let ok = false;
    let action = "";
    if (keyName === "ArrowLeft" || keyName === "ArrowRight") {
      if (!hasPlayableFile()) return { ok: false, error: "No player" };
      const direction = keyName === "ArrowRight" ? 1 : -1;
      const seconds = direction * (shiftKey ? 30 : 5);
      ok = seekRelative(seconds);
      action = `seek ${seconds > 0 ? "+" : ""}${seconds}s`;
      state.positionSeconds = getCurrentPositionSeconds();
    } else if (keyName === "ArrowUp" || keyName === "ArrowDown") {
      const delta = keyName === "ArrowUp" ? 5 : -5;
      ok = addVolume(delta);
      action = `volume ${delta > 0 ? "+" : ""}${delta}`;
    } else if (keyName === "M") {
      ok = toggleMute();
      action = "mute toggle";
    }

    if (!ok) {
      return { ok: false, error: action ? `${action} failed` : "unsupported-hotkey" };
    }

    state.lastAction = `hotkey ${action}`;
    const hotkeyState = buildStableState();
    if (hotkeyState) {
      hotkeyState.ok = true;
      hotkeyState.hotkey = keyName;
      hotkeyState.action = action;
    }
    return hotkeyState;
  } catch (error) {
    logError("player hotkey failed safely", error);
    try {
      const errorState = buildStableState();
      if (errorState) {
        errorState.ok = false;
        errorState.error = error && error.message ? error.message : String(error);
      }
      return errorState;
    } catch (stateError) {
      logError("player hotkey failure state build failed safely", stateError);
      return {
        ok: false,
        error: error && error.message ? error.message : String(error)
      };
    }
  }
}

function sanitizePreviewTarget(seconds) {
  const requested = Number(seconds);
  if (!Number.isFinite(requested) || requested < 0) return null;

  const duration = getCurrentDurationSeconds();
  if (typeof duration === "number" && Number.isFinite(duration)) {
    return Math.min(requested, duration);
  }
  return requested;
}

function clampMarkSeconds(markName, seconds) {
  const requested = Number(seconds);
  if (!Number.isFinite(requested)) return null;

  let value = Math.max(0, requested);
  const duration = getCurrentDurationSeconds();
  if (typeof duration === "number" && Number.isFinite(duration)) {
    value = Math.min(value, duration);
  }

  if (markName === "in" && typeof state.outPoint === "number" && Number.isFinite(state.outPoint)) {
    value = Math.min(value, state.outPoint);
  } else if (markName === "out" && typeof state.inPoint === "number" && Number.isFinite(state.inPoint)) {
    value = Math.max(value, state.inPoint);
  }
  return value;
}

function seekToMarkForConfirmation(seconds) {
  const target = Number(seconds);
  if (!Number.isFinite(target) || target < 0 || !hasPlayableFile()) return false;
  const targetText = String(target);
  try {
    runMpvCommand("seek", [targetText, "absolute", "exact"]);
    state.positionSeconds = getCurrentPositionSeconds();
    return true;
  } catch (seekError) {
    try {
      runMpvCommand("seek", [targetText, "absolute"]);
      state.positionSeconds = getCurrentPositionSeconds();
      return true;
    } catch (fallbackError) {
      logError("mark confirmation seek failed safely", fallbackError);
      return false;
    }
  }
}

function setMarkTime(markName, seconds, shouldSeek) {
  try {
    cancelPreviewWatcher();
    const normalizedMarkName = markName === "out" ? "out" : markName === "in" ? "in" : "";
    if (!normalizedMarkName) {
      state.lastAction = "mark edit failed: invalid mark";
      const invalidMarkState = buildStableState();
      if (invalidMarkState) invalidMarkState.ok = false;
      return invalidMarkState;
    }

    const value = clampMarkSeconds(normalizedMarkName, seconds);
    if (value === null) {
      state.lastAction = "mark edit failed: invalid timecode";
      const invalidTimeState = buildStableState();
      if (invalidTimeState) invalidTimeState.ok = false;
      return invalidTimeState;
    }

    if (normalizedMarkName === "in") {
      state.inPoint = value;
      state.lastAction = "in adjusted";
    } else {
      state.outPoint = value;
      state.lastAction = "out adjusted";
    }

    if (shouldSeek) {
      seekToMarkForConfirmation(value);
    }

    const markState = buildStableState();
    if (markState) {
      markState.ok = true;
      markState.editedMark = normalizedMarkName;
    }
    return markState;
  } catch (error) {
    logError("mark edit failed safely", error);
    state.lastAction = `mark edit failed: ${error && error.message ? error.message : String(error)}`;
    try {
      const errorState = buildStableState();
      if (errorState) {
        errorState.ok = false;
        errorState.error = error && error.message ? error.message : String(error);
      }
      return errorState;
    } catch (stateError) {
      logError("mark edit failure state build failed safely", stateError);
      return {
        ok: false,
        error: error && error.message ? error.message : String(error)
      };
    }
  }
}

function setPositionTime(seconds) {
  try {
    cancelPreviewWatcher();
    syncStableMediaInfo();
    if (!hasPlayableFile()) {
      state.lastAction = "position edit failed: no video loaded";
      const noFileState = buildStableState();
      if (noFileState) noFileState.ok = false;
      return noFileState;
    }

    const requested = Number(seconds);
    if (!Number.isFinite(requested) || requested < 0) {
      state.lastAction = "position edit failed: invalid timecode";
      const invalidState = buildStableState();
      if (invalidState) invalidState.ok = false;
      return invalidState;
    }

    const duration = getCurrentDurationSeconds();
    const target = (typeof duration === "number" && Number.isFinite(duration) && duration > 0)
      ? Math.min(requested, duration)
      : requested;

    if (!seekAbsoluteSeconds(target, "position edit seek")) {
      state.lastAction = "position edit failed: seek";
      const seekState = buildStableState();
      if (seekState) seekState.ok = false;
      return seekState;
    }

    state.positionSeconds = getCurrentPositionSeconds();
    state.lastAction = `position set to ${formatTimecode(target, displayFps())}`;
    const positionState = buildStableState();
    if (positionState) {
      positionState.ok = true;
      positionState.position = state.positionSeconds;
    }
    return positionState;
  } catch (error) {
    logError("position edit failed safely", error);
    state.lastAction = `position edit failed: ${error && error.message ? error.message : String(error)}`;
    const errorState = buildStableState();
    if (errorState) errorState.ok = false;
    return errorState;
  }
}

function sanitizePreviewStopAt(seconds) {
  if (seconds === undefined || seconds === null) return null;
  const requested = Number(seconds);
  if (!Number.isFinite(requested) || requested < 0) return null;

  const duration = getCurrentDurationSeconds();
  if (typeof duration === "number" && Number.isFinite(duration)) {
    return Math.min(requested, duration);
  }
  return requested;
}

function previewPlay(options) {
  try {
    cancelPreviewWatcher();
    syncStableMediaInfo();
    if (!hasPlayableFile()) {
      state.lastAction = "preview failed: no video loaded";
      const noFileState = buildStableState();
      if (noFileState) noFileState.ok = false;
      return noFileState;
    }

    const payload = options && typeof options === "object" ? options : {};
    const target = sanitizePreviewTarget(payload.target);
    if (target === null) {
      state.lastAction = "preview failed: invalid target";
      const invalidState = buildStableState();
      if (invalidState) invalidState.ok = false;
      return invalidState;
    }
    const stopAt = sanitizePreviewStopAt(payload.stopAt);
    const targetText = String(target);

    try {
      runMpvCommand("seek", [targetText, "absolute", "exact"]);
    } catch (seekError) {
      try {
        runMpvCommand("seek", [targetText, "absolute"]);
      } catch (fallbackError) {
        state.lastAction = `preview seek failed: ${fallbackError && fallbackError.message ? fallbackError.message : String(fallbackError)}`;
        logError("preview play seek command failed safely", fallbackError);
        const seekErrorState = buildStableState();
        if (seekErrorState) seekErrorState.ok = false;
        return seekErrorState;
      }
    }

    if (!setPlaybackPaused(false)) {
      state.lastAction = "preview failed: could not start playback";
      const playErrorState = buildStableState();
      if (playErrorState) playErrorState.ok = false;
      return playErrorState;
    }

    if (typeof stopAt === "number" && Number.isFinite(stopAt)) {
      startPreviewStopWatcher(target, stopAt);
    }

    state.positionSeconds = getCurrentPositionSeconds();
    state.lastAction = typeof stopAt === "number" && Number.isFinite(stopAt)
      ? `preview playing until ${formatTimecode(stopAt, displayFps())}`
      : `preview playing from ${formatTimecode(target, displayFps())}`;
    const previewState = buildStableState();
    if (previewState) {
      previewState.ok = true;
      previewState.preview = { target, stopAt };
    }
    return previewState;
  } catch (error) {
    logError("preview play failed safely", error);
    state.lastAction = `preview failed: ${error && error.message ? error.message : String(error)}`;
    cancelPreviewWatcher();
    try {
      const errorState = buildStableState();
      if (errorState) {
        errorState.ok = false;
        errorState.error = error && error.message ? error.message : String(error);
      }
      return errorState;
    } catch (stateError) {
      logError("preview play failure state build failed safely", stateError);
      return {
        ok: false,
        error: error && error.message ? error.message : String(error)
      };
    }
  }
}

function seekAbsoluteSeconds(seconds, context) {
  const target = Number(seconds);
  if (!Number.isFinite(target) || target < 0) return false;
  const targetText = String(target);
  try {
    runMpvCommand("seek", [targetText, "absolute", "exact"]);
    return true;
  } catch (seekError) {
    try {
      runMpvCommand("seek", [targetText, "absolute"]);
      return true;
    } catch (fallbackError) {
      logError(`${context || "absolute seek"} failed safely`, fallbackError);
      return false;
    }
  }
}

function getNavigationSnapshot() {
  try {
    syncStableMediaInfo();
    if (!hasPlayableFile()) {
      return { ok: false, error: "no-video-loaded" };
    }

    const position = getCurrentPositionSeconds();
    if (typeof position !== "number" || !Number.isFinite(position)) {
      return { ok: false, error: "position-unavailable" };
    }

    return {
      ok: true,
      fileId: state.currentSourcePath || "",
      position: Math.max(0, position),
      paused: playbackPaused()
    };
  } catch (error) {
    logError("navigation snapshot failed safely", error);
    return {
      ok: false,
      error: error && error.message ? error.message : String(error)
    };
  }
}

function restoreNavigationPoint(point) {
  try {
    cancelPreviewWatcher();
    syncStableMediaInfo();
    if (!hasPlayableFile()) {
      return { ok: false, error: "no-video-loaded" };
    }

    const payload = point && typeof point === "object" ? point : {};
    const fileId = String(payload.fileId || "");
    const currentFileId = String(state.currentSourcePath || "");
    if (!fileId || !currentFileId || fileId !== currentFileId) {
      return { ok: false, error: "file-changed" };
    }

    const requestedPosition = Number(payload.position);
    if (!Number.isFinite(requestedPosition) || requestedPosition < 0) {
      return { ok: false, error: "invalid-position" };
    }

    const duration = getCurrentDurationSeconds();
    const target = (typeof duration === "number" && Number.isFinite(duration) && duration > 0)
      ? Math.min(requestedPosition, duration)
      : requestedPosition;
    const paused = payload.paused !== false;

    if (!seekAbsoluteSeconds(target, "navigation restore seek")) {
      state.lastAction = "back failed: seek";
      const seekState = buildStableState();
      if (seekState) {
        seekState.ok = false;
        seekState.error = "seek-failed";
      }
      return seekState || { ok: false, error: "seek-failed" };
    }

    if (!setPlaybackPaused(paused)) {
      state.lastAction = "back failed: playback state";
      const pauseState = buildStableState();
      if (pauseState) {
        pauseState.ok = false;
        pauseState.error = "pause-restore-failed";
      }
      return pauseState || { ok: false, error: "pause-restore-failed" };
    }

    state.positionSeconds = getCurrentPositionSeconds();
    state.lastAction = `back to ${formatTimecode(target, displayFps())}`;
    const restoredState = buildStableState();
    if (restoredState) {
      restoredState.ok = true;
      restoredState.position = state.positionSeconds;
      restoredState.paused = playbackPaused();
      restoredState.navigationRestore = {
        position: state.positionSeconds,
        paused: restoredState.paused
      };
    }
    return restoredState;
  } catch (error) {
    logError("navigation restore failed safely", error);
    state.lastAction = `back failed: ${error && error.message ? error.message : String(error)}`;
    try {
      const errorState = buildStableState();
      if (errorState) {
        errorState.ok = false;
        errorState.error = error && error.message ? error.message : String(error);
      }
      return errorState;
    } catch (stateError) {
      logError("navigation restore failure state build failed safely", stateError);
      return {
        ok: false,
        error: error && error.message ? error.message : String(error)
      };
    }
  }
}

function normalizeFfmpegPathPreference(value) {
  const text = String(value == null ? "" : value).trim();
  return text === "ffmpeg" ? "" : text;
}

function setFfmpegUnavailable(status) {
  state.ffmpegAvailable = false;
  state.ffmpegFound = false;
  state.ffmpegPath = "";
  state.ffmpegStatus = status || "ffmpeg off";
  if (!String(state.ffmpegStatus || "").startsWith("Invalid FFmpeg executable") &&
      String(state.lastError || "").startsWith("Invalid FFmpeg executable")) {
    state.lastError = "";
  }
  return false;
}

function rememberFfmpegPreferenceValue(value) {
  lastObservedFfmpegPathPreference = normalizeFfmpegPathPreference(value);
}

function saveFfmpegPathPreference(path) {
  const normalized = normalizeFfmpegPathPreference(path);
  rememberFfmpegPreferenceValue(normalized);
  try {
    if (normalizeFfmpegPathPreference(iina.preferences.get("ffmpegPath")) !== normalized) {
      iina.preferences.set("ffmpegPath", normalized);
    }
  } catch (error) {
    logError("Could not save ffmpeg path preference", error);
  }
}

function dedupePaths(paths) {
  const seen = new Set();
  return paths.filter((path) => {
    const normalized = normalizeFfmpegPathPreference(path);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function isAbsoluteFilesystemPath(path) {
  return normalizeFfmpegPathPreference(path).startsWith("/");
}

function execWithSoftTimeout(executable, args, cwd, timeoutMs) {
  let didTimeout = false;
  let timeoutId = null;
  const timeout = new Promise((resolve) => {
    timeoutId = setTimeout(() => {
      didTimeout = true;
      resolve({ status: -1, stdout: "", stderr: "timed out" });
    }, timeoutMs);
  });
  return Promise.race([
    utils.exec(executable, args, cwd),
    timeout
  ]).then((result) => Object.assign({}, result, { timedOut: didTimeout }))
    .finally(() => {
      if (timeoutId !== null) clearTimeout(timeoutId);
    });
}

async function validateFfmpegExecutable(candidate) {
  const candidatePath = normalizeFfmpegPathPreference(candidate);
  if (!candidatePath) return { valid: false, path: "", reason: "empty" };
  if (!isAbsoluteFilesystemPath(candidatePath)) {
    return { valid: false, path: candidatePath, reason: "not absolute" };
  }
  if (!file.exists(candidatePath)) {
    return { valid: false, path: candidatePath, reason: "not found" };
  }

  try {
    const result = await execWithSoftTimeout(candidatePath, ["-version"], dirname(candidatePath), 1800);
    if (isDisposed) return { valid: false, path: candidatePath, reason: "disposed" };
    if (result.timedOut) return { valid: false, path: candidatePath, reason: "timed out" };
    if (result.status !== 0) {
      return { valid: false, path: candidatePath, reason: `exit ${result.status}` };
    }
    const firstLine = String(`${result.stdout || ""}\n${result.stderr || ""}`).split(/\r?\n/).find(Boolean) || "";
    if (!/^ffmpeg version\b/i.test(firstLine.trim())) {
      return { valid: false, path: candidatePath, reason: "not ffmpeg" };
    }
    return { valid: true, path: candidatePath, firstLine };
  } catch (error) {
    return {
      valid: false,
      path: candidatePath,
      reason: error && error.message ? error.message : String(error)
    };
  }
}

async function resolveCommandPath(commandPath, args) {
  try {
    const result = await execWithSoftTimeout(commandPath, args, null, 1200);
    if (isDisposed || result.status !== 0 || result.timedOut) return "";
    return normalizeFfmpegPathPreference(String(result.stdout || "").split(/\r?\n/)[0] || "");
  } catch (error) {
    logError(`ffmpeg path lookup failed: ${commandPath}`, error);
    return "";
  }
}

async function collectFfmpegCandidates() {
  const candidates = FFMPEG_CANDIDATE_PATHS.slice();
  const whichPath = await resolveCommandPath("/usr/bin/which", ["ffmpeg"]);
  if (whichPath) candidates.push(whichPath);
  return dedupePaths(candidates);
}

async function findDetectedFfmpeg() {
  const candidates = await collectFfmpegCandidates();
  for (const candidate of candidates) {
    const validation = await validateFfmpegExecutable(candidate);
    if (isDisposed) return null;
    if (validation.valid) return validation;
  }
  return null;
}

async function refreshFfmpegIfPreferenceChanged(force) {
  if (isDisposed || ffmpegPreferenceCheckInFlight) return;
  const now = Date.now();
  if (!force && now - lastFfmpegPreferencePollTime < 1000) return;
  lastFfmpegPreferencePollTime = now;
  const current = normalizeFfmpegPathPreference(pref("ffmpegPath", ""));
  if (!force && current === lastObservedFfmpegPathPreference) return;

  ffmpegPreferenceCheckInFlight = true;
  try {
    await detectStableFfmpeg();
    if (!isDisposed) postStableState("ffmpeg-preference-changed");
  } catch (error) {
    logError("ffmpeg preference refresh failed", error);
  } finally {
    ffmpegPreferenceCheckInFlight = false;
  }
}

async function resolveConfiguredOrDetectedFfmpeg() {
  const rawConfiguredPath = pref("ffmpegPath", "");
  const configuredPath = normalizeFfmpegPathPreference(rawConfiguredPath);
  rememberFfmpegPreferenceValue(configuredPath);

  if (configuredPath) {
    const configuredValidation = await validateFfmpegExecutable(configuredPath);
    if (isDisposed) return false;
    if (configuredValidation.valid) {
      return setStableFfmpegFound(configuredValidation.path, configuredValidation.path, "manual");
    }

    state.lastError = configuredValidation.reason ? `Invalid FFmpeg executable: ${configuredValidation.reason}` : "";
    return setFfmpegUnavailable("Invalid FFmpeg executable");
  }

  if (rawConfiguredPath === "ffmpeg") {
    saveFfmpegPathPreference("");
  }

  const detected = await findDetectedFfmpeg();
  if (isDisposed) return false;
  if (detected && detected.valid) {
    saveFfmpegPathPreference(detected.path);
    return setStableFfmpegFound(detected.path, detected.path, "detected");
  }

  saveFfmpegPathPreference("");
  return setFfmpegUnavailable("FFmpeg not found");
}

function showPanel() {
  sidebar.show();
  postStableState("show-panel");
}

function setInPoint() {
  cancelPreviewWatcher();
  const position = getCurrentPositionSeconds();
  if (position === null) {
    state.lastAction = "set-in failed: no current position";
    osd("Cannot set In: no valid position.");
    postStableState("set-in-failed");
    return;
  }
  state.inPoint = position;
  state.lastError = "";
  state.lastAction = `set-in received at ${formatTimecode(position, displayFps())}`;
  osd(`In set at ${formatTimecode(position, displayFps())}`);
  postStableState("set-in");
}

function setOutPoint() {
  cancelPreviewWatcher();
  const position = getCurrentPositionSeconds();
  if (position === null) {
    state.lastAction = "set-out failed: no current position";
    osd("Cannot set Out: no valid position.");
    postStableState("set-out-failed");
    return;
  }
  state.outPoint = position;
  state.lastError = "";
  state.lastAction = `set-out received at ${formatTimecode(position, displayFps())}`;
  osd(`Out set at ${formatTimecode(position, displayFps())}`);
  postStableState("set-out");
}

function clearMarks() {
  state.inPoint = null;
  state.outPoint = null;
  state.lastError = "";
  state.lastAction = "clear-marks received";
  osd("Current marks cleared.");
  postStableState("clear-marks");
}

function addClipFromMarks() {
  syncStableMediaInfo();
  if (!validateReadyForClip()) return;

  ensureClipCreationSequences();
  const index = state.clips.length + 1;
  const displayIndex = pad(index, 2);
  const defaultName = `Clip ${displayIndex}`;
  const clip = {
    id: state.nextClipId++,
    creationSequence: state.nextCreationSequence++,
    name: sanitizeFilename(defaultName),
    sourceFilePath: state.currentSourcePath,
    sourceFileDisplayName: state.currentSourceName,
    inPoint: state.inPoint,
    outPoint: state.outPoint,
    duration: state.outPoint - state.inPoint,
    createdAt: new Date().toISOString(),
    exportStatus: STATUS_PENDING,
    outputPath: ""
  };

  insertClipIntoManualOrder(clip);
  state.inPoint = null;
  state.outPoint = null;
  state.lastError = "";
  state.lastAction = `add-clip received: ${clip.name}`;
  state.exportMessage = `${clip.name} added`;
  osd(`${clip.name} added (${formatDurationTimecode(clip.duration, displayFps())})`);
  postStableState("add-clip");
}

function validateReadyForClip() {
  if (!hasPlayableFile()) {
    state.lastError = "Open a local video before adding clips.";
    state.lastAction = "add-clip invalid: no local video";
    osd("Open a local video first.");
    maybeShowSidebarForInvalidExport();
    postStableState("add-clip-invalid");
    return false;
  }
  if (core.status.isNetworkResource) {
    state.lastError = "Network streams are not supported.";
    state.lastAction = "add-clip invalid: network stream";
    osd("Network streams are not supported yet.");
    postStableState("add-clip-invalid");
    return false;
  }
  if (!file.exists(state.currentSourcePath)) {
    state.lastError = "Source file could not be found on disk.";
    state.lastAction = "add-clip invalid: source file missing";
    osd("Source file could not be found.");
    postStableState("add-clip-invalid");
    return false;
  }
  if (!hasValidRange()) {
    state.lastError = "Set both In and Out, with Out after In.";
    state.lastAction = "add-clip invalid: range missing";
    osd("Set a valid In/Out range first.");
    postStableState("add-clip-invalid");
    return false;
  }
  return true;
}

function clearClipList() {
  if (exportIsBusy()) {
    osd("Export is already running.");
    return;
  }
  state.clips = [];
  state.selectedClipIds = [];
  state.selectedClipId = null;
  state.visibleClipIds = null;
  state.exportMessage = "Clip list cleared";
  state.lastError = "";
  osd("Clip list cleared.");
  postStableState("clear-list");
}

function maybeShowSidebarForInvalidExport() {
  if (Boolean(pref("showSidebarOnInvalidExport", true))) {
    showPanel();
  }
}

async function exportSelectedClip() {
  const selected = getSelectedClips();
  if (!selected.length) {
    state.lastError = "Select a clip before exporting.";
    osd("Select a clip first.");
    maybeShowSidebarForInvalidExport();
    postStableState("export-invalid");
    return;
  }
  await exportStableClips(false);
}

async function exportAllClips() {
  if (!state.clips.length) {
    state.lastError = "Add at least one clip before exporting.";
    osd("Add at least one clip first.");
    maybeShowSidebarForInvalidExport();
    postStableState("export-invalid");
    return;
  }
  await exportStableClips(true);
}

async function ensureDirectory(folder) {
  if (!folder) throw new Error("Output folder is unavailable.");
  const result = await utils.exec("/bin/mkdir", ["-p", folder]);
  if (result.status !== 0) {
    throw new Error(`Could not create output folder (status ${result.status})`);
  }
}

function promptText(message, defaultValue) {
  try {
    const result = utils.prompt(message, defaultValue || "");
    return result === undefined || result === null ? null : String(result);
  } catch (error) {
    logError("Prompt with default value failed; retrying without default", error);
    try {
      const result = utils.prompt(defaultValue ? `${message}\nDefault: ${defaultValue}` : message);
      return result === undefined || result === null ? null : String(result);
    } catch (fallbackError) {
      logError("Prompt failed", fallbackError);
      return null;
    }
  }
}

function setupMenu() {
  if (menuRegistered) {
    return;
  }

  const root = menu.item("ClipMaker", null);
  root.addSubMenuItem(makeMenuItem("Show ClipMaker Panel", showPanel, "shortcutShowPanel", "Meta+Shift+C"));
  root.addSubMenuItem(menu.separator());
  root.addSubMenuItem(makeMenuItem("Set In Point", setInPoint, "shortcutSetIn", "Meta+Shift+I"));
  root.addSubMenuItem(makeMenuItem("Set Out Point", setOutPoint, "shortcutSetOut", "Meta+Shift+O"));
  menuItems.addClip = makeMenuItem("Add Clip from In/Out", addClipFromMarks, "shortcutAddClip", "Meta+Shift+A");
  root.addSubMenuItem(menuItems.addClip);
  root.addSubMenuItem(menu.separator());
  menuItems.exportSelected = makeMenuItem("Export Selected Clip", exportSelectedClip, "shortcutExportSelected", "Meta+Shift+E");
  menuItems.exportAll = makeMenuItem("Export All Clips", exportAllClips, "shortcutExportAll", "Meta+Shift+Alt+E");
  root.addSubMenuItem(menuItems.exportSelected);
  root.addSubMenuItem(menuItems.exportAll);
  root.addSubMenuItem(menu.separator());
  root.addSubMenuItem(makeMenuItem("Clear Current Marks", clearMarks, "shortcutClearMarks", "Meta+Shift+K"));
  menuItems.clearList = makeMenuItem("Clear Clip List", clearClipList, "shortcutClearList", "Meta+Shift+Alt+K");
  root.addSubMenuItem(menuItems.clearList);
  menu.addItem(root);
  menuRegistered = true;
  lastObservedShortcutPreferenceSignature = shortcutPreferenceSignature();
}

function refreshShortcutMenuIfPreferenceChanged(force) {
  if (isDisposed) return;
  const now = Date.now();
  if (!force && now - lastShortcutPreferencePollTime < 500) return;
  lastShortcutPreferencePollTime = now;

  const signature = shortcutPreferenceSignature();
  if (!force && signature === lastObservedShortcutPreferenceSignature) return;

  try {
    menu.removeAllItems();
    Object.keys(menuItems).forEach((key) => delete menuItems[key]);
    menuRegistered = false;
    setupMenu();
    if (typeof menu.forceUpdate === "function") menu.forceUpdate();
    lastObservedShortcutPreferenceSignature = signature;
  } catch (error) {
    logError("Could not refresh shortcut menu", error);
  }
}

function rpcClient(iinaModule) {
  return new Proxy({}, {
    set(target, name, value) {
      if (typeof value !== "function") {
        throw new Error("RPC server only accepts functions");
      }
      if (!name.startsWith("$")) {
        throw new Error("Define RPC functions with $ prefix");
      }

      target[name] = value;
      const callMessageName = `#call.${name}`;
      if (rpcMessageNames.includes(callMessageName)) {
        throw new Error(`RPC method already registered: ${name}`);
      }
      rpcMessageNames.push(callMessageName);
      iinaModule.onMessage(callMessageName, async function (message) {
        if (isDisposed) return;
        const args = message && Array.isArray(message.args) ? message.args : [];
        try {
          let result = value.apply(null, args);
          if (result instanceof Promise) {
            result = await result;
          }
          if (isDisposed) return;
          iinaModule.postMessage(`#on.${name}`, { res: result });
        } catch (error) {
          if (isDisposed) return;
          logError(`RPC ${name} failed`, error);
          let failure = null;
          try {
            failure = buildStableState();
          } catch (stateError) {
            logError(`RPC ${name} failure state could not be built`, stateError);
          }
          if (failure && typeof failure === "object") {
            failure.ok = false;
            failure.error = "rpc-failed";
          }
          iinaModule.postMessage(`#on.${name}`, {
            res: failure || { ok: false, error: "rpc-failed" }
          });
        }
      });
      return true;
    },
    get(target, name) {
      if (typeof name !== "string" || !name.startsWith("$")) {
        return target[name];
      }

      return function (...args) {
        return new Promise((resolve) => {
          iinaModule.onMessage(`#on.${name}`, function (message) {
            iinaModule.onMessage(`#on.${name}`, null);
            resolve(message ? message.res : undefined);
          });
          iinaModule.postMessage(`#call.${name}`, { args });
        });
      };
    }
  });
}

function syncStableMediaInfo() {
  if (isDisposed) return;
  const previousPath = state.currentSourcePath;
  const url = readCurrentMediaUrl();
  const decodedPath = decodeFileUrl(url);
  const title = readCurrentMediaTitle();

  if (core.status.idle) {
    const hasSessionState = Boolean(
      previousPath ||
      state.inPoint !== null ||
      state.outPoint !== null ||
      state.clips.length ||
      state.selectedClipIds.length ||
      state.exporting ||
      exportPreflightInFlight ||
      state.lastExportedFile
    );
    if (hasSessionState) resetStableMediaSession("file closed");
    state.currentSourcePath = null;
    state.currentSourceName = "No file loaded";
    state.positionSeconds = null;
    state.fps = null;
    state.currentVideoFps = null;
    state.displayFps = null;
    state.fpsSource = "";
    state.fpsFallbackUsed = false;
    return;
  }

  state.currentSourcePath = decodedPath || null;
  state.currentSourceName = basename(decodedPath || "") || title || "No file loaded";

  if (previousPath && state.currentSourcePath && previousPath !== state.currentSourcePath) {
    resetStableMediaSession("new file loaded");
  }

  updateFps();
}

function resetStableMediaSession(action) {
  exportGeneration += 1;
  exportPreflightInFlight = false;
  state.exporting = false;
  cancelPreviewWatcher();
  state.inPoint = null;
  state.outPoint = null;
  state.clips = [];
  state.selectedClipIds = [];
  state.selectedClipId = null;
  state.nextClipId = 1;
  state.nextCreationSequence = 1;
  state.visibleClipIds = null;
  state.exportMessage = action === "file closed" ? "Idle" : "Clip list cleared for new file";
  state.lastExportedFile = "";
  state.lastError = "";
  state.lastAction = action;
}

function updateStablePosition() {
  if (isDisposed) return state.positionSeconds;
  if (!hasPlayableFile()) {
    state.positionSeconds = null;
    return null;
  }
  const position = getCurrentPositionSeconds();
  state.positionSeconds = position;
  return position;
}

function buildStableState() {
  if (isDisposed) return null;
  syncStableMediaInfo();
  ensureClipCreationSequences();
  const positionSeconds = updateStablePosition();
  const rangeSeconds = hasValidRange() ? state.outPoint - state.inPoint : null;
  const fps = displayFps();
  const durationSeconds = getCurrentDurationSeconds();
  const selectedIds = selectedClipIdSet();

  return {
    title: "ClipMaker",
    currentFileName: state.currentSourceName || "No file loaded",
    currentFilePath: state.currentSourcePath || "",
    invertTimecodeScrolling: invertTimecodeScrollingPreference(),
    invertTimecodeDragging: invertTimecodeDraggingPreference(),
    timecodeScrollSensitivity: timecodeScrollSensitivityPreference(),
    timecodeDragSensitivity: timecodeDragSensitivityPreference(),
    exportMode: exportMode(),
    askWhereToSave: askWhereToSavePreference(),
    clipSortMode: clipSortModePreference(),
    clipSortDirection: clipSortDirectionPreference(),
    addNewClipsToTop: addNewClipsToTopPreference(),
    clipViewOrderNeedsSync: !Array.isArray(state.visibleClipIds),
    deleteWithoutConfirmation: deleteWithoutConfirmationPreference(),
    deleteClipsAfterExport: deleteClipsAfterExportPreference(),
    canUsePrecisionControls: hasPlayableFile(),
    paused: playbackPaused(),
    playbackSpeed: playbackSpeed(),
    currentVideoFps: state.currentVideoFps,
    displayFps: fps,
    positionSeconds,
    durationSeconds,
    inPoint: state.inPoint,
    outPoint: state.outPoint,
    rangeSeconds,
    canAddClip: hasLocalPlayableFile() && hasValidRange() && !exportIsBusy(),
    clips: state.clips.map((clip) => ({
      id: clip.id,
      creationSequence: clip.creationSequence,
      name: clip.name,
      sourceFilePath: clip.sourceFilePath || "",
      sourceFileDisplayName: clip.sourceFileDisplayName || "",
      inPoint: clip.inPoint,
      outPoint: clip.outPoint,
      duration: clip.duration,
      inPointText: formatTimecode(clip.inPoint, fps),
      outPointText: formatTimecode(clip.outPoint, fps),
      durationText: formatDurationTimecode(clip.duration, fps),
      exportStatus: clip.exportStatus,
      outputPath: clip.outputPath || "",
      selected: selectedIds.has(clip.id)
    })),
    selectedClipIds: state.selectedClipIds.slice(),
    selectedClipId: state.selectedClipId,
    lastAction: state.lastAction,
    exporting: exportIsBusy(),
    exportMessage: state.exportMessage,
    lastExportedFile: state.lastExportedFile,
    lastExportFolder: state.lastExportFolder,
    lastError: state.lastError,
    ffmpegAvailable: state.ffmpegAvailable,
    ffmpegFound: state.ffmpegFound,
    ffmpegStatus: state.ffmpegStatus,
    ffmpegPath: state.ffmpegPath,
    canSetMarks: true,
    canClearMarks: state.inPoint !== null || state.outPoint !== null,
    canClearList: state.clips.length > 0 && !exportIsBusy(),
    canUseFfmpeg: true,
    canExportSelected: state.selectedClipIds.length > 0 && state.ffmpegAvailable && !exportIsBusy(),
    canExportAll: state.clips.length > 0 && state.ffmpegAvailable && !exportIsBusy(),
    fps,
    fpsText: fpsLabel()
  };
}

function postStableState(reason) {
  if (isDisposed) return null;
  const payload = buildStableState();
  if (!payload || isDisposed) return payload;
  try {
    sidebar.postMessage("state", payload);
  } catch (error) {
    if (!isDisposed) logError("Could not post stable state", error);
  }
  return payload;
}

function isRemoteSourcePath(path) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(String(path || "")) && !String(path || "").startsWith("file://");
}

function setStableFfmpegFound(path, label, source) {
  state.ffmpegAvailable = true;
  state.ffmpegFound = true;
  state.ffmpegPath = path;
  state.ffmpegStatus = source === "detected"
    ? `ffmpeg detected: ${label || path}`
    : `ffmpeg on: ${label || path}`;
  state.lastError = String(state.lastError || "").startsWith("Invalid FFmpeg executable") ? "" : state.lastError;
  return true;
}

async function detectStableFfmpeg() {
  if (isDisposed) return false;
  const resolved = await resolveConfiguredOrDetectedFfmpeg();
  return resolved;
}

function stableOutputExtension(clip) {
  const container = normalizeContainerPreference(pref("container", SOURCE_CONTAINER_VALUE));
  if (container !== SOURCE_CONTAINER_VALUE) return container;
  return extension(clip.sourceFilePath) || "mp4";
}

function stableOutputFolder() {
  const configured = String(pref("outputFolder", "") || "").trim();
  return utils.resolvePath(configured || DEFAULT_OUTPUT_FOLDER);
}

function normalizeFolderPath(folder) {
  const text = String(folder || "").trim();
  if (!text) return "";
  if (text === "/") return text;
  return text.replace(/\/+$/, "");
}

function currentExportFolder() {
  const rememberedFolder = normalizeFolderPath(state.lastExportFolder);
  if (rememberedFolder) return rememberedFolder;
  const lastExportedFile = String(state.lastExportedFile || "").trim();
  if (lastExportedFile) return normalizeFolderPath(dirname(lastExportedFile));
  return normalizeFolderPath(stableOutputFolder());
}

async function showContainingExportFolder() {
  const folder = currentExportFolder();
  try {
    await ensureDirectory(folder);
    const result = await utils.exec("/usr/bin/open", [folder], folder);
    if (isDisposed) return null;
    if (!result || result.status !== 0) {
      throw new Error(result && (result.stderr || result.stdout) || "Finder could not open the export folder");
    }
    state.lastAction = `export folder opened: ${folder}`;
    const response = buildStableState();
    response.ok = true;
    response.exportFolder = folder;
    return response;
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    state.lastError = message;
    state.lastAction = `export folder open failed: ${message}`;
    const response = buildStableState();
    response.ok = false;
    response.error = message;
    response.exportFolder = folder;
    return response;
  }
}

async function chooseExportFolder() {
  try {
    const result = await utils.exec("/usr/bin/osascript", [
      "-e",
      'set chosenFolder to choose folder with prompt "Choose where to save ClipMaker exports"',
      "-e",
      "POSIX path of chosenFolder"
    ]);
    if (result.status !== 0) {
      const detail = `${result.stderr || ""} ${result.stdout || ""}`;
      if (detail.includes("-128") || detail.toLowerCase().includes("user canceled")) {
        return { ok: false, cancelled: true };
      }
      return { ok: false, error: result.stderr || result.stdout || `folder picker exited with status ${result.status}` };
    }
    const chosenPath = normalizeFolderPath(result.stdout);
    if (!chosenPath) return { ok: false, cancelled: true };
    return { ok: true, path: chosenPath };
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    if (message.includes("-128") || message.toLowerCase().includes("user canceled")) {
      return { ok: false, cancelled: true };
    }
    return { ok: false, error: message };
  }
}

async function resolveBatchOutputFolder() {
  if (!askWhereToSavePreference()) {
    return {
      ok: true,
      path: stableOutputFolder(),
      temporary: false
    };
  }

  const result = await chooseExportFolder();
  if (!result || !result.ok) return result || { ok: false, cancelled: true };
  return {
    ok: true,
    path: normalizeFolderPath(result.path),
    temporary: true
  };
}

function stableOutputBaseName(clip, index) {
  return sanitizeFilename(clip && clip.name || `Clip ${pad(index, 2)}`);
}

function stableOutputPath(clip, index, explicitFolder) {
  const folder = normalizeFolderPath(explicitFolder) || stableOutputFolder();
  const ext = stableOutputExtension(clip);
  const extensionSuffix = `.${ext}`;
  const originalBase = stableOutputBaseName(clip, index);
  const base = originalBase.toLowerCase().endsWith(extensionSuffix.toLowerCase())
    ? sanitizeFilename(originalBase.slice(0, -extensionSuffix.length))
    : originalBase;
  let candidate = `${folder}/${base}.${ext}`;
  let suffix = 2;

  while (file.exists(candidate)) {
    candidate = `${folder}/${base}_${pad(suffix, 2)}.${ext}`;
    suffix += 1;
  }

  return candidate;
}

function buildExportArguments(options) {
  const mode = normalizeExportModePreference(options && options.mode);
  const inputPath = options && options.inputPath;
  const outputPath = options && options.outputPath;
  const start = Number(options && options.start);
  const duration = Number(options && options.duration);
  const container = String((options && options.container) || extension(outputPath) || "").toLowerCase();
  if (!inputPath) throw new Error("Missing export input path");
  if (!outputPath) throw new Error("Missing export output path");
  if (!Number.isFinite(start) || start < 0) throw new Error(`Invalid export start: ${start}`);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(`Invalid export duration: ${duration}`);

  // The filename preflight chooses a free suffix; -n also protects against a
  // file appearing between that check and the FFmpeg process starting.
  const args = ["-n"];
  if (mode === "fast") {
    args.push(
      "-ss", String(start),
      "-i", inputPath,
      "-t", String(duration),
      "-map", "0:v:0?",
      "-map", "0:a?"
    );
    args.push("-c", "copy");
  } else {
    args.push(
      "-i", inputPath,
      "-ss", String(start),
      "-t", String(duration),
      "-map", "0:v:0?",
      "-map", "0:a?"
    );
    args.push(
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "18",
      "-c:a", "aac",
      "-b:a", "192k"
    );
    if (containerSupportsFastStart(container)) {
      args.push("-movflags", "+faststart");
    }
  }

  args.push(outputPath);
  return {
    mode,
    strategy: mode === "fast" ? "stream-copy" : "re-encode",
    args
  };
}

function stableFfmpegPlan(clip, outputPath, mode) {
  return buildExportArguments({
    mode,
    inputPath: clip.sourceFilePath,
    outputPath,
    start: clip.inPoint,
    duration: clip.outPoint - clip.inPoint,
    container: extension(outputPath)
  });
}

function compareClipSortField(left, right, mode) {
  if (mode === "name") {
    return String(left && left.name || "").localeCompare(
      String(right && right.name || ""),
      undefined,
      { numeric: true, sensitivity: "base" }
    );
  }

  let leftValue = 0;
  let rightValue = 0;
  if (mode === "creation") {
    leftValue = Number(left && left.creationSequence);
    rightValue = Number(right && right.creationSequence);
  } else if (mode === "duration") {
    leftValue = Number(left && left.duration);
    rightValue = Number(right && right.duration);
  } else if (mode === "in") {
    leftValue = Number(left && left.inPoint);
    rightValue = Number(right && right.inPoint);
  } else if (mode === "out") {
    leftValue = Number(left && left.outPoint);
    rightValue = Number(right && right.outPoint);
  }
  if (!Number.isFinite(leftValue)) leftValue = Number.POSITIVE_INFINITY;
  if (!Number.isFinite(rightValue)) rightValue = Number.POSITIVE_INFINITY;
  return leftValue === rightValue ? 0 : leftValue < rightValue ? -1 : 1;
}

function sortedClipView(clips, mode, direction) {
  const items = Array.isArray(clips) ? clips.slice() : [];
  const normalizedMode = normalizeClipSortMode(mode);
  const normalizedDirection = normalizeClipSortDirection(direction);
  if (normalizedMode === "manual") {
    return normalizedDirection === "descending" ? items.reverse() : items;
  }

  const multiplier = normalizedDirection === "descending" ? -1 : 1;
  return items.map((clip, stableIndex) => ({ clip, stableIndex })).sort((left, right) => {
    const fieldOrder = compareClipSortField(left.clip, right.clip, normalizedMode);
    if (fieldOrder !== 0) return fieldOrder * multiplier;
    const creationOrder = Number(left.clip && left.clip.creationSequence) - Number(right.clip && right.clip.creationSequence);
    if (Number.isFinite(creationOrder) && creationOrder !== 0) return creationOrder;
    const idOrder = stableClipIdCompare(left.clip, right.clip);
    if (idOrder !== 0) return idOrder;
    return left.stableIndex - right.stableIndex;
  }).map((entry) => entry.clip);
}

function orderedClipsFromVisibleIds(orderedVisibleIds) {
  const clipsById = new Map(state.clips.map((clip) => [String(clip.id), clip]));
  const seen = new Set();
  const ordered = [];
  orderedVisibleIds.forEach((id) => {
    const key = String(id);
    if (seen.has(key) || !clipsById.has(key)) return;
    seen.add(key);
    ordered.push(clipsById.get(key));
  });
  return ordered;
}

function stableExportableClips(all, selectedIds, orderedVisibleIds) {
  ensureClipCreationSequences();
  const visible = Array.isArray(orderedVisibleIds)
    ? orderedClipsFromVisibleIds(orderedVisibleIds)
    : Array.isArray(state.visibleClipIds)
      ? orderedClipsFromVisibleIds(state.visibleClipIds)
      : sortedClipView(state.clips, clipSortModePreference(), clipSortDirectionPreference());
  if (all) return visible;
  const selected = new Set(getSelectedClips(selectedIds).map((clip) => String(clip.id)));
  return visible.filter((clip) => selected.has(String(clip.id)));
}

function revealExportedFile(outputPath) {
  if (!revealAfterExportPreference() || !outputPath) return;
  try {
    file.showInFinder(outputPath);
  } catch (error) {
    logError("Could not reveal exported file in Finder", error);
  }
}

async function removeIncompleteOutput(outputPath) {
  if (!outputPath) return;
  try {
    if (!file.exists(outputPath)) return;
    const result = await utils.exec("/bin/rm", ["-f", outputPath], dirname(outputPath));
    if (result.status !== 0) logError("Could not remove incomplete export", result.stderr || result.stdout || result.status);
  } catch (error) {
    logError("Could not remove incomplete export", error);
  }
}

async function exportStableClips(all, selectedIds, orderedVisibleIds) {
  if (isDisposed) return null;
  if (exportIsBusy()) {
    state.lastAction = "export already running";
    return buildStableState();
  }
  const generation = ++exportGeneration;
  const candidates = stableExportableClips(all, selectedIds, orderedVisibleIds);
  if (!candidates.length) {
    state.lastAction = state.clips.length ? "no selected clip" : "no clips to export";
    return buildStableState();
  }

  const clips = candidates.filter((clip) => {
    if (!clip) return false;
    const start = clip.inPoint;
    const end = clip.outPoint;
    const duration = end - start;
    return typeof start === "number" && isFinite(start) &&
      typeof end === "number" && isFinite(end) &&
      duration > 0;
  }).map((clip) => ({
    record: clip,
    id: clip.id,
    name: clip.name,
    sourceFilePath: clip.sourceFilePath,
    sourceFileDisplayName: clip.sourceFileDisplayName,
    inPoint: clip.inPoint,
    outPoint: clip.outPoint,
    duration: clip.duration
  }));
  if (!clips.length) {
    state.lastAction = "invalid range";
    return buildStableState();
  }

  syncStableMediaInfo();
  const sourcePath = clips[0].sourceFilePath || state.currentSourcePath;
  if (!sourcePath || isRemoteSourcePath(sourcePath) || !file.exists(sourcePath)) {
    state.lastAction = "source file unavailable";
    return buildStableState();
  }

  exportPreflightInFlight = true;
  state.exportMessage = "Preparing export...";
  postStableState("export-preflight");
  let outputFolder = "";
  try {
    if (!state.ffmpegAvailable || !state.ffmpegPath) {
      await detectStableFfmpeg();
    }
    if (isDisposed || generation !== exportGeneration) return null;
    if (!state.ffmpegAvailable || !state.ffmpegPath) {
      state.lastAction = "ffmpeg not found";
      return buildStableState();
    }

    const outputFolderResult = await resolveBatchOutputFolder();
    if (isDisposed || generation !== exportGeneration) return null;
    if (!outputFolderResult || !outputFolderResult.ok) {
      if (outputFolderResult && outputFolderResult.error) {
        state.lastError = outputFolderResult.error;
        state.lastAction = `export folder unavailable: ${outputFolderResult.error}`;
      } else {
        state.lastError = "";
        state.lastAction = "export cancelled";
        state.exportMessage = "Export cancelled";
      }
      return buildStableState();
    }
    outputFolder = outputFolderResult.path;
    state.lastExportFolder = normalizeFolderPath(outputFolder);
  } finally {
    if (generation === exportGeneration) exportPreflightInFlight = false;
  }

  state.exporting = true;
  state.lastError = "";
  state.exportMessage = `Exporting ${clips.length} clip${clips.length === 1 ? "" : "s"}...`;
  postStableState("export-start");
  const exportModeSnapshot = exportMode();
  const deleteClipsAfterExportSnapshot = deleteClipsAfterExportPreference();

  try {
    await ensureDirectory(outputFolder);
  } catch (error) {
    if (isDisposed || generation !== exportGeneration) return null;
    state.exporting = false;
    state.lastError = error && error.message ? error.message : String(error);
    state.lastAction = `output folder creation failed: ${state.lastError}`;
    logError("output folder creation failed", error);
    return buildStableState();
  }
  if (isDisposed || generation !== exportGeneration) return null;
  let exportedCount = 0;
  const successfullyExportedClipIds = new Set();

  for (let index = 0; index < clips.length; index += 1) {
    if (isDisposed || generation !== exportGeneration) return null;
    const clip = clips[index];
    const record = clip.record;
    let outputPath = "";
    let preserveFailedOutput = false;
    try {
      if (!clip.sourceFilePath || isRemoteSourcePath(clip.sourceFilePath) || !file.exists(clip.sourceFilePath)) {
        throw new Error("source file unavailable");
      }
      record.exportStatus = STATUS_EXPORTING;
      outputPath = stableOutputPath(clip, index + 1, outputFolder);
      const plan = stableFfmpegPlan(clip, outputPath, exportModeSnapshot);
      const args = plan.args;
      state.lastAction = `exporting clip ${index + 1}/${clips.length}`;
      postStableState("export-progress");
      const result = await utils.exec(state.ffmpegPath, args, dirname(outputPath));
      if (isDisposed || generation !== exportGeneration) return null;
      const processOutput = `${result.stdout || ""}\n${result.stderr || ""}`.toLowerCase();
      if (processOutput.includes("already exists") || processOutput.includes("error opening output file")) {
        preserveFailedOutput = true;
        throw new Error("FFmpeg refused to overwrite an existing output file");
      }
      if (result.status !== 0) {
        throw new Error(`FFmpeg ${plan.mode} export failed with status ${result.status}`);
      }
      if (!file.exists(outputPath)) {
        throw new Error("FFmpeg completed without creating an output file");
      }

      record.exportStatus = STATUS_EXPORTED;
      record.outputPath = outputPath;
      state.lastExportedFile = outputPath;
      exportedCount += 1;
      successfullyExportedClipIds.add(clip.id);
      state.lastAction = `clip ${index + 1}/${clips.length} exported`;
      postStableState("export-clip-done");
      revealExportedFile(outputPath);
    } catch (error) {
      if (isDisposed || generation !== exportGeneration) return null;
      if (!preserveFailedOutput) await removeIncompleteOutput(outputPath);
      if (isDisposed || generation !== exportGeneration) return null;
      record.exportStatus = STATUS_FAILED;
      state.lastError = error && error.message ? error.message : String(error);
      state.lastAction = `clip ${index + 1}/${clips.length} export failed`;
      logError(`export failed for clip ${index + 1}`, error);
      postStableState("export-clip-failed");
    }
  }

  if (deleteClipsAfterExportSnapshot && successfullyExportedClipIds.size) {
    state.clips = state.clips.filter((clip) => !successfullyExportedClipIds.has(clip.id));
    state.visibleClipIds = null;
    setSelectedClipIds(state.selectedClipIds);
  }
  state.exporting = false;
  state.exportMessage = `Export complete: ${exportedCount}/${clips.length}`;
  state.lastAction = "export complete";
  return postStableState("export-complete");
}

function addStableClip() {
  if (isDisposed) return null;
  if (rejectClipMutationWhileExporting("add clip")) return buildStableState();
  syncStableMediaInfo();
  if (!validateReadyForClip()) return buildStableState();
  ensureClipCreationSequences();
  const index = state.clips.length + 1;
  const clip = {
    id: state.nextClipId++,
    creationSequence: state.nextCreationSequence++,
    name: `Clip ${pad(index, 2)}`,
    sourceFilePath: state.currentSourcePath || "",
    sourceFileDisplayName: state.currentSourceName || "No file loaded",
    inPoint: state.inPoint,
    outPoint: state.outPoint,
    duration: state.outPoint - state.inPoint,
    createdAt: new Date().toISOString(),
    exportStatus: STATUS_PENDING,
    outputPath: ""
  };

  insertClipIntoManualOrder(clip);
  state.inPoint = null;
  state.outPoint = null;
  state.lastAction = "clip added";
  return buildStableState();
}

function registerStableRpcMethods() {
  if (isDisposed || handlersRegistered) return;

  rpc.$getState = function () {
    if (isDisposed) return null;
    return buildStableState();
  };

  rpc.$setIn = function () {
    if (isDisposed) return null;
    cancelPreviewWatcher();
    const position = getCurrentPositionSeconds();
    if (position === null || Number.isNaN(position)) {
      state.lastAction = "set-in failed: no current position";
      return buildStableState();
    }

    state.inPoint = position;
    state.lastAction = `set-in received at ${formatTimecode(position, state.fps)}`;
    return buildStableState();
  };

  rpc.$setOut = function () {
    if (isDisposed) return null;
    cancelPreviewWatcher();
    const position = getCurrentPositionSeconds();
    if (position === null || Number.isNaN(position)) {
      state.lastAction = "set-out failed: no current position";
      return buildStableState();
    }

    state.outPoint = position;
    state.lastAction = `set-out received at ${formatTimecode(position, state.fps)}`;
    return buildStableState();
  };

  rpc.$addClip = function () {
    if (isDisposed) return null;
    return addStableClip();
  };

  rpc.$toggleClipSelection = function (id) {
    if (isDisposed) return null;
    toggleSelectedClipId(id);
    state.lastAction = "clip selection updated";
    return buildStableState();
  };

  rpc.$clearClipSelection = function () {
    if (isDisposed) return null;
    state.selectedClipIds = [];
    state.selectedClipId = null;
    state.lastAction = "clip selection cleared";
    return buildStableState();
  };

  rpc.$deleteClip = function (id) {
    if (isDisposed) return null;
    if (rejectClipMutationWhileExporting("delete clip")) return buildStableState();
    const numericId = Number(id);
    state.clips = state.clips.filter((clip) => clip.id !== numericId);
    state.visibleClipIds = null;
    setSelectedClipIds(state.selectedClipIds);
    state.lastAction = "clip deleted";
    return buildStableState();
  };

  rpc.$deleteSelectedClips = function (ids) {
    if (isDisposed) return null;
    if (rejectClipMutationWhileExporting("delete clips")) return buildStableState();
    const selected = new Set(getSelectedClips(ids).map((clip) => clip.id));
    if (!selected.size) {
      state.lastAction = "no selected clips to delete";
      return buildStableState();
    }
    state.clips = state.clips.filter((clip) => !selected.has(clip.id));
    state.visibleClipIds = null;
    state.selectedClipIds = [];
    state.selectedClipId = null;
    state.lastAction = selected.size === 1 ? "selected clip deleted" : `${selected.size} selected clips deleted`;
    return buildStableState();
  };

  rpc.$reorderClips = function (orderedIds) {
    if (isDisposed) return null;
    if (rejectClipMutationWhileExporting("reorder clips")) return buildStableState();
    if (clipSortModePreference() !== "manual" || clipSortDirectionPreference() !== "ascending") {
      state.lastAction = "clip reorder ignored while sorted";
      return buildStableState();
    }
    if (!Array.isArray(orderedIds) || orderedIds.length !== state.clips.length) {
      state.lastAction = "clip reorder ignored";
      return buildStableState();
    }

    const clipsById = new Map(state.clips.map((clip) => [clip.id, clip]));
    const nextIds = orderedIds.map((id) => Number(id));
    const uniqueIds = new Set(nextIds);
    if (uniqueIds.size !== state.clips.length || nextIds.some((id) => !clipsById.has(id))) {
      state.lastAction = "clip reorder ignored";
      return buildStableState();
    }

    state.clips = nextIds.map((id) => clipsById.get(id));
    state.visibleClipIds = null;
    setSelectedClipIds(state.selectedClipIds);
    state.lastAction = "clips reordered";
    return buildStableState();
  };

  rpc.$renameClip = function (id, name) {
    if (isDisposed) return null;
    if (rejectClipMutationWhileExporting("rename clip")) return buildStableState();
    const clip = state.clips.find((item) => item.id === Number(id));
    if (!clip) return buildStableState();
    const rawName = String(name || "").trim();
    if (!rawName) {
      state.lastAction = "clip rename cancelled";
      return buildStableState();
    }
    clip.name = sanitizeFilename(rawName);
    state.visibleClipIds = null;
    state.lastAction = `clip renamed: ${clip.name}`;
    return buildStableState();
  };

  rpc.$setClipSort = function (mode, direction) {
    if (isDisposed) return null;
    const nextMode = normalizeClipSortMode(mode);
    const nextDirection = normalizeClipSortDirection(direction);
    try {
      iina.preferences.set("clipSortMode", nextMode);
      iina.preferences.set("clipSortDirection", nextDirection);
      state.visibleClipIds = null;
      state.lastAction = `clip sort: ${nextMode} ${nextDirection}`;
    } catch (error) {
      logError("Could not save clip sorting preferences", error);
      state.lastAction = "clip sort preference failed";
    }
    return buildStableState();
  };

  rpc.$setClipViewOrder = function (orderedIds, sourceFilePath) {
    if (isDisposed) return null;
    if (String(sourceFilePath || "") !== String(state.currentSourcePath || "") || !Array.isArray(orderedIds)) {
      return { ok: false, error: "stale-clip-view" };
    }
    const clipsById = new Map(state.clips.map((clip) => [String(clip.id), clip]));
    const seen = new Set();
    const nextIds = [];
    orderedIds.forEach((id) => {
      const key = String(id);
      if (seen.has(key) || !clipsById.has(key)) return;
      seen.add(key);
      nextIds.push(clipsById.get(key).id);
    });
    state.visibleClipIds = nextIds;
    return { ok: true };
  };

  rpc.$clearList = function () {
    if (isDisposed) return null;
    if (rejectClipMutationWhileExporting("clear list")) return buildStableState();
    state.clips = [];
    state.selectedClipIds = [];
    state.selectedClipId = null;
    state.visibleClipIds = null;
    state.lastAction = "clip list cleared";
    return buildStableState();
  };

  rpc.$showExportFolder = async function () {
    if (isDisposed) return null;
    return showContainingExportFolder();
  };

  rpc.$setFfmpeg = async function () {
    if (isDisposed) return null;
    const current = state.ffmpegPath || normalizeFfmpegPathPreference(pref("ffmpegPath", ""));
    const entered = promptText("Path to ffmpeg:", current);
    if (entered !== null) {
      try {
        iina.preferences.set("ffmpegPath", normalizeFfmpegPathPreference(entered));
      } catch (error) {
        logError("Could not save ffmpeg path preference", error);
      }
    }
    await detectStableFfmpeg();
    if (isDisposed) return null;
    state.lastAction = state.ffmpegAvailable ? `ffmpeg found: ${state.ffmpegPath}` : "ffmpeg not found";
    return buildStableState();
  };

  rpc.$playerHotkey = function (payload) {
    if (isDisposed) return null;
    return playerHotkey(payload);
  };

  rpc.$previewPlay = function (options) {
    if (isDisposed) return null;
    return previewPlay(options);
  };

  rpc.$getNavigationSnapshot = function () {
    if (isDisposed) return { ok: false, error: "disposed" };
    return getNavigationSnapshot();
  };

  rpc.$restoreNavigationPoint = function (point) {
    if (isDisposed) return { ok: false, error: "disposed" };
    return restoreNavigationPoint(point);
  };

  rpc.$setMarkTime = function (markName, seconds, shouldSeek) {
    if (isDisposed) return null;
    return setMarkTime(markName, seconds, shouldSeek);
  };

  rpc.$setPositionTime = function (seconds) {
    if (isDisposed) return null;
    return setPositionTime(seconds);
  };

  rpc.$exportSelected = async function (selectedClipIds, orderedVisibleIds) {
    if (isDisposed) return null;
    return exportStableClips(false, selectedClipIds, orderedVisibleIds);
  };

  rpc.$exportAll = async function (orderedVisibleIds) {
    if (isDisposed) return null;
    return exportStableClips(true, undefined, orderedVisibleIds);
  };
}

function startStablePositionTimer() {
  if (updateTimerId !== null) {
    return;
  }

  updateTimerId = setInterval(() => {
    if (isDisposed) return;
    try {
      refreshFfmpegIfPreferenceChanged(false);
      refreshShortcutMenuIfPreferenceChanged(false);
      postStableState("position-tick");
    } catch (error) {
      logError("stable position update failed", error);
    }
  }, 250);
}

setEventListener("iina.window-will-close", cleanup);
registerOptionalCleanupEvent("iina.plugin-will-unload");
registerOptionalCleanupEvent("iina.plugin-unloaded");
registerOptionalCleanupEvent("iina.plugin-did-unload");

setEventListener("iina.window-loaded", () => {
  if (isDisposed || sidebarLoaded) return;
  try {
    sidebar.loadFile("sidebar.html");
    sidebarLoaded = true;
  } catch (error) {
    logError("sidebar load failed", error);
    return;
  }

  registerStableRpcMethods();
  handlersRegistered = true;
  setupMenu();
  startStablePositionTimer();

  setTrackedTimeout(() => {
    if (isDisposed) return;
    state.lastAction = "ready";
    postStableState("startup");
  }, 500);

  setTrackedTimeout(async () => {
    if (isDisposed) return;
    try {
      await detectStableFfmpeg();
      if (isDisposed) return;
      postStableState("ffmpeg-detected");
    } catch (error) {
      logError("delayed ffmpeg detection failed", error);
    }
  }, 1000);
});
