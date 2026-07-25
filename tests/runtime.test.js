"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const MAIN_SOURCE = fs.readFileSync(path.join(ROOT, "main.js"), "utf8");
const SIDEBAR_SOURCE = fs.readFileSync(path.join(ROOT, "sidebar.js"), "utf8");

function createRuntime(options = {}) {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "Info.json"), "utf8"));
  const preferences = new Map(Object.entries(manifest.preferenceDefaults || {}));
  preferences.set("ffmpegPath", "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg");
  preferences.set("ffmpegFullConfirmed", true);
  preferences.set("homebrewPath", "/opt/homebrew/bin/brew");

  const sourcePath = "/tmp/ClipMaker source Пример.mp4";
  const secondSourcePath = "/tmp/ClipMaker second source.mov";
  const existingFiles = new Set([
    sourcePath,
    secondSourcePath,
    "/opt/homebrew/bin/brew",
    "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg",
    "/opt/homebrew/opt/ffmpeg-full/bin/ffprobe",
  ]);
  const eventHandlers = new Map();
  const sidebarHandlers = new Map();
  const sidebarMessages = [];
  const execCalls = [];
  const revealedPaths = [];
  const menuRoots = [];
  const osdMessages = [];
  let sidebarLoadCount = 0;
  let sidebarShowCount = 0;
  let preferenceSyncCount = 0;
  let nextListenerId = 1;

  const status = {
    idle: false,
    isNetworkResource: false,
    url: `file://${encodeURI(sourcePath)}`,
    title: path.basename(sourcePath),
    position: 12.5,
    duration: 180,
    paused: true,
    mediaPath: sourcePath,
  };

  async function defaultExec(call) {
    const { executable, args } = call;
    if (executable === "/usr/bin/which") {
      const name = args[0];
      if (name === "brew") return { status: 0, stdout: "/opt/homebrew/bin/brew\n", stderr: "" };
      if (name === "ffmpeg") return { status: 0, stdout: "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg\n", stderr: "" };
      if (name === "ffprobe") return { status: 0, stdout: "/opt/homebrew/opt/ffmpeg-full/bin/ffprobe\n", stderr: "" };
      return { status: 1, stdout: "", stderr: "not found" };
    }
    if (executable.endsWith("/brew")) {
      if (args[0] === "--version") return { status: 0, stdout: "Homebrew 5.0.0\n", stderr: "" };
      if (args[0] === "--prefix" && args.length === 1) {
        return { status: 0, stdout: `${path.dirname(path.dirname(executable))}\n`, stderr: "" };
      }
      if (args[0] === "--prefix" && args[1] === "ffmpeg-full") {
        return { status: 0, stdout: "/opt/homebrew/opt/ffmpeg-full\n", stderr: "" };
      }
      if (args[0] === "install" && args[1] === "ffmpeg-full") {
        existingFiles.add("/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg");
        existingFiles.add("/opt/homebrew/opt/ffmpeg-full/bin/ffprobe");
        return { status: 0, stdout: "installed ffmpeg-full\n", stderr: "" };
      }
    }
    if (executable === "/usr/bin/osascript") {
      return { status: 0, stdout: "/tmp/ClipMaker exports/\n", stderr: "" };
    }
    if (executable === "/bin/mkdir") {
      return { status: 0, stdout: "", stderr: "" };
    }
    if (executable === "/bin/rm") {
      existingFiles.delete(args.at(-1));
      return { status: 0, stdout: "", stderr: "" };
    }
    if (executable.endsWith("/ffmpeg") && args[0] === "-version") {
      return {
        status: 0,
        stdout: "ffmpeg version 8.1 test\nconfiguration: --prefix=/opt/homebrew/Cellar/ffmpeg-full/8.1 --enable-libvidstab --enable-libvmaf --enable-libopencore-amrnb --enable-libopencore-amrwb\n",
        stderr: "",
      };
    }
    if (executable.endsWith("/ffprobe")) {
      return {
        status: 0,
        stdout: JSON.stringify({
          streams: [
            { codec_name: "aac", bit_rate: "192000", sample_rate: "48000", channels: 2, channel_layout: "stereo" },
          ],
        }),
        stderr: "",
      };
    }
    if (executable.endsWith("/ffmpeg")) {
      existingFiles.add(args[args.length - 1]);
      return { status: 0, stdout: "", stderr: "" };
    }
    return { status: 0, stdout: "", stderr: "" };
  }

  const iina = {
    console: {
      log() {},
      warn() {},
      error() {},
    },
    core: {
      status,
      osd(message) {
        osdMessages.push(message);
      },
    },
    event: {
      on(name, callback) {
        const id = nextListenerId++;
        if (!eventHandlers.has(name)) eventHandlers.set(name, []);
        eventHandlers.get(name).push({ id, callback });
        return id;
      },
      off(name, id) {
        const handlers = eventHandlers.get(name) || [];
        eventHandlers.set(name, handlers.filter((entry) => entry.id !== id));
      },
    },
    file: {
      exists(filePath) {
        return existingFiles.has(filePath);
      },
      showInFinder(filePath) {
        revealedPaths.push(filePath);
      },
    },
    menu: {
      item(title, action, menuOptions) {
        return {
          title,
          action,
          options: menuOptions || {},
          children: [],
          addSubMenuItem(item) {
            this.children.push(item);
          },
        };
      },
      separator() {
        return { separator: true };
      },
      addItem(item) {
        menuRoots.push(item);
      },
      removeAllItems() {
        menuRoots.length = 0;
      },
      forceUpdate() {},
    },
    mpv: {
      getNumber(name) {
        if (name === "time-pos") return status.position;
        if (name === "duration") return status.duration;
        if (name === "container-fps") return 23.976;
        if (name === "estimated-vf-fps" || name === "fps") return null;
        if (name === "speed") return 1;
        return null;
      },
      getString(name) {
        if (name === "path" || name === "stream-open-filename") return status.mediaPath;
        if (name === "media-title") return path.basename(status.mediaPath || "");
        if (name === "pause") return status.paused ? "yes" : "no";
        return "";
      },
      getFlag(name) {
        if (name === "pause") return status.paused;
        return false;
      },
      command(command, args) {
        const values = Array.isArray(args) ? args : [];
        if (command === "seek") status.position = Number(values[0]);
        if (command === "set" && values[0] === "pause") status.paused = values[1] === "yes";
        if (command === "cycle" && values[0] === "pause") status.paused = !status.paused;
        return true;
      },
    },
    preferences: {
      get(key) {
        return preferences.get(key);
      },
      set(key, value) {
        preferences.set(key, value);
      },
      sync() {
        preferenceSyncCount += 1;
      },
    },
    sidebar: {
      loadFile(fileName) {
        assert.equal(fileName, "sidebar.html");
        sidebarLoadCount += 1;
      },
      show() {
        sidebarShowCount += 1;
      },
      onMessage(name, callback) {
        if (callback == null) sidebarHandlers.delete(name);
        else sidebarHandlers.set(name, callback);
      },
      postMessage(name, payload) {
        sidebarMessages.push({ name, payload });
      },
    },
    utils: {
      async exec(executable, args, cwd) {
        const call = { executable, args: Array.from(args || []), cwd };
        execCalls.push(call);
        if (options.exec) {
          const handled = await options.exec(call, { existingFiles, preferences });
          if (handled !== undefined) return handled;
        }
        return defaultExec(call);
      },
      resolvePath(value) {
        return String(value).replace(/^~(?=\/|$)/, "/Users/tester");
      },
      prompt() {
        return "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg";
      },
    },
  };

  const context = vm.createContext({
    iina,
    console,
    Date,
    Map,
    Promise,
    Proxy,
    Set,
    clearInterval,
    clearTimeout,
    decodeURIComponent,
    encodeURI,
    isFinite,
    setInterval,
    setTimeout,
  });
  vm.runInContext(MAIN_SOURCE, context, { filename: "main.js" });

  async function emit(name, ...args) {
    const handlers = Array.from(eventHandlers.get(name) || []);
    for (const entry of handlers) await entry.callback(...args);
  }

  async function callRpc(method, ...args) {
    const callName = `#call.${method}`;
    const responseName = `#on.${method}`;
    const handler = sidebarHandlers.get(callName);
    assert.equal(typeof handler, "function", `missing RPC ${method}`);
    const start = sidebarMessages.length;
    await handler({ args });
    const response = sidebarMessages.slice(start).reverse().find((message) => message.name === responseName);
    assert.ok(response, `missing response for RPC ${method}`);
    return response.payload.res;
  }

  return {
    callRpc,
    context,
    emit,
    evaluate(code) {
      return vm.runInContext(code, context);
    },
    execCalls,
    existingFiles,
    menuRoots,
    osdMessages,
    preferences,
    revealedPaths,
    sidebarHandlers,
    sidebarMessages,
    secondSourcePath,
    sourcePath,
    status,
    get sidebarLoadCount() {
      return sidebarLoadCount;
    },
    get sidebarShowCount() {
      return sidebarShowCount;
    },
    get preferenceSyncCount() {
      return preferenceSyncCount;
    },
    cleanup() {
      vm.runInContext('cleanup("test")', context);
    },
  };
}

function sidebarEvaluate(expression) {
  const context = vm.createContext({
    console,
    document: {
      readyState: "loading",
      addEventListener() {},
    },
    navigator: {},
    Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
    window: null,
    clearInterval,
    clearTimeout,
    setInterval,
    setTimeout,
  });
  context.window = context;
  vm.runInContext(SIDEBAR_SOURCE, context, { filename: "sidebar.js" });
  return vm.runInContext(expression, context);
}

test("manifest contains only canonical current preference defaults", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "Info.json"), "utf8"));
  assert.equal(manifest.version, "1.0.0");
  assert.equal(manifest.preferenceDefaults.exportMode, "fast");
  assert.equal(manifest.preferenceDefaults.revealAfterExport, true);
  assert.equal(manifest.preferenceDefaults.deleteClipsAfterExport, false);
  assert.equal(manifest.preferenceDefaults.deleteWithoutConfirmation, false);
  assert.equal(manifest.preferenceDefaults.askWhereToSave, false);
  assert.equal(Object.hasOwn(manifest.preferenceDefaults, "fastCopy"), false);
  assert.equal(Object.hasOwn(manifest.preferenceDefaults, "exportModeMigrated"), false);
  assert.equal(Object.hasOwn(manifest.preferenceDefaults, "autoNameClips"), false);
  assert.equal(Object.hasOwn(manifest.preferenceDefaults, "nameTemplate"), false);
});

test("stable lifecycle loads one sidebar and registers only called RPC methods", async (t) => {
  const runtime = createRuntime();
  t.after(() => runtime.cleanup());
  await runtime.emit("iina.window-loaded");
  await runtime.emit("iina.window-loaded");

  assert.equal(runtime.sidebarLoadCount, 1);
  const rpcNames = Array.from(runtime.sidebarHandlers.keys())
    .filter((name) => name.startsWith("#call."))
    .map((name) => name.slice("#call.".length))
    .sort();
  assert.deepEqual(rpcNames, [
    "$addClip",
    "$browseExistingFfmpegFull",
    "$browseFfmpegInstallationDirectory",
    "$clearClipSelection",
    "$clearList",
    "$deleteClip",
    "$deleteSelectedClips",
    "$exportAll",
    "$exportSelected",
    "$checkFfmpegFull",
    "$getNavigationSnapshot",
    "$getState",
    "$installFfmpegFull",
    "$playerHotkey",
    "$previewPlay",
    "$renameClip",
    "$reorderClips",
    "$restoreNavigationPoint",
    "$showExportFolder",
    "$setClipSort",
    "$setClipViewOrder",
    "$setIn",
    "$setMarkTime",
    "$setOut",
    "$setPositionTime",
    "$toggleClipSelection",
    "$useExistingFfmpegFull",
  ].sort());

  assert.equal(runtime.menuRoots.length, 1);
});

test("every sidebar behavior setting reaches the state or its concrete action", async (t) => {
  const runtime = createRuntime();
  t.after(() => runtime.cleanup());
  runtime.preferences.set("invertTimecodeScrolling", true);
  runtime.preferences.set("invertTimecodeDragging", true);
  runtime.preferences.set("timecodeScrollSensitivity", 5);
  runtime.preferences.set("timecodeDragSensitivity", 1);
  runtime.preferences.set("deleteWithoutConfirmation", true);
  runtime.preferences.set("showSidebarOnInvalidExport", false);
  await runtime.emit("iina.window-loaded");

  const state = await runtime.callRpc("$getState");
  assert.equal(state.invertTimecodeScrolling, true);
  assert.equal(state.invertTimecodeDragging, true);
  assert.equal(state.timecodeScrollSensitivity, 5);
  assert.equal(state.timecodeDragSensitivity, 1);
  assert.equal(state.deleteWithoutConfirmation, true);

  const sidebarBehavior = sidebarEvaluate(`(() => {
    latestState = ${JSON.stringify({
      invertTimecodeScrolling: state.invertTimecodeScrolling,
      invertTimecodeDragging: state.invertTimecodeDragging,
      timecodeScrollSensitivity: state.timecodeScrollSensitivity,
      timecodeDragSensitivity: state.timecodeDragSensitivity,
      deleteWithoutConfirmation: state.deleteWithoutConfirmation,
    })};
    return {
      scrollDirection: getTimecodeScrollDirectionMultiplier(),
      dragDirection: getTimecodeDragDirectionMultiplier(),
      scrollSensitivity: currentTimecodeScrollSensitivity(),
      dragSensitivity: currentTimecodeDragSensitivity(),
      confirmationEnabled: deleteConfirmationEnabled(),
    };
  })()`);
  assert.deepEqual(JSON.parse(JSON.stringify(sidebarBehavior)), {
    scrollDirection: -1,
    dragDirection: -1,
    scrollSensitivity: 5,
    dragSensitivity: 1,
    confirmationEnabled: false,
  });

  const exportAll = runtime.menuRoots[0].children.find((item) => item.title === "Export All Clips");
  assert.equal(typeof exportAll.action, "function");
  await exportAll.action();
  assert.equal(runtime.sidebarShowCount, 0);

  runtime.preferences.set("showSidebarOnInvalidExport", "true");
  await exportAll.action();
  assert.equal(runtime.sidebarShowCount, 1);
});

test("shortcut settings rebuild real menu bindings and programmatic settings are synced", async (t) => {
  const runtime = createRuntime();
  t.after(() => runtime.cleanup());
  runtime.preferences.set("shortcutShowPanel", "");
  runtime.preferences.set("shortcutSetIn", "Meta+Alt+1");
  await runtime.emit("iina.window-loaded");

  let root = runtime.menuRoots[0];
  let showPanelItem = root.children.find((item) => item.title === "Show ClipMaker Panel");
  let setInItem = root.children.find((item) => item.title === "Set In Point");
  assert.equal(showPanelItem.options.keyBinding, undefined);
  assert.equal(setInItem.options.keyBinding, "Meta+Alt+1");

  runtime.preferences.set("shortcutShowPanel", "Meta+Shift+P");
  runtime.preferences.set("shortcutSetIn", "");
  runtime.evaluate("refreshShortcutMenuIfPreferenceChanged(true)");
  root = runtime.menuRoots[0];
  showPanelItem = root.children.find((item) => item.title === "Show ClipMaker Panel");
  setInItem = root.children.find((item) => item.title === "Set In Point");
  assert.equal(showPanelItem.options.keyBinding, "Meta+Shift+P");
  assert.equal(setInItem.options.keyBinding, undefined);

  const beforeSortSync = runtime.preferenceSyncCount;
  await runtime.callRpc("$setClipSort", "name", "ascending");
  assert.equal(runtime.preferences.get("clipSortMode"), "name");
  assert.equal(runtime.preferences.get("clipSortDirection"), "ascending");
  assert.equal(runtime.preferenceSyncCount, beforeSortSync + 1);
});

test("FFmpeg-full setup browse actions open at a detected folder and resolve selections", async (t) => {
  const runtime = createRuntime({
    async exec(call) {
      if (call.executable !== "/usr/bin/osascript") return undefined;
      const script = call.args.join("\n");
      if (script.includes("Choose where to install FFmpeg-full")) {
        return { status: 0, stdout: "/Users/tester/Tools/FFmpeg-full/\n", stderr: "" };
      }
      if (script.includes("Choose the existing FFmpeg-full folder")) {
        return { status: 0, stdout: "/opt/homebrew/opt/ffmpeg-full/\n", stderr: "" };
      }
      return undefined;
    },
  });
  t.after(() => runtime.cleanup());
  await runtime.emit("iina.window-loaded");

  const directory = await runtime.callRpc("$browseFfmpegInstallationDirectory");
  const executable = await runtime.callRpc("$browseExistingFfmpegFull");
  assert.equal(directory.ok, true);
  assert.equal(directory.path, "/Users/tester/Tools/FFmpeg-full");
  assert.equal(executable.ok, true);
  assert.equal(executable.path, "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg");

  const pickerCall = runtime.execCalls.find((call) => (
    call.executable === "/usr/bin/osascript" &&
    call.args.includes('set pickerPrompt to "Choose the existing FFmpeg-full folder"')
  ));
  assert.ok(pickerCall);
  assert.deepEqual(pickerCall.args.slice(-2), ["--", "/opt/homebrew/opt/ffmpeg-full"]);
});

test("Show Containing Folder opens the configured folder and remembers a chosen export folder", async (t) => {
  const runtime = createRuntime();
  t.after(() => runtime.cleanup());
  await runtime.emit("iina.window-loaded");

  let result = await runtime.callRpc("$showExportFolder");
  let openCalls = runtime.execCalls.filter((call) => call.executable === "/usr/bin/open");
  assert.equal(result.ok, true);
  assert.equal(result.exportFolder, "/Users/tester/Desktop");
  assert.deepEqual(openCalls[0].args, ["/Users/tester/Desktop"]);
  assert.equal(openCalls[0].cwd, "/Users/tester/Desktop");

  const state = runtime.evaluate("state");
  state.lastExportFolder = "/tmp/ClipMaker chosen exports";
  result = await runtime.callRpc("$showExportFolder");
  openCalls = runtime.execCalls.filter((call) => call.executable === "/usr/bin/open");
  assert.equal(result.exportFolder, "/tmp/ClipMaker chosen exports");
  assert.deepEqual(openCalls[1].args, ["/tmp/ClipMaker chosen exports"]);
});

test("new clips appear first while identity, selection, rename, and reorder remain stable", async (t) => {
  const runtime = createRuntime();
  t.after(() => runtime.cleanup());
  await runtime.emit("iina.window-loaded");

  runtime.status.position = 1.25;
  await runtime.callRpc("$setIn");
  runtime.status.position = 5.5;
  await runtime.callRpc("$setOut");
  let state = await runtime.callRpc("$addClip");
  assert.equal(state.clips.length, 1);
  assert.equal(state.clips[0].id, 1);
  assert.equal(state.clips[0].creationSequence, 1);

  runtime.status.position = 10;
  await runtime.callRpc("$setIn");
  runtime.status.position = 14.25;
  await runtime.callRpc("$setOut");
  state = await runtime.callRpc("$addClip");
  assert.deepEqual(Array.from(state.clips, (clip) => clip.id), [2, 1]);
  assert.deepEqual(Array.from(state.clips, (clip) => clip.creationSequence), [2, 1]);

  runtime.evaluate("state.inPoint = 20; state.outPoint = 21; addClipFromMarks()");
  state = await runtime.callRpc("$getState");
  assert.deepEqual(Array.from(state.clips, (clip) => clip.id), [3, 2, 1]);
  assert.deepEqual(Array.from(state.clips, (clip) => clip.name), ["Clip 03", "Clip 02", "Clip 01"]);

  await runtime.callRpc("$renameClip", 1, "  Привет / intro  ");
  await runtime.callRpc("$toggleClipSelection", 1);
  await runtime.callRpc("$toggleClipSelection", 2);
  state = await runtime.callRpc("$reorderClips", [1, 3, 2], true);
  assert.deepEqual(Array.from(state.clips, (clip) => clip.id), [1, 3, 2]);
  assert.deepEqual(Array.from(state.clips, (clip) => clip.creationSequence), [1, 3, 2]);
  assert.equal(state.clips[0].name, "Привет - intro");
  assert.deepEqual(Array.from(state.selectedClipIds), [1, 2]);

  state = await runtime.callRpc("$reorderClips", [1, 1, 2]);
  assert.deepEqual(Array.from(state.clips, (clip) => clip.id), [1, 3, 2]);
});

test("sorting settings persist, legacy creation sequences migrate, and insertion preference affects custom order", async (t) => {
  const runtime = createRuntime();
  t.after(() => runtime.cleanup());
  await runtime.emit("iina.window-loaded");

  const internalState = runtime.evaluate("state");
  internalState.clips = [
    { id: 8, name: "Eight", inPoint: 8, outPoint: 9, duration: 1 },
    { id: 2, name: "Two", inPoint: 2, outPoint: 3, duration: 1 },
    { id: 5, name: "Five", inPoint: 5, outPoint: 6, duration: 1 },
  ];
  let state = await runtime.callRpc("$getState");
  assert.deepEqual(Array.from(state.clips, (clip) => [clip.id, clip.creationSequence]), [[8, 3], [2, 1], [5, 2]]);

  state = await runtime.callRpc("$reorderClips", [5, 8, 2], true);
  assert.deepEqual(Array.from(state.clips, (clip) => [clip.id, clip.creationSequence]), [[5, 2], [8, 3], [2, 1]]);
  assert.equal(state.clipSortMode, "custom");
  assert.equal(state.clipSortDirection, "ascending");

  state = await runtime.callRpc("$setClipSort", "duration", "descending");
  assert.equal(state.clipSortMode, "duration");
  assert.equal(state.clipSortDirection, "descending");
  assert.equal(runtime.preferences.get("clipSortMode"), "duration");
  assert.equal(runtime.preferences.get("clipSortDirection"), "descending");
  state = await runtime.callRpc("$reorderClips", [2, 8, 5]);
  assert.deepEqual(Array.from(state.clips, (clip) => clip.id), [5, 8, 2]);

  runtime.preferences.set("clipSortMode", "custom");
  runtime.preferences.set("clipSortDirection", "ascending");
  runtime.preferences.set("addNewClipsToTop", false);
  internalState.inPoint = 10;
  internalState.outPoint = 11;
  state = await runtime.callRpc("$addClip");
  assert.deepEqual(Array.from(state.clips, (clip) => clip.id), [5, 8, 2, 1]);
  assert.equal(state.clips.at(-1).creationSequence, 4);

  const beforeReset = Array.from(state.clips, (clip) => [clip.id, clip.creationSequence]);
  runtime.preferences.set("clipSortMode", "custom");
  runtime.preferences.set("clipSortDirection", "ascending");
  runtime.preferences.set("addNewClipsToTop", true);
  state = await runtime.callRpc("$getState");
  assert.deepEqual(Array.from(state.clips, (clip) => [clip.id, clip.creationSequence]), beforeReset);
  assert.equal(state.addNewClipsToTop, true);
});

test("Custom captures the previous sort and drag switching saves the dropped order atomically", async (t) => {
  const runtime = createRuntime();
  t.after(() => runtime.cleanup());
  await runtime.emit("iina.window-loaded");

  const internalState = runtime.evaluate("state");
  internalState.clips = [
    { id: 1, name: "Beta", inPoint: 3, outPoint: 4, duration: 1 },
    { id: 2, name: "Alpha", inPoint: 1, outPoint: 2, duration: 1 },
    { id: 3, name: "Gamma", inPoint: 5, outPoint: 6, duration: 1 },
  ];

  await runtime.callRpc("$setClipSort", "name", "ascending");
  let state = await runtime.callRpc("$setClipSort", "custom", "descending");
  assert.equal(state.clipSortMode, "custom");
  assert.equal(state.clipSortDirection, "descending");
  assert.deepEqual(Array.from(state.clips, (clip) => clip.id), [2, 1, 3]);

  state = await runtime.callRpc("$reorderClips", [3, 2, 1], true);
  assert.equal(state.clipSortMode, "custom");
  assert.equal(state.clipSortDirection, "descending");
  assert.deepEqual(Array.from(state.clips, (clip) => clip.id), [3, 2, 1]);

  await runtime.callRpc("$setClipSort", "in", "ascending");
  state = await runtime.callRpc("$reorderClips", [3, 2, 1], true);
  assert.equal(state.clipSortMode, "custom");
  assert.equal(state.clipSortDirection, "ascending");
  assert.deepEqual(Array.from(state.clips, (clip) => clip.id), [3, 2, 1]);

  runtime.preferences.set("clipSortMode", "manual");
  state = await runtime.callRpc("$getState");
  assert.equal(state.clipSortMode, "custom");
});

test("derived sorting is stable, preserves custom order, and runs after search", () => {
  const result = sidebarEvaluate(`(() => {
    const clips = [
      { id: 40, creationSequence: 4, name: "Beta match", duration: 2, inPoint: 8, outPoint: 10 },
      { id: 20, creationSequence: 2, name: "Alpha match", duration: 2, inPoint: 5, outPoint: 7 },
      { id: 30, creationSequence: 3, name: "Hidden", duration: 1, inPoint: 1, outPoint: 2 },
      { id: 10, creationSequence: 1, name: "Alpha match", duration: 2, inPoint: 5, outPoint: 7 }
    ];
    const original = clips.map((clip) => clip.id).join(",");
    activeClipSearchQuery = "match";
    const orders = {};
    for (const mode of ["creation", "name", "duration", "in", "out"]) {
      latestState = { clipSortMode: mode, clipSortDirection: mode === "creation" ? "descending" : "ascending" };
      orders[mode] = displayedClipEntries(clips).map((entry) => entry.clip.id);
    }
    latestState = { clipSortMode: "custom", clipSortDirection: "ascending" };
    orders.custom = displayedClipEntries(clips).map((entry) => entry.clip.id);
    latestState = { clipSortMode: "manual", clipSortDirection: "descending" };
    orders.legacyManual = displayedClipEntries(clips).map((entry) => entry.clip.id);
    return { orders, original, after: clips.map((clip) => clip.id).join(",") };
  })()`);

  assert.deepEqual(Array.from(result.orders.creation), [40, 20, 10]);
  assert.deepEqual(Array.from(result.orders.name), [10, 20, 40]);
  assert.deepEqual(Array.from(result.orders.duration), [10, 20, 40]);
  assert.deepEqual(Array.from(result.orders.in), [10, 20, 40]);
  assert.deepEqual(Array.from(result.orders.out), [10, 20, 40]);
  assert.deepEqual(Array.from(result.orders.custom), [40, 20, 10]);
  assert.deepEqual(Array.from(result.orders.legacyManual), [40, 20, 10]);
  assert.equal(result.original, result.after);
});

test("starting a drag from a derived sort preserves that order while switching to Custom", () => {
  const result = sidebarEvaluate(`(() => {
    latestState = {
      clipSortMode: "name",
      clipSortDirection: "ascending",
      clips: [
        { id: 1, name: "Beta" },
        { id: 2, name: "Alpha" },
        { id: 3, name: "Gamma" },
      ],
    };
    clipReorderState = {
      originalOrder: [2, 1, 3],
      switchedToCustom: false,
      sourceSortMode: null,
      sourceSortDirection: null,
      sourceClips: null,
    };
    updateClipSortControl = () => {};
    activeClipSearchQuery = "";
    const dragAllowedInName = clipReorderIsAllowed();
    activeClipSearchQuery = "Alpha";
    const dragAllowedWithSearch = clipReorderIsAllowed();
    activeClipSearchQuery = "";
    activateCustomSortForClipDrag();
    const switched = {
      mode: latestState.clipSortMode,
      direction: latestState.clipSortDirection,
      order: latestState.clips.map((clip) => clip.id),
      switchedToCustom: clipReorderState.switchedToCustom,
    };
    const dragState = clipReorderState;
    restoreClipSortAfterCanceledDrag(dragState);
    const restored = {
      mode: latestState.clipSortMode,
      direction: latestState.clipSortDirection,
      order: latestState.clips.map((clip) => clip.id),
    };
    return { switched, restored, dragAllowedInName, dragAllowedWithSearch };
  })()`);

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    switched: { mode: "custom", direction: "ascending", order: [2, 1, 3], switchedToCustom: true },
    restored: { mode: "name", direction: "ascending", order: [1, 2, 3] },
    dragAllowedInName: true,
    dragAllowedWithSearch: false,
  });
});

test("drag insertion zones use neighboring card halves and keep the source slot stable", () => {
  const result = sidebarEvaluate(`(() => {
    const centers = [100, 200, 300, 500, 600];
    clipRowsForDrop = () => centers.map((center) => ({
      getBoundingClientRect() { return { top: center - 40, height: 80 }; },
    }));
    clipReorderState = { originalOrder: [1, 2, 3, 4, 5, 6] };
    const probes = [50, 150, 250, 350, 450, 550, 650]
      .map((pointerY) => [pointerY, clipDropIndexFromPointerY(pointerY)]);
    const original = clipReorderState.originalOrder;
    return {
      probes,
      unchanged: moveClipIdToDropIndex(original, 4, 3, 3),
      oneSlotUp: moveClipIdToDropIndex(original, 4, 3, 2),
      oneSlotDown: moveClipIdToDropIndex(original, 4, 3, 4),
    };
  })()`);

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    probes: [[50, 0], [150, 1], [250, 2], [350, 3], [450, 3], [550, 4], [650, 5]],
    unchanged: [1, 2, 3, 4, 5, 6],
    oneSlotUp: [1, 2, 4, 3, 5, 6],
    oneSlotDown: [1, 2, 3, 5, 4, 6],
  });
});

test("active menu selection and Shift reversal keep the current sorting type", () => {
  const repeated = sidebarEvaluate(`(() => {
    latestState = { clipSortMode: "name", clipSortDirection: "ascending" };
    let requested = null;
    closeClipSortMenu = () => {};
    requestClipSort = (mode, direction) => { requested = [mode, direction]; };
    selectClipSortMode("name");
    return requested;
  })()`);
  assert.deepEqual(Array.from(repeated), ["name", "descending"]);

  const switched = sidebarEvaluate(`(() => {
    latestState = { clipSortMode: "name", clipSortDirection: "descending" };
    let requested = null;
    closeClipSortMenu = () => {};
    requestClipSort = (mode, direction) => { requested = [mode, direction]; };
    selectClipSortMode("creation");
    return requested;
  })()`);
  assert.deepEqual(Array.from(switched), ["creation", "descending"]);

  const shifted = sidebarEvaluate(`(() => {
    latestState = { clipSortMode: "duration", clipSortDirection: "ascending" };
    let requested = null;
    requestClipSort = (mode, direction) => { requested = [mode, direction]; };
    reverseCurrentClipSortDirection();
    return requested;
  })()`);
  assert.deepEqual(Array.from(shifted), ["duration", "descending"]);

  const custom = sidebarEvaluate(`(() => {
    latestState = { clipSortMode: "name", clipSortDirection: "descending" };
    let requested = null;
    closeClipSortMenu = () => {};
    requestClipSort = (mode, direction) => { requested = [mode, direction]; };
    selectClipSortMode("custom");
    return requested;
  })()`);
  assert.deepEqual(Array.from(custom), ["custom", "ascending"]);

  const customReverse = sidebarEvaluate(`(() => {
    latestState = {
      clipSortMode: "custom",
      clipSortDirection: "ascending",
      clips: [{ id: 1 }, { id: 3 }, { id: 2 }],
    };
    const requested = [];
    requestClipSort = (mode, direction, orderedIds) => {
      requested.push([mode, direction, orderedIds.slice()]);
      latestState.clips = clipsOrderedByIds(latestState.clips, orderedIds);
      latestState.clipSortDirection = direction;
    };
    reverseCurrentClipSortDirection();
    latestState.clips = clipsOrderedByIds(latestState.clips, [2, 1, 3]);
    reverseCurrentClipSortDirection();
    return {
      requested,
      direction: latestState.clipSortDirection,
      order: latestState.clips.map((clip) => clip.id),
    };
  })()`);
  assert.deepEqual(JSON.parse(JSON.stringify(customReverse)), {
    requested: [
      ["custom", "descending", [2, 3, 1]],
      ["custom", "ascending", [3, 1, 2]],
    ],
    direction: "ascending",
    order: [3, 1, 2],
  });
});

test("right-clicking Sort suppresses the context menu and reverses like Shift-click", () => {
  const result = sidebarEvaluate(`(() => {
    latestState = { clipSortMode: "name", clipSortDirection: "ascending" };
    const calls = [];
    closeClipSortMenu = (restoreFocus) => { calls.push(["close", restoreFocus]); };
    requestClipSort = (mode, direction) => { calls.push(["sort", mode, direction]); };
    const event = {
      prevented: false,
      stopped: false,
      preventDefault() { this.prevented = true; },
      stopPropagation() { this.stopped = true; },
    };
    handleClipSortContextMenu(event);
    return { calls, prevented: event.prevented, stopped: event.stopped };
  })()`);

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    calls: [["close", false], ["sort", "name", "descending"]],
    prevented: true,
    stopped: true,
  });
});

test("sort icon hydrates without animation and animates only a real direction change", () => {
  const result = sidebarEvaluate(`(() => {
    const button = {
      dataset: {},
      attributes: {},
      title: "",
      get offsetWidth() { return 24; },
      classList: {
        animationAdds: [],
        add(value) {
          if (value.startsWith("is-changing-to-")) this.animationAdds.push(value);
        },
        remove() {},
        toggle() {},
      },
      setAttribute(name, value) { this.attributes[name] = value; },
    };
    $ = (id) => id === "clipSortButton" ? button : null;
    clipSortMenuItems = () => [];
    clearTimeout = () => {};
    setTimeout = () => 1;

    updateClipSortControl({ clipSortMode: "creation", clipSortDirection: "descending" });
    updateClipSortControl({ clipSortMode: "creation", clipSortDirection: "descending" });
    updateClipSortControl({ clipSortMode: "creation", clipSortDirection: "ascending" });
    updateClipSortControl({ clipSortMode: "custom", clipSortDirection: "descending" });

    return {
      animationAdds: button.classList.animationAdds,
      direction: button.dataset.sortDirection,
      label: button.attributes["aria-label"],
    };
  })()`);

  assert.deepEqual(Array.from(result.animationAdds), ["is-changing-to-ascending", "is-changing-to-descending"]);
  assert.equal(result.direction, "descending");
  assert.equal(result.label, "Sort clips, custom order, descending");
});

test("Custom is represented by the first checked sort menu item", () => {
  const result = sidebarEvaluate(`(() => {
    const makeItem = (mode) => ({
      dataset: { sortMode: mode },
      attributes: {},
      tabIndex: -1,
      setAttribute(name, value) { this.attributes[name] = value; },
    });
    const items = ["custom", "creation", "name", "duration", "in", "out"].map(makeItem);
    const button = {
      dataset: {},
      classList: { add() {}, remove() {}, toggle() {} },
      setAttribute() {},
    };
    $ = (id) => id === "clipSortButton" ? button : null;
    clipSortMenuItems = () => items;

    updateClipSortControl({ clipSortMode: "custom", clipSortDirection: "ascending" });
    const initial = items.map((item) => ({ mode: item.dataset.sortMode, checked: item.attributes["aria-checked"], tabIndex: item.tabIndex }));
    updateClipSortControl({ clipSortMode: "duration", clipSortDirection: "ascending" });
    const selected = items.map((item) => ({ mode: item.dataset.sortMode, checked: item.attributes["aria-checked"], tabIndex: item.tabIndex }));
    return { initial, selected };
  })()`);

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    initial: [
      { mode: "custom", checked: "true", tabIndex: 0 },
      { mode: "creation", checked: "false", tabIndex: -1 },
      { mode: "name", checked: "false", tabIndex: -1 },
      { mode: "duration", checked: "false", tabIndex: -1 },
      { mode: "in", checked: "false", tabIndex: -1 },
      { mode: "out", checked: "false", tabIndex: -1 },
    ],
    selected: [
      { mode: "custom", checked: "false", tabIndex: -1 },
      { mode: "creation", checked: "false", tabIndex: -1 },
      { mode: "name", checked: "false", tabIndex: -1 },
      { mode: "duration", checked: "true", tabIndex: 0 },
      { mode: "in", checked: "false", tabIndex: -1 },
      { mode: "out", checked: "false", tabIndex: -1 },
    ],
  });
});

test("clip count stays hidden at zero and appears with the first clip", () => {
  const result = sidebarEvaluate(`(() => {
    const group = {
      hidden: false,
      attributes: {},
      setAttribute(name, value) { this.attributes[name] = value; },
    };
    const total = { textContent: "0" };
    $ = (id) => {
      if (id === "clipsCounterGroup") return group;
      if (id === "clipsTotalCount") return total;
      return null;
    };

    updateClipsHeaderCounts(0, 0);
    const empty = {
      hidden: group.hidden,
      ariaHidden: group.attributes["aria-hidden"],
      text: total.textContent,
    };
    updateClipsHeaderCounts(1, 0);
    const populated = {
      hidden: group.hidden,
      ariaHidden: group.attributes["aria-hidden"],
      text: total.textContent,
    };
    return { empty, populated };
  })()`);

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    empty: { hidden: true, ariaHidden: "true", text: "0" },
    populated: { hidden: false, ariaHidden: "false", text: "1" },
  });
});

test("selection summary animation survives repeated state refreshes", () => {
  const result = sidebarEvaluate(`(() => {
    const classes = new Set();
    const scheduledDurations = [];
    const clearedTimers = [];
    const summary = {
      hidden: true,
      scrollWidth: 80,
      attributes: {},
      classList: {
        add(...values) { values.forEach((value) => classes.add(value)); },
        remove(...values) { values.forEach((value) => classes.delete(value)); },
        contains(value) { return classes.has(value); },
      },
      style: {
        animationDuration: "",
        setProperty() {},
      },
      getBoundingClientRect() { return { width: 80 }; },
      setAttribute(name, value) { this.attributes[name] = value; },
    };
    const selectedNumber = { textContent: "1" };
    $ = (id) => {
      if (id === "clipsSelectionSummary") return summary;
      if (id === "clipsSelectedNumber") return selectedNumber;
      return null;
    };
    selectionSummaryAnimationTimer = null;
    window.setTimeout = (callback, duration) => {
      scheduledDurations.push(duration);
      return scheduledDurations.length;
    };
    window.clearTimeout = (timer) => { clearedTimers.push(timer); };

    setSelectionSummaryVisible(true, { animate: true, durationMs: 420 });
    const entryStarted = classes.has("is-showing");
    setSelectionSummaryVisible(true, { animate: false, durationMs: 420 });
    const entrySurvivedRefresh = classes.has("is-showing") && clearedTimers.length === 0;

    setSelectionSummaryVisible(false, { animate: true, durationMs: 280 });
    const exitStarted = classes.has("is-hiding") && !classes.has("is-showing");
    setSelectionSummaryVisible(false, { animate: false, durationMs: 280 });
    const exitSurvivedRefresh = classes.has("is-hiding") && clearedTimers.length === 1;

    return {
      entryStarted,
      entrySurvivedRefresh,
      exitStarted,
      exitSurvivedRefresh,
      scheduledDurations,
      clearedTimers,
    };
  })()`);

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    entryStarted: true,
    entrySurvivedRefresh: true,
    exitStarted: true,
    exitSurvivedRefresh: true,
    scheduledDurations: [420, 280],
    clearedTimers: [1],
  });
});

test("search collapse exceptions are limited to Delete selected and Deselect", () => {
  const result = sidebarEvaluate(`(() => {
    const deleteChild = {};
    const deselectChild = {};
    const other = {};
    const deleteButton = {
      contains(target) { return target === this || target === deleteChild; },
    };
    const clearButton = {
      contains(target) { return target === this || target === deselectChild; },
    };
    $ = (id) => {
      if (id === "deleteSelectedButton") return deleteButton;
      if (id === "clearSelectionButton") return clearButton;
      return null;
    };

    return {
      deleteButton: isClipSearchCollapseExemptTarget(deleteButton),
      deleteChild: isClipSearchCollapseExemptTarget(deleteChild),
      deselectButton: isClipSearchCollapseExemptTarget(clearButton),
      deselectChild: isClipSearchCollapseExemptTarget(deselectChild),
      other: isClipSearchCollapseExemptTarget(other),
      missing: isClipSearchCollapseExemptTarget(null),
    };
  })()`);

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    deleteButton: true,
    deleteChild: true,
    deselectButton: true,
    deselectChild: true,
    other: false,
    missing: false,
  });
});

test("Deselect compact state follows Search expansion and releases toolbar width", () => {
  const result = sidebarEvaluate(`(() => {
    const makeClassList = () => {
      const values = new Set();
      return {
        contains(value) { return values.has(value); },
        toggle(value, enabled) {
          if (enabled) values.add(value);
          else values.delete(value);
        },
      };
    };
    const control = { classList: makeClassList() };
    const selection = {
      classList: makeClassList(),
      getBoundingClientRect() { return { width: 104 }; },
    };
    const input = { value: "" };
    const labelSlot = { hidden: true };
    const toolbar = { getBoundingClientRect() { return { width: 260 }; } };
    $ = (id) => {
      if (id === "clipSearchControl") return control;
      if (id === "clipSearchInput") return input;
      if (id === "selectionActions") return selection;
      if (id === "clipsSelectionLabelSlot") return labelSlot;
      return null;
    };
    document.querySelector = (selector) => selector === ".clips-toolbar-actions" ? toolbar : null;

    clipSearchExpanded = false;
    syncClipSearchControl();
    const collapsed = selection.classList.contains("is-search-expanded");
    const collapsedTargetWidth = calculateClipSearchTargetWidth(false);
    clipSearchExpanded = true;
    syncClipSearchControl();
    const expanded = selection.classList.contains("is-search-expanded");
    const expandedTargetWidth = calculateClipSearchTargetWidth(true);
    return { collapsed, expanded, collapsedTargetWidth, expandedTargetWidth };
  })()`);

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    collapsed: false,
    expanded: true,
    collapsedTargetWidth: 165,
    expandedTargetWidth: 165,
  });
});

test("sticky Clips toolbar clips each scrolling surface exactly at its lower edge", () => {
  const overlaps = JSON.parse(sidebarEvaluate(`JSON.stringify([
    stickyOverlapForRects({ bottom: 120 }, { top: 160, height: 300 }),
    stickyOverlapForRects({ bottom: 120 }, { top: 92, height: 300 }),
    stickyOverlapForRects({ bottom: 120 }, { top: -260, height: 300 }),
    stickyOverlapForRects(null, { top: 0, height: 100 })
  ])`));
  assert.deepEqual(overlaps, [0, 28, 300, 0]);
});

test("delete confirmation prefers below, falls back above, and can be forced above", () => {
  const result = sidebarEvaluate(`(() => ({
    centeredBelow: calculateDeleteSelectedConfirmPosition(
      { left: 188, top: 300, width: 24, height: 24 },
      { width: 176, height: 70 },
      { width: 400, height: 500 },
    ),
    leftEdgeBelow: calculateDeleteSelectedConfirmPosition(
      { left: 2, top: 20, width: 24, height: 24 },
      { width: 176, height: 70 },
      { width: 400, height: 500 },
    ),
    rightEdgeBelow: calculateDeleteSelectedConfirmPosition(
      { left: 374, top: 300, width: 24, height: 24 },
      { width: 176, height: 70 },
      { width: 400, height: 500 },
    ),
    bottomFallbackAbove: calculateDeleteSelectedConfirmPosition(
      { left: 188, top: 450, width: 24, height: 24 },
      { width: 176, height: 70 },
      { width: 400, height: 500 },
    ),
    forcedAbove: calculateDeleteSelectedConfirmPosition(
      { left: 188, top: 300, width: 24, height: 24 },
      { width: 176, height: 70 },
      { width: 400, height: 500 },
      { preferredPlacement: "above", forcePlacement: true },
    ),
  }))()`);

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    centeredBelow: { left: 112, top: 340, anchorX: 88, placement: "below" },
    leftEdgeBelow: { left: 8, top: 60, anchorX: 10, placement: "below" },
    rightEdgeBelow: { left: 216, top: 340, anchorX: 166, placement: "below" },
    bottomFallbackAbove: { left: 112, top: 364, anchorX: 88, placement: "above" },
    forcedAbove: { left: 112, top: 214, anchorX: 88, placement: "above" },
  });
});

test("Shift bypasses enabled delete confirmations but adds nothing when confirmations are disabled", () => {
  const result = sidebarEvaluate(`(() => {
    const armedStates = [];
    const button = { classList: { toggle(name, enabled) { armedStates.push({ name, enabled }); } } };
    $ = (id) => id === "deleteSelectedButton" ? button : null;
    latestState = { deleteWithoutConfirmation: false };
    isShiftPreviewMode = false;
    const regularClick = shouldDeleteWithoutPrompt({ shiftKey: false });
    const shiftClick = shouldDeleteWithoutPrompt({ shiftKey: true });
    isShiftPreviewMode = true;
    const heldShift = shouldDeleteWithoutPrompt({ shiftKey: false });
    updateShiftDeleteArmedState();
    latestState = { deleteWithoutConfirmation: true };
    const preferenceAlreadyBypasses = shouldDeleteWithoutPrompt({ shiftKey: false });
    updateShiftDeleteArmedState();
    return { regularClick, shiftClick, heldShift, preferenceAlreadyBypasses, armedStates };
  })()`);

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    regularClick: false,
    shiftClick: true,
    heldShift: true,
    preferenceAlreadyBypasses: true,
    armedStates: [
      { name: "is-shift-delete-armed", enabled: true },
      { name: "is-shift-delete-armed", enabled: false },
    ],
  });
});

test("Clear List confirmation waits through a small scroll and closes as its button leaves the viewport", () => {
  const result = sidebarEvaluate(`(() => ({
    tinyScrollNearEdge: shouldDismissClearListConfirmation(
      8,
      { top: 384, bottom: 426, height: 42 },
      400,
    ),
    meaningfulScrollFullyVisible: shouldDismissClearListConfirmation(
      24,
      { top: 300, bottom: 342, height: 42 },
      400,
    ),
    meaningfulScrollNearEdge: shouldDismissClearListConfirmation(
      24,
      { top: 384, bottom: 426, height: 42 },
      400,
    ),
    shorterFallback: shouldDismissClearListConfirmation(
      80,
      { top: 300, bottom: 342, height: 42 },
      400,
    ),
    visibleRatioNearEdge: visibleVerticalRatio(
      { top: 384, bottom: 426, height: 42 },
      400,
    ),
  }))()`);

  const normalized = JSON.parse(JSON.stringify(result));
  assert.equal(normalized.tinyScrollNearEdge, false);
  assert.equal(normalized.meaningfulScrollFullyVisible, false);
  assert.equal(normalized.meaningfulScrollNearEdge, true);
  assert.equal(normalized.shorterFallback, true);
  assert.ok(normalized.visibleRatioNearEdge < 0.4);
});

test("Export All and Export Selected snapshot the supplied visible sorted order", async (t) => {
  const runtime = createRuntime();
  t.after(() => runtime.cleanup());
  await runtime.emit("iina.window-loaded");
  await runtime.callRpc("$getState");
  const state = runtime.evaluate("state");
  state.clips = [
    { id: 1, creationSequence: 1, name: "One", sourceFilePath: runtime.sourcePath, sourceFileDisplayName: "source", inPoint: 1, outPoint: 2, duration: 1, exportStatus: "pending", outputPath: "" },
    { id: 2, creationSequence: 2, name: "Two", sourceFilePath: runtime.sourcePath, sourceFileDisplayName: "source", inPoint: 2, outPoint: 3, duration: 1, exportStatus: "pending", outputPath: "" },
    { id: 3, creationSequence: 3, name: "Three", sourceFilePath: runtime.sourcePath, sourceFileDisplayName: "source", inPoint: 3, outPoint: 4, duration: 1, exportStatus: "pending", outputPath: "" },
  ];

  const synced = await runtime.callRpc("$setClipViewOrder", [3, 1], runtime.sourcePath);
  assert.equal(synced.ok, true);
  await runtime.callRpc("$exportAll");
  let exports = runtime.execCalls.filter((call) => call.executable.endsWith("/ffmpeg") && call.args[0] !== "-version");
  assert.deepEqual(exports.map((call) => path.basename(call.args.at(-1))), ["Three.mp4", "One.mp4"]);

  state.clips.forEach((clip) => { clip.exportStatus = "pending"; });
  await runtime.callRpc("$exportSelected", [3, 2], [2, 1, 3]);
  exports = runtime.execCalls.filter((call) => call.executable.endsWith("/ffmpeg") && call.args[0] !== "-version").slice(2);
  assert.deepEqual(exports.map((call) => path.basename(call.args.at(-1))), ["Two.mp4", "Three_02.mp4"]);
});

test("Delete clips after export removes successful selected and all batches", async (t) => {
  const runtime = createRuntime();
  t.after(() => runtime.cleanup());
  runtime.preferences.set("deleteClipsAfterExport", true);
  await runtime.emit("iina.window-loaded");
  const internalState = runtime.evaluate("state");
  internalState.clips = [
    { id: 1, creationSequence: 1, name: "One", sourceFilePath: runtime.sourcePath, sourceFileDisplayName: "source", inPoint: 1, outPoint: 2, duration: 1, exportStatus: "pending", outputPath: "" },
    { id: 2, creationSequence: 2, name: "Two", sourceFilePath: runtime.sourcePath, sourceFileDisplayName: "source", inPoint: 2, outPoint: 3, duration: 1, exportStatus: "pending", outputPath: "" },
    { id: 3, creationSequence: 3, name: "Three", sourceFilePath: runtime.sourcePath, sourceFileDisplayName: "source", inPoint: 3, outPoint: 4, duration: 1, exportStatus: "pending", outputPath: "" },
  ];

  let result = await runtime.callRpc("$exportSelected", [1, 3], [3, 2, 1]);
  assert.deepEqual(result.clips.map((clip) => clip.id), [2]);
  assert.deepEqual(result.selectedClipIds, []);
  assert.equal(result.deleteClipsAfterExport, true);

  internalState.clips.push(
    { id: 4, creationSequence: 4, name: "Four", sourceFilePath: runtime.sourcePath, sourceFileDisplayName: "source", inPoint: 4, outPoint: 5, duration: 1, exportStatus: "pending", outputPath: "" },
    { id: 5, creationSequence: 5, name: "Five", sourceFilePath: runtime.sourcePath, sourceFileDisplayName: "source", inPoint: 5, outPoint: 6, duration: 1, exportStatus: "pending", outputPath: "" }
  );
  result = await runtime.callRpc("$exportAll", [5, 2, 4]);
  assert.deepEqual(result.clips, []);
  assert.equal(result.exportMessage, "Export complete: 3/3");
});

test("Delete clips after export keeps failed clips available for retry", async (t) => {
  const runtime = createRuntime({
    async exec(call, controls) {
      if (call.executable.endsWith("/ffmpeg") && call.args[0] !== "-version") {
        const outputPath = call.args.at(-1);
        if (path.basename(outputPath).startsWith("Retry")) {
          return { status: 1, stdout: "", stderr: "encoding failed" };
        }
        controls.existingFiles.add(outputPath);
        return { status: 0, stdout: "", stderr: "" };
      }
      return undefined;
    },
  });
  t.after(() => runtime.cleanup());
  runtime.preferences.set("deleteClipsAfterExport", true);
  await runtime.emit("iina.window-loaded");
  const internalState = runtime.evaluate("state");
  internalState.clips = [
    { id: 1, creationSequence: 1, name: "Done", sourceFilePath: runtime.sourcePath, sourceFileDisplayName: "source", inPoint: 1, outPoint: 2, duration: 1, exportStatus: "pending", outputPath: "" },
    { id: 2, creationSequence: 2, name: "Retry", sourceFilePath: runtime.sourcePath, sourceFileDisplayName: "source", inPoint: 2, outPoint: 3, duration: 1, exportStatus: "pending", outputPath: "" },
  ];

  const result = await runtime.callRpc("$exportAll", [1, 2]);
  assert.deepEqual(result.clips.map((clip) => clip.id), [2]);
  assert.equal(result.clips[0].exportStatus, "failed");
  assert.equal(result.exportMessage, "Export complete: 1/2");
});

test("closing or changing media clears marks, clips, selection, and export state", async (t) => {
  const runtime = createRuntime();
  t.after(() => runtime.cleanup());
  await runtime.emit("iina.window-loaded");

  const internalState = runtime.evaluate("state");
  internalState.inPoint = 1;
  internalState.outPoint = 2;
  internalState.clips = [{
    id: 9,
    name: "Stale",
    sourceFilePath: runtime.sourcePath,
    sourceFileDisplayName: "source",
    inPoint: 1,
    outPoint: 2,
    duration: 1,
    exportStatus: "exported",
    outputPath: "/tmp/Stale.mp4",
  }];
  internalState.selectedClipIds = [9];
  internalState.selectedClipId = 9;
  internalState.nextClipId = 10;
  internalState.exporting = true;
  internalState.lastExportedFile = "/tmp/Stale.mp4";

  runtime.status.idle = true;
  runtime.status.url = "";
  // mpv intentionally retains the old path during IINA's transition window.
  let state = await runtime.callRpc("$getState");
  assert.equal(state.currentFilePath, "");
  assert.equal(state.positionSeconds, null);
  assert.equal(state.clips.length, 0);
  assert.deepEqual(Array.from(state.selectedClipIds), []);
  assert.equal(state.lastExportedFile, "");

  runtime.status.idle = false;
  runtime.status.mediaPath = runtime.secondSourcePath;
  runtime.status.url = `file://${encodeURI(runtime.secondSourcePath)}`;
  runtime.status.title = path.basename(runtime.secondSourcePath);
  state = await runtime.callRpc("$getState");
  assert.equal(state.currentFilePath, runtime.secondSourcePath);
  assert.equal(state.clips.length, 0);

  runtime.status.position = 3;
  await runtime.callRpc("$setIn");
  runtime.status.position = 4;
  await runtime.callRpc("$setOut");
  state = await runtime.callRpc("$addClip");
  assert.equal(state.clips[0].id, 1);
  assert.equal(state.clips[0].sourceFilePath, runtime.secondSourcePath);
});

test("filename normalization is traversal-safe and avoids duplicate extensions", async (t) => {
  const runtime = createRuntime();
  t.after(() => runtime.cleanup());
  const sanitizeFilename = runtime.evaluate("sanitizeFilename");
  const stableOutputPath = runtime.evaluate("stableOutputPath");
  const state = runtime.evaluate("state");

  assert.equal(sanitizeFilename("/\\:*?\"<>|"), "---------");
  assert.equal(sanitizeFilename("\u0000Control\u001fName"), "-Control-Name");
  assert.equal(sanitizeFilename("."), "Clip");
  assert.equal(sanitizeFilename(".."), "Clip");
  assert.equal(sanitizeFilename("Кириллица 🎬"), "Кириллица 🎬");
  assert.equal(Buffer.byteLength(sanitizeFilename("A".repeat(300)), "utf8"), 180);
  assert.equal(Buffer.byteLength(sanitizeFilename("Ж".repeat(300)), "utf8"), 180);
  assert.equal(Buffer.byteLength(sanitizeFilename("🎬".repeat(300)), "utf8"), 180);
  assert.equal(sanitizeFilename("🎬".repeat(300)).length, 90);

  state.currentSourcePath = runtime.sourcePath;
  const clip = { name: "Final.mp4", sourceFilePath: runtime.sourcePath };
  assert.equal(stableOutputPath(clip, 1, "/tmp/exports"), "/tmp/exports/Final.mp4");
  runtime.existingFiles.add("/tmp/exports/Final.mp4");
  assert.equal(stableOutputPath(clip, 1, "/tmp/exports"), "/tmp/exports/Final_02.mp4");
  runtime.preferences.set("container", "mov");
  assert.equal(stableOutputPath(clip, 1, "/tmp/other"), "/tmp/other/Final.mp4.mov");
  runtime.preferences.set("container", "mkv");
  assert.equal(stableOutputPath({ ...clip, name: "Unicode Клип 🎬" }, 1, "/tmp/other"), "/tmp/other/Unicode Клип 🎬.mkv");
});

test("a valid manual FFmpeg path has priority and an invalid override does not fall through", async (t) => {
  const manualPath = "/Applications/Tools With Spaces/ffmpeg";
  const valid = createRuntime();
  t.after(() => valid.cleanup());
  valid.existingFiles.add(manualPath);
  valid.preferences.set("ffmpegPath", manualPath);
  await valid.emit("iina.window-loaded");
  const validState = valid.evaluate("state");
  validState.clips = [{ id: 1, name: "Manual", sourceFilePath: valid.sourcePath, sourceFileDisplayName: "source", inPoint: 1, outPoint: 2, duration: 1, exportStatus: "pending", outputPath: "" }];
  await valid.callRpc("$exportAll");
  assert.ok(valid.execCalls.some((call) => call.executable === manualPath && call.args[0] === "-version"));
  assert.ok(valid.execCalls.some((call) => call.executable === manualPath && call.args[0] === "-n"));
  assert.equal(valid.execCalls.some((call) => call.executable === "/usr/bin/which"), false);

  const invalid = createRuntime();
  t.after(() => invalid.cleanup());
  invalid.preferences.set("ffmpegPath", "/missing/manual/ffmpeg");
  await invalid.emit("iina.window-loaded");
  const invalidState = invalid.evaluate("state");
  invalidState.clips = [{ id: 1, name: "Invalid", sourceFilePath: invalid.sourcePath, sourceFileDisplayName: "source", inPoint: 1, outPoint: 2, duration: 1, exportStatus: "pending", outputPath: "" }];
  const result = await invalid.callRpc("$exportAll");
  assert.equal(result.ffmpegAvailable, false);
  assert.match(result.lastError, /Invalid FFmpeg-full executable/);
  assert.equal(invalid.execCalls.some((call) => call.args[0] === "-n"), false);
});

test("FFmpeg-full is mandatory and a missing formula exposes setup state", async (t) => {
  const runtime = createRuntime();
  t.after(() => runtime.cleanup());
  runtime.preferences.set("ffmpegPath", "");
  runtime.preferences.set("ffmpegFullConfirmed", false);
  runtime.existingFiles.delete("/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg");
  runtime.existingFiles.delete("/opt/homebrew/opt/ffmpeg-full/bin/ffprobe");

  await runtime.evaluate("detectStableFfmpeg()");
  const state = runtime.evaluate("buildStableState()");
  assert.equal(state.ffmpegFullRequired, true);
  assert.equal(state.ffmpegAvailable, false);
  assert.equal(state.ffmpegCheckComplete, true);
  assert.equal(state.ffmpegSetupPhase, "missing");
  assert.match(state.ffmpegSetupMessage, /best experience/);
});

test("Homebrew installation uses argument arrays and requires an IINA restart", async (t) => {
  const runtime = createRuntime();
  t.after(() => runtime.cleanup());
  runtime.preferences.set("ffmpegPath", "");
  runtime.preferences.set("ffmpegFullConfirmed", false);
  runtime.existingFiles.delete("/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg");
  runtime.existingFiles.delete("/opt/homebrew/opt/ffmpeg-full/bin/ffprobe");
  await runtime.emit("iina.window-loaded");

  const result = await runtime.callRpc("$installFfmpegFull", {
    installationDirectory: "/opt/homebrew",
  });
  const installCall = runtime.execCalls.find((call) => (
    call.executable === "/opt/homebrew/bin/brew" &&
    call.args[0] === "install"
  ));
  assert.ok(installCall);
  assert.deepEqual(installCall.args, ["install", "ffmpeg-full"]);
  assert.equal(result.ffmpegSetupPhase, "restart-required");
  assert.equal(result.ffmpegRestartRequired, true);
  assert.equal(result.ffmpegAvailable, false);
  assert.equal(result.ffmpegFound, true);
  assert.equal(runtime.preferences.get("ffmpegFullConfirmed"), true);
  assert.equal(runtime.preferences.get("ffmpegPath"), "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg");
});

test("missing Homebrew opens an interactive Terminal install and can be checked later", async (t) => {
  const runtime = createRuntime();
  t.after(() => runtime.cleanup());
  runtime.preferences.set("ffmpegPath", "");
  runtime.preferences.set("ffmpegFullConfirmed", false);
  runtime.preferences.set("homebrewPath", "");
  runtime.existingFiles.delete("/opt/homebrew/bin/brew");
  runtime.existingFiles.delete("/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg");
  runtime.existingFiles.delete("/opt/homebrew/opt/ffmpeg-full/bin/ffprobe");
  await runtime.emit("iina.window-loaded");

  const opened = await runtime.callRpc("$installFfmpegFull", {});
  const terminalCall = runtime.execCalls.find((call) => call.executable === "/usr/bin/osascript");
  assert.ok(terminalCall);
  assert.match(terminalCall.args.join("\n"), /Homebrew.*Terminal|Terminal[\s\S]*ffmpeg-full/i);
  assert.equal(opened.ffmpegSetupPhase, "installing-terminal");
  assert.equal(opened.ffmpegRestartRequired, false);

  runtime.existingFiles.add("/opt/homebrew/bin/brew");
  runtime.existingFiles.add("/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg");
  runtime.existingFiles.add("/opt/homebrew/opt/ffmpeg-full/bin/ffprobe");
  const checked = await runtime.callRpc("$checkFfmpegFull");
  assert.equal(checked.ffmpegSetupPhase, "restart-required");
  assert.equal(checked.ffmpegRestartRequired, true);
});

test("an organization path can use an existing FFmpeg-full executable", async (t) => {
  const customFfmpeg = "/Organization/Media Tools/ffmpeg";
  const runtime = createRuntime();
  t.after(() => runtime.cleanup());
  runtime.existingFiles.add(customFfmpeg);
  await runtime.emit("iina.window-loaded");

  const beforePreferenceSync = runtime.preferenceSyncCount;
  const result = await runtime.callRpc("$useExistingFfmpegFull", {
    ffmpegPath: customFfmpeg,
  });
  assert.equal(result.ffmpegSetupPhase, "ready");
  assert.equal(result.ffmpegAvailable, true);
  assert.equal(result.ffmpegPath, customFfmpeg);
  assert.equal(runtime.preferences.get("ffmpegFullConfirmed"), true);
  assert.equal(runtime.preferenceSyncCount, beforePreferenceSync + 1);
});

test("a valid installation directory installs FFmpeg-full through that location", async (t) => {
  const installationDirectory = "/Organization/Homebrew";
  const customBrew = `${installationDirectory}/bin/brew`;
  const customFfmpeg = `${installationDirectory}/opt/ffmpeg-full/bin/ffmpeg`;
  const customFfprobe = `${installationDirectory}/opt/ffmpeg-full/bin/ffprobe`;
  const runtime = createRuntime({
    async exec(call, controls) {
      if (call.executable !== customBrew) return undefined;
      if (call.args[0] === "--version") {
        return { status: 0, stdout: "Homebrew 5.0.0\n", stderr: "" };
      }
      if (call.args[0] === "--prefix" && call.args.length === 1) {
        return { status: 0, stdout: `${installationDirectory}\n`, stderr: "" };
      }
      if (call.args[0] === "install" && call.args[1] === "ffmpeg-full") {
        controls.existingFiles.add(customFfmpeg);
        controls.existingFiles.add(customFfprobe);
        return { status: 0, stdout: "installed ffmpeg-full\n", stderr: "" };
      }
      if (call.args[0] === "--prefix" && call.args[1] === "ffmpeg-full") {
        return { status: 0, stdout: `${installationDirectory}/opt/ffmpeg-full\n`, stderr: "" };
      }
      return undefined;
    },
  });
  t.after(() => runtime.cleanup());
  runtime.existingFiles.add(customBrew);
  await runtime.emit("iina.window-loaded");

  const result = await runtime.callRpc("$installFfmpegFull", { installationDirectory });
  const installCall = runtime.execCalls.find((call) => (
    call.executable === customBrew &&
    call.args[0] === "install"
  ));
  assert.ok(installCall);
  assert.deepEqual(installCall.args, ["install", "ffmpeg-full"]);
  assert.equal(result.ffmpegSetupPhase, "restart-required");
  assert.equal(result.ffmpegPath, customFfmpeg);
  assert.equal(runtime.preferences.get("homebrewPath"), customBrew);
});

test("an empty installation directory is prepared and installs FFmpeg-full there", async (t) => {
  const installationDirectory = "/Users/tester/Tools/ClipMaker";
  const customBrew = `${installationDirectory}/bin/brew`;
  const customFfmpeg = `${installationDirectory}/opt/ffmpeg-full/bin/ffmpeg`;
  const customFfprobe = `${installationDirectory}/opt/ffmpeg-full/bin/ffprobe`;
  const runtime = createRuntime({
    async exec(call, controls) {
      if (call.executable === "/usr/bin/git" && call.args[0] === "clone") {
        controls.existingFiles.add(customBrew);
        return { status: 0, stdout: "cloned Homebrew\n", stderr: "" };
      }
      if (call.executable !== customBrew) return undefined;
      if (call.args[0] === "--version") {
        return { status: 0, stdout: "Homebrew 5.0.0\n", stderr: "" };
      }
      if (call.args[0] === "--prefix" && call.args.length === 1) {
        return { status: 0, stdout: `${installationDirectory}\n`, stderr: "" };
      }
      if (call.args[0] === "install" && call.args[1] === "ffmpeg-full") {
        controls.existingFiles.add(customFfmpeg);
        controls.existingFiles.add(customFfprobe);
        return { status: 0, stdout: "installed ffmpeg-full\n", stderr: "" };
      }
      if (call.args[0] === "--prefix" && call.args[1] === "ffmpeg-full") {
        return { status: 0, stdout: `${installationDirectory}/opt/ffmpeg-full\n`, stderr: "" };
      }
      return undefined;
    },
  });
  t.after(() => runtime.cleanup());
  await runtime.emit("iina.window-loaded");

  const result = await runtime.callRpc("$installFfmpegFull", { installationDirectory });
  const cloneCall = runtime.execCalls.find((call) => call.executable === "/usr/bin/git");
  assert.ok(cloneCall);
  assert.deepEqual(cloneCall.args, [
    "clone",
    "--depth=1",
    "https://github.com/Homebrew/brew",
    installationDirectory,
  ]);
  assert.equal(result.ffmpegSetupPhase, "restart-required");
  assert.equal(result.ffmpegPath, customFfmpeg);
  assert.equal(runtime.preferences.get("homebrewPath"), customBrew);
});

test("an invalid installation directory does not start an FFmpeg-full installation", async (t) => {
  const runtime = createRuntime();
  t.after(() => runtime.cleanup());
  await runtime.emit("iina.window-loaded");

  const result = await runtime.callRpc("$installFfmpegFull", {
    installationDirectory: "/",
  });
  assert.equal(result.ffmpegSetupPhase, "error");
  assert.match(result.lastError, /Invalid installation directory/);
  assert.equal(runtime.execCalls.some((call) => call.executable === "/usr/bin/git"), false);
});

test("an ordinary FFmpeg executable is rejected as an existing FFmpeg-full build", async (t) => {
  const plainFfmpeg = "/Organization/Media Tools/plain/ffmpeg";
  const runtime = createRuntime({
    async exec(call) {
      if (call.executable === plainFfmpeg && call.args[0] === "-version") {
        return {
          status: 0,
          stdout: "ffmpeg version 8.1 test\nconfiguration: --enable-libx264 --enable-libx265\n",
          stderr: "",
        };
      }
      return undefined;
    },
  });
  t.after(() => runtime.cleanup());
  runtime.existingFiles.add(plainFfmpeg);
  await runtime.emit("iina.window-loaded");
  runtime.preferences.set("ffmpegPath", "");
  runtime.preferences.set("ffmpegFullConfirmed", false);

  const result = await runtime.callRpc("$useExistingFfmpegFull", {
    ffmpegPath: plainFfmpeg,
  });
  assert.equal(result.ffmpegSetupPhase, "error");
  assert.equal(result.ffmpegAvailable, false);
  assert.match(result.lastError, /not an FFmpeg-full build/);
  assert.notEqual(runtime.preferences.get("ffmpegPath"), plainFfmpeg);
  assert.notEqual(runtime.preferences.get("ffmpegFullConfirmed"), true);
});

test("preview seeks numerically, starts playback, and is cancelled by another mark action", async (t) => {
  const runtime = createRuntime();
  t.after(() => runtime.cleanup());
  await runtime.emit("iina.window-loaded");
  const state = await runtime.callRpc("$previewPlay", { target: 2.125, stopAt: 3.5 });
  assert.equal(state.ok, true);
  assert.equal(state.preview.target, 2.125);
  assert.equal(state.preview.stopAt, 3.5);
  assert.equal(runtime.status.position, 2.125);
  assert.equal(runtime.status.paused, false);
  runtime.status.position = 4;
  const afterSetIn = await runtime.callRpc("$setIn");
  assert.equal(afterSetIn.inPoint, 4);
  assert.equal(runtime.evaluate("previewStopIntervalId"), null);
  assert.equal(runtime.evaluate("previewStopTimeoutId"), null);
});

test("adaptive AAC bitrate follows source quality and channel count", (t) => {
  const runtime = createRuntime();
  t.after(() => runtime.cleanup());
  const result = runtime.evaluate(`(() => ({
    mono64: adaptiveAacBitrateKbps({ codec_name: "aac", bit_rate: 64000, channels: 1 }),
    monoLossless: adaptiveAacBitrateKbps({ codec_name: "flac", channels: 1 }),
    stereo96: adaptiveAacBitrateKbps({ codec_name: "aac", bit_rate: 96000, channels: 2 }),
    stereo128: adaptiveAacBitrateKbps({ codec_name: "aac", bit_rate: 128000, channels: 2 }),
    stereo192: adaptiveAacBitrateKbps({ codec_name: "aac", bit_rate: 192000, channels: 2 }),
    stereo256: adaptiveAacBitrateKbps({ codec_name: "aac", bit_rate: 256000, channels: 2 }),
    stereo320: adaptiveAacBitrateKbps({ codec_name: "aac", bit_rate: 320000, channels: 2 }),
    stereoLossless: adaptiveAacBitrateKbps({ codec_name: "alac", channels: 2 }),
    surround384: adaptiveAacBitrateKbps({ codec_name: "ac3", bit_rate: 384000, channels: 6 }),
    surroundHigh: adaptiveAacBitrateKbps({ codec_name: "truehd", channels: 8 }),
    unknown: adaptiveAacBitrateKbps({}),
  }))()`);

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    mono64: 96,
    monoLossless: 192,
    stereo96: 128,
    stereo128: 160,
    stereo192: 192,
    stereo256: 256,
    stereo320: 320,
    stereoLossless: 320,
    surround384: 384,
    surroundHigh: 512,
    unknown: 192,
  });
});

test("Precise probes every audio stream and applies adaptive AAC bitrates", async (t) => {
  const runtime = createRuntime({
    async exec(call) {
      if (call.executable.endsWith("/ffprobe")) {
        return {
          status: 0,
          stdout: JSON.stringify({
            streams: [
              { codec_name: "aac", bit_rate: "128000", sample_rate: "48000", channels: 2, channel_layout: "stereo" },
              { codec_name: "ac3", bit_rate: "384000", sample_rate: "48000", channels: 6, channel_layout: "5.1" },
            ],
          }),
          stderr: "",
        };
      }
      return undefined;
    },
  });
  t.after(() => runtime.cleanup());
  runtime.preferences.set("exportMode", "precise");
  await runtime.emit("iina.window-loaded");
  const state = runtime.evaluate("state");
  state.clips = [{ id: 1, name: "Adaptive", sourceFilePath: runtime.sourcePath, sourceFileDisplayName: "source", inPoint: 2, outPoint: 4, duration: 2, exportStatus: "pending", outputPath: "" }];

  await runtime.callRpc("$exportAll");
  const probeCall = runtime.execCalls.find((call) => call.executable.endsWith("/ffprobe"));
  assert.ok(probeCall);
  assert.ok(probeCall.args.includes("stream=codec_name,bit_rate,sample_rate,channels,channel_layout"));
  const exportCall = runtime.execCalls.filter((call) => call.executable.endsWith("/ffmpeg") && call.args[0] !== "-version").at(-1);
  assert.equal(exportCall.args[exportCall.args.indexOf("-b:a:0") + 1], "160k");
  assert.equal(exportCall.args[exportCall.args.indexOf("-b:a:1") + 1], "384k");
  assert.equal(exportCall.args.includes("-b:a"), false);
});

test("Precise falls back to 192 kbps when ffprobe is unavailable", async (t) => {
  const runtime = createRuntime({
    async exec(call) {
      if (call.executable === "/usr/bin/which" && call.args[0] === "ffprobe") {
        return { status: 1, stdout: "", stderr: "not found" };
      }
      return undefined;
    },
  });
  t.after(() => runtime.cleanup());
  runtime.existingFiles.delete("/opt/homebrew/opt/ffmpeg-full/bin/ffprobe");
  runtime.preferences.set("exportMode", "precise");
  await runtime.emit("iina.window-loaded");
  const state = runtime.evaluate("state");
  state.clips = [{ id: 1, name: "Fallback", sourceFilePath: runtime.sourcePath, sourceFileDisplayName: "source", inPoint: 2, outPoint: 4, duration: 2, exportStatus: "pending", outputPath: "" }];

  await runtime.callRpc("$exportAll");
  const exportCall = runtime.execCalls.filter((call) => call.executable.endsWith("/ffmpeg") && call.args[0] !== "-version").at(-1);
  assert.equal(exportCall.args[exportCall.args.indexOf("-b:a") + 1], "192k");
  assert.equal(runtime.execCalls.some((call) => call.executable.endsWith("/ffprobe")), false);
});

test("export snapshots order and titles, keeps modes distinct, and honors reveal preference", async (t) => {
  let firstExportStartedResolve;
  let releaseFirstExport;
  const firstExportStarted = new Promise((resolve) => { firstExportStartedResolve = resolve; });
  const firstExportGate = new Promise((resolve) => { releaseFirstExport = resolve; });
  let exportCallCount = 0;

  const runtime = createRuntime({
    async exec(call, controls) {
      if (call.executable.endsWith("/ffmpeg") && call.args[0] !== "-version") {
        exportCallCount += 1;
        if (exportCallCount === 1) {
          firstExportStartedResolve();
          await firstExportGate;
        }
        controls.existingFiles.add(call.args[call.args.length - 1]);
        return { status: 0, stdout: "", stderr: "" };
      }
      return undefined;
    },
  });
  t.after(() => runtime.cleanup());
  await runtime.emit("iina.window-loaded");

  const state = runtime.evaluate("state");
  state.clips = [
    { id: 1, name: "First", sourceFilePath: runtime.sourcePath, sourceFileDisplayName: "source", inPoint: 1, outPoint: 3, duration: 2, exportStatus: "pending", outputPath: "" },
    { id: 2, name: "Second.mp4", sourceFilePath: runtime.sourcePath, sourceFileDisplayName: "source", inPoint: 4, outPoint: 7.25, duration: 3.25, exportStatus: "pending", outputPath: "" },
  ];
  runtime.preferences.set("clipSortMode", "custom");
  runtime.preferences.set("clipSortDirection", "ascending");

  const exportPromise = runtime.callRpc("$exportAll");
  await firstExportStarted;
  let blockedState = await runtime.callRpc("$renameClip", 1, "Blocked during export");
  assert.equal(blockedState.clips[0].name, "First");
  blockedState = await runtime.callRpc("$clearList");
  assert.equal(blockedState.clips.length, 2);
  state.clips[1].name = "Changed after batch start";
  state.clips.reverse();
  releaseFirstExport();
  const result = await exportPromise;

  const fastCalls = runtime.execCalls.filter((call) => call.executable.endsWith("/ffmpeg") && call.args[0] !== "-version");
  assert.equal(fastCalls.length, 2);
  assert.equal(fastCalls[0].args.at(-1), "/Users/tester/Desktop/First.mp4");
  assert.equal(fastCalls[1].args.at(-1), "/Users/tester/Desktop/Second.mp4");
  assert.ok(fastCalls.every((call) => call.args[0] === "-n"));
  assert.ok(fastCalls.every((call) => call.args.includes("copy")));
  assert.equal(result.exportMessage, "Export complete: 2/2");
  assert.deepEqual(runtime.revealedPaths, [fastCalls[0].args.at(-1), fastCalls[1].args.at(-1)]);
  assert.equal(runtime.execCalls.some((call) => call.executable.endsWith("/ffprobe")), false);

  runtime.preferences.set("exportMode", "precise");
  state.clips = [{ id: 3, name: "Precise", sourceFilePath: runtime.sourcePath, sourceFileDisplayName: "source", inPoint: 8, outPoint: 9.5, duration: 1.5, exportStatus: "pending", outputPath: "" }];
  await runtime.callRpc("$exportAll");
  const preciseCall = runtime.execCalls.filter((call) => call.executable.endsWith("/ffmpeg") && call.args[0] !== "-version").at(-1);
  assert.ok(preciseCall.args.includes("libx264"));
  assert.equal(preciseCall.args.includes("copy"), false);
  assert.ok(preciseCall.args.indexOf("-i") < preciseCall.args.indexOf("-ss"));
  assert.equal(preciseCall.args[preciseCall.args.indexOf("-b:a:0") + 1], "192k");
});

test("ask-where-to-save opens one picker per batch and cancellation starts no export", async (t) => {
  let pickerCalls = 0;
  const runtime = createRuntime({
    async exec(call) {
      if (call.executable === "/usr/bin/osascript") {
        pickerCalls += 1;
        return { status: 1, stdout: "", stderr: "execution error: User canceled. (-128)" };
      }
      return undefined;
    },
  });
  t.after(() => runtime.cleanup());
  runtime.preferences.set("askWhereToSave", true);
  await runtime.emit("iina.window-loaded");
  const state = runtime.evaluate("state");
  state.clips = [{ id: 1, name: "One", sourceFilePath: runtime.sourcePath, sourceFileDisplayName: "source", inPoint: 1, outPoint: 2, duration: 1, exportStatus: "pending", outputPath: "" }];

  const result = await runtime.callRpc("$exportAll");
  assert.equal(pickerCalls, 1);
  assert.equal(result.exportMessage, "Export cancelled");
  assert.equal(runtime.execCalls.some((call) => call.executable.endsWith("/ffmpeg") && call.args[0] !== "-version"), false);
});

test("a chosen batch folder is used once, never persisted, and requested again next time", async (t) => {
  const runtime = createRuntime();
  t.after(() => runtime.cleanup());
  runtime.preferences.set("askWhereToSave", true);
  const configuredFolder = runtime.preferences.get("outputFolder");
  await runtime.emit("iina.window-loaded");
  const internalState = runtime.evaluate("state");
  internalState.clips = [
    { id: 1, name: "One", sourceFilePath: runtime.sourcePath, sourceFileDisplayName: "source", inPoint: 1, outPoint: 2, duration: 1, exportStatus: "pending", outputPath: "" },
    { id: 2, name: "Two", sourceFilePath: runtime.sourcePath, sourceFileDisplayName: "source", inPoint: 3, outPoint: 4, duration: 1, exportStatus: "pending", outputPath: "" },
  ];

  await runtime.callRpc("$exportAll");
  let pickerCalls = runtime.execCalls.filter((call) => call.executable === "/usr/bin/osascript");
  let exports = runtime.execCalls.filter((call) => call.executable.endsWith("/ffmpeg") && call.args[0] !== "-version");
  assert.equal(pickerCalls.length, 1);
  assert.equal(exports.length, 2);
  assert.ok(exports.every((call) => call.args.at(-1).startsWith("/tmp/ClipMaker exports/")));
  assert.equal(runtime.preferences.get("outputFolder"), configuredFolder);

  internalState.clips.forEach((clip) => { clip.exportStatus = "pending"; });
  await runtime.callRpc("$exportAll");
  pickerCalls = runtime.execCalls.filter((call) => call.executable === "/usr/bin/osascript");
  exports = runtime.execCalls.filter((call) => call.executable.endsWith("/ffmpeg") && call.args[0] !== "-version");
  assert.equal(pickerCalls.length, 2);
  assert.equal(exports.length, 4);
  assert.equal(runtime.preferences.get("outputFolder"), configuredFolder);
});

test("a media change ignores late FFmpeg failures from the previous session", async (t) => {
  let exportStartedResolve;
  let releaseExport;
  const exportStarted = new Promise((resolve) => { exportStartedResolve = resolve; });
  const exportGate = new Promise((resolve) => { releaseExport = resolve; });
  const runtime = createRuntime({
    async exec(call) {
      if (call.executable.endsWith("/ffmpeg") && call.args[0] !== "-version") {
        exportStartedResolve();
        await exportGate;
        throw new Error("late failure from old media");
      }
      return undefined;
    },
  });
  t.after(() => runtime.cleanup());
  await runtime.emit("iina.window-loaded");

  const internalState = runtime.evaluate("state");
  internalState.clips = [{
    id: 1,
    name: "Old media clip",
    sourceFilePath: runtime.sourcePath,
    sourceFileDisplayName: "source",
    inPoint: 1,
    outPoint: 2,
    duration: 1,
    exportStatus: "pending",
    outputPath: "",
  }];

  const exportPromise = runtime.callRpc("$exportAll");
  await exportStarted;
  runtime.status.mediaPath = runtime.secondSourcePath;
  runtime.status.url = `file://${encodeURI(runtime.secondSourcePath)}`;
  runtime.status.title = path.basename(runtime.secondSourcePath);
  let state = await runtime.callRpc("$getState");
  assert.equal(state.currentFilePath, runtime.secondSourcePath);
  assert.equal(state.clips.length, 0);
  assert.equal(state.exporting, false);

  releaseExport();
  assert.equal(await exportPromise, null);
  state = await runtime.callRpc("$getState");
  assert.equal(state.currentFilePath, runtime.secondSourcePath);
  assert.equal(state.clips.length, 0);
  assert.equal(state.lastError, "");
  assert.equal(state.exporting, false);
});

test("an output collision is never treated as a successful export", async (t) => {
  const runtime = createRuntime({
    async exec(call, controls) {
      if (call.executable.endsWith("/ffmpeg") && call.args[0] !== "-version") {
        controls.existingFiles.add(call.args.at(-1));
        return {
          status: 1,
          stdout: "",
          stderr: `File '${call.args.at(-1)}' already exists. Exiting.\nError opening output file.`,
        };
      }
      return undefined;
    },
  });
  t.after(() => runtime.cleanup());
  await runtime.emit("iina.window-loaded");
  const internalState = runtime.evaluate("state");
  internalState.clips = [{
    id: 1,
    name: "Collision",
    sourceFilePath: runtime.sourcePath,
    sourceFileDisplayName: "source",
    inPoint: 1,
    outPoint: 2,
    duration: 1,
    exportStatus: "pending",
    outputPath: "",
  }];

  const state = await runtime.callRpc("$exportAll");
  assert.equal(state.clips[0].exportStatus, "failed");
  assert.equal(state.lastExportedFile, "");
  assert.deepEqual(runtime.revealedPaths, []);
  assert.match(state.lastError, /refused to overwrite/i);
  assert.equal(runtime.execCalls.some((call) => call.executable === "/bin/rm"), false);
});

test("a failed FFmpeg process removes only its incomplete output", async (t) => {
  let attemptedOutput = "";
  const runtime = createRuntime({
    async exec(call, controls) {
      if (call.executable.endsWith("/ffmpeg") && call.args[0] !== "-version") {
        attemptedOutput = call.args.at(-1);
        controls.existingFiles.add(attemptedOutput);
        return { status: 1, stdout: "", stderr: "encoding failed" };
      }
      return undefined;
    },
  });
  t.after(() => runtime.cleanup());
  await runtime.emit("iina.window-loaded");
  const internalState = runtime.evaluate("state");
  internalState.clips = [{
    id: 1,
    name: "Partial",
    sourceFilePath: runtime.sourcePath,
    sourceFileDisplayName: "source",
    inPoint: 1,
    outPoint: 2,
    duration: 1,
    exportStatus: "pending",
    outputPath: "",
  }];

  const state = await runtime.callRpc("$exportAll");
  assert.equal(state.clips[0].exportStatus, "failed");
  assert.ok(attemptedOutput);
  assert.equal(runtime.existingFiles.has(attemptedOutput), false);
  assert.equal(runtime.execCalls.filter((call) => call.executable === "/bin/rm").length, 1);
});

test("title copy gesture accepts only a quick unmoved primary pointer", () => {
  const result = sidebarEvaluate(`(() => ({
    quick: titleCopyGestureIsQuick(
      { pointerId: 7, startedAt: 100, moved: false },
      { pointerId: 7, timeStamp: 290 }
    ),
    held: titleCopyGestureIsQuick(
      { pointerId: 7, startedAt: 100, moved: false },
      { pointerId: 7, timeStamp: 321 }
    ),
    moved: titleCopyGestureIsQuick(
      { pointerId: 7, startedAt: 100, moved: true },
      { pointerId: 7, timeStamp: 180 }
    ),
    otherPointer: titleCopyGestureIsQuick(
      { pointerId: 7, startedAt: 100, moved: false },
      { pointerId: 8, timeStamp: 180 }
    )
  }))()`);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    quick: true,
    held: false,
    moved: false,
    otherPointer: false,
  });
});

test("reverse time input parses seconds, minutes, and hours from left to right", () => {
  const parsed = JSON.parse(sidebarEvaluate(`JSON.stringify([
    "", "5", "15", "154", "1540", "15402", "154030"
  ].map((digits) => parseReverseTimeDigits(digits)))`));
  assert.deepEqual(parsed, [
    null,
    { seconds: 5, minutes: 0, hours: 0, totalSeconds: 5 },
    { seconds: 15, minutes: 0, hours: 0, totalSeconds: 15 },
    { seconds: 15, minutes: 4, hours: 0, totalSeconds: 255 },
    { seconds: 15, minutes: 40, hours: 0, totalSeconds: 2415 },
    { seconds: 15, minutes: 40, hours: 2, totalSeconds: 9615 },
    { seconds: 15, minutes: 40, hours: 30, totalSeconds: 110415 },
  ]);
  assert.equal(sidebarEvaluate('parseReverseTimeDigits("90").totalSeconds'), 90);
  assert.equal(sidebarEvaluate('parseReverseTimeDigits("6099").totalSeconds'), 6000);
});

test("reverse time input enforces six digits, lays out stable slots, and removes one digit", () => {
  assert.equal(sidebarEvaluate('sanitizeReverseTimeDigits("1a2:3s4m5h678")'), "123456");
  assert.equal(sidebarEvaluate('removeProgressiveTimecodeDigit("154030")'), "15403");
  assert.equal(sidebarEvaluate('removeProgressiveTimecodeDigit("15")'), "1");
  const slots = JSON.parse(sidebarEvaluate('JSON.stringify([getTimeInputSlots("154"), getTimeInputSlots("154030")])'));
  assert.deepEqual(slots, [
    { seconds: ["1", "5"], minutes: ["4", null], hours: [null, null] },
    { seconds: ["1", "5"], minutes: ["4", "0"], hours: ["3", "0"] },
  ]);
  assert.deepEqual(
    Array.from(sidebarEvaluate('["", "1", "15", "154", "1540", "15402", "154030"].map(timecodeCaretColumn)')),
    [1, 2, 4, 5, 7, 8, 10]
  );
});

test("time input paste preserves standard timecodes and uses reverse order for digit streams", () => {
  const values = JSON.parse(sidebarEvaluate(`JSON.stringify([
    parsePastedTimeInput("15 40 30", 24),
    parsePastedTimeInput("15s40m30h", 24),
    parsePastedTimeInput("15:40:30", 24),
    parsePastedTimeInput("00:00:01:12", 24)
  ])`));
  assert.deepEqual(values, [
    { rawDigits: "154030", totalSeconds: null },
    { rawDigits: "154030", totalSeconds: null },
    { rawDigits: "304015", totalSeconds: 56430 },
    { rawDigits: "1", totalSeconds: 1.5 },
  ]);
});

test("timecode suffix timers are independent, persist for partial groups, and clean up", () => {
  const result = JSON.parse(sidebarEvaluate(`JSON.stringify((() => {
    const pending = new Map();
    const cleared = [];
    let nextTimer = 1;
    window.setTimeout = (callback, delay) => {
      const id = nextTimer++;
      pending.set(id, { callback, delay });
      return id;
    };
    window.clearTimeout = (id) => {
      cleared.push(id);
      pending.delete(id);
    };
    const suffixNodes = new Map(TIMECODE_SUFFIX_DEFINITIONS.map(({ key }) => [key, {
      visible: false,
      classList: { toggle(name, value) { this.owner.visible = value; }, owner: null }
    }]));
    suffixNodes.forEach((node) => { node.classList.owner = node; });
    const edit = {
      rawDigits: "154030",
      finished: false,
      slotsRoot: {},
      suffixNodes,
      suffixStates: createTimecodeSuffixStates()
    };
    activeTimecodeEdit = edit;
    updateTimecodeSuffixAnimations(edit);
    const appearanceDelays = Array.from(pending.values()).map(({ delay }) => delay);
    Array.from(pending.values()).forEach(({ callback }) => callback());
    pending.clear();
    edit.rawDigits = "15403";
    updateTimecodeSuffixAnimations(edit);
    const hourVisibleAfterOneDelete = edit.suffixStates.hours.visible;
    edit.rawDigits = "1540";
    updateTimecodeSuffixAnimations(edit);
    const disappearTimer = edit.suffixStates.hours.disappearTimer;
    edit.rawDigits = "15403";
    updateTimecodeSuffixAnimations(edit);
    const disappearanceCancelled = edit.suffixStates.hours.disappearTimer === null;
    cleanupTimecodeSuffixTimers(edit);
    return {
      appearanceDelays,
      allVisible: TIMECODE_SUFFIX_DEFINITIONS.every(({ key }) => edit.suffixStates[key].visible),
      hourVisibleAfterOneDelete,
      disappearTimerWasSet: disappearTimer !== null,
      disappearanceCancelled,
      timersCleared: TIMECODE_SUFFIX_DEFINITIONS.every(({ key }) =>
        edit.suffixStates[key].appearTimer === null && edit.suffixStates[key].disappearTimer === null)
    };
  })())`));
  assert.deepEqual(result.appearanceDelays, [500, 500, 500]);
  assert.equal(result.allVisible, true);
  assert.equal(result.hourVisibleAfterOneDelete, true);
  assert.equal(result.disappearTimerWasSet, true);
  assert.equal(result.disappearanceCancelled, true);
  assert.equal(result.timersCleared, true);
});

test("reverse time validation keeps duration and In/Out constraints", () => {
  const result = JSON.parse(sidebarEvaluate(`JSON.stringify((() => {
    latestState = { durationSeconds: 100.75, inPoint: 20.25, outPoint: 80.75 };
    return {
      duration: validatedTimecodeEditSeconds("1540"),
      pastedFrames: validatedTimecodeEditSeconds("1", 1.5),
      position: manualTimecodeWholeSeconds("position", "", 100.75),
      inPoint: manualTimecodeWholeSeconds("mark", "in", 90),
      outPoint: manualTimecodeWholeSeconds("mark", "out", 10)
    };
  })())`));
  assert.deepEqual(result, { duration: 100, pastedFrames: 1, position: 100, inPoint: 80, outPoint: 21 });
  assert.equal(sidebarEvaluate('formatFrameTimecode(validatedTimecodeEditSeconds("1540"), 24).endsWith("00f")'), true);
});

test("fractional-FPS ranges and compact durations remain stable", () => {
  const fractionalFpsRange = sidebarEvaluate(`(() => {
    const inPoint = 523 / 23.976;
    const outPoint = ((22 * 24) + 19) / 24;
    return [
      formatFrameTimecode(inPoint, 24),
      formatFrameTimecode(outPoint, 24),
      formatFrameRangeDuration(outPoint - inPoint, 24),
      formatFrameRangeDuration(displayedRangeSeconds(inPoint, outPoint, 24), 24)
    ];
  })()`);
  assert.deepEqual(Array.from(fractionalFpsRange), ["21s 19f", "22s 19f", "23f", "1s"]);
  assert.equal(sidebarEvaluate("formatFrameRangeDuration(18 / 24, 24)"), "18f");
  assert.equal(sidebarEvaluate("formatFrameRangeDuration((15 * 60) + (14 / 24), 24)"), "15m 14f");
});
