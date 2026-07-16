"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function matches(source, expression, group = 1) {
  return Array.from(source.matchAll(expression), (match) => match[group]);
}

function htmlIds(source) {
  return matches(source, /\bid=["']([^"']+)["']/g);
}

test("JavaScript and every inline HTML script compile", () => {
  for (const relativePath of ["main.js", "sidebar.js"]) {
    assert.doesNotThrow(() => new vm.Script(read(relativePath), { filename: relativePath }));
  }

  for (const relativePath of ["sidebar.html", "preferences.html", "tests/ui-harness.html"]) {
    const source = read(relativePath);
    const inlineScripts = matches(source, /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi);
    inlineScripts.forEach((script, index) => {
      assert.doesNotThrow(
        () => new vm.Script(script, { filename: `${relativePath}#inline-${index + 1}` }),
        `${relativePath} inline script ${index + 1} should compile`
      );
    });
  }
});

test("HTML IDs, labels, buttons, script references, and local images are valid", () => {
  for (const relativePath of ["sidebar.html", "preferences.html"]) {
    const source = read(relativePath);
    const ids = htmlIds(source);
    assert.equal(new Set(ids).size, ids.length, `${relativePath} contains duplicate IDs`);

    for (const target of matches(source, /<label\b[^>]*\bfor=["']([^"']+)["']/gi)) {
      assert.ok(ids.includes(target), `${relativePath} label points to missing #${target}`);
    }

    for (const button of source.match(/<button\b[^>]*>/gi) || []) {
      assert.match(button, /\btype=["']button["']/i, `${relativePath} button needs type=button`);
    }

    const localReferences = [
      ...matches(source, /<script\b[^>]*\bsrc=["']([^"']+)["']/gi),
      ...matches(source, /<img\b[^>]*\bsrc=["']([^"']+)["']/gi),
    ].filter((value) => !/^(?:https?:|data:)/i.test(value));
    for (const reference of localReferences) {
      assert.ok(fs.existsSync(path.join(ROOT, reference)), `${relativePath} references missing ${reference}`);
    }
  }
});

test("literal DOM lookups resolve to elements in their document", () => {
  const sidebarHtml = read("sidebar.html");
  const sidebarJs = read("sidebar.js");
  const sidebarIds = new Set(htmlIds(sidebarHtml));
  const sidebarLookups = new Set(matches(sidebarJs, /\$\(["']([^"']+)["']\)/g));
  for (const id of sidebarLookups) {
    assert.ok(sidebarIds.has(id), `sidebar.js queries missing #${id}`);
  }

  const preferencesHtml = read("preferences.html");
  const preferenceIds = new Set(htmlIds(preferencesHtml));
  const preferenceLookups = new Set(matches(preferencesHtml, /getElementById\(["']([^"']+)["']\)/g));
  for (const id of preferenceLookups) {
    assert.ok(preferenceIds.has(id), `preferences.html queries missing #${id}`);
  }
});

test("manifest defaults, preferences controls, and reset defaults stay aligned", () => {
  const manifest = JSON.parse(read("Info.json"));
  const preferencesHtml = read("preferences.html");
  const resetObject = preferencesHtml.match(/const DEFAULT_SETTINGS = Object\.freeze\((\{[\s\S]*?\})\);/);
  assert.ok(resetObject, "preferences reset defaults should be discoverable");
  const resetDefaults = vm.runInNewContext(
    `const DEFAULT_OUTPUT_FOLDER = ${JSON.stringify(manifest.preferenceDefaults.outputFolder)}; (${resetObject[1]})`
  );
  assert.deepEqual(JSON.parse(JSON.stringify(resetDefaults)), manifest.preferenceDefaults);

  const controlKeys = new Set(matches(preferencesHtml, /\bdata-pref-key=["']([^"']+)["']/g));
  for (const key of controlKeys) {
    assert.ok(Object.hasOwn(manifest.preferenceDefaults, key), `control ${key} lacks a manifest default`);
  }
});

test("general plugin behavior settings share one description-free group", () => {
  const preferencesHtml = read("preferences.html");
  const behaviorSection = preferencesHtml.match(
    /<section class="pref-section settings-section check">\s*<h2 class="settings-section-title">Plugin behavior<\/h2>([\s\S]*?)<\/section>/
  );
  assert.ok(behaviorSection, "Plugin behavior section should exist");
  assert.match(behaviorSection[1], /data-pref-key="addNewClipsToTop"/);
  assert.match(behaviorSection[1], /data-pref-key="revealAfterExport"/);
  assert.match(behaviorSection[1], /data-pref-key="deleteClipsAfterExport"/);
  assert.doesNotMatch(preferencesHtml, /Places newly created clips/);
  assert.doesNotMatch(preferencesHtml, />Clips<\/h2>/);
  assert.doesNotMatch(preferencesHtml, />Export behavior<\/h2>/);
});

test("sidebar calls exactly the RPC methods registered by the main entry", () => {
  const mainRpc = new Set(matches(read("main.js"), /rpc\.(\$[A-Za-z0-9_]+)\s*=/g));
  const sidebarRpc = new Set(matches(read("sidebar.js"), /rpc\.(\$[A-Za-z0-9_]+)/g));
  assert.deepEqual(Array.from(mainRpc).sort(), Array.from(sidebarRpc).sort());
});

test("export buttons expose a custom Show Containing Folder context menu", () => {
  const sidebarHtml = read("sidebar.html");
  const sidebarJs = read("sidebar.js");
  const exportAll = sidebarHtml.match(/<button id="exportAllButton"[^>]*>/);
  const exportSelected = sidebarHtml.match(/<button id="exportSelectedButton"[^>]*>/);
  assert.ok(exportAll && exportSelected);
  assert.match(exportAll[0], /aria-haspopup="menu"/);
  assert.match(exportSelected[0], /aria-haspopup="menu"/);
  assert.match(sidebarHtml, /id="exportContextMenu"[^>]*role="menu"/);
  assert.match(sidebarHtml, /id="showExportFolderMenuItem"[^>]*role="menuitem"[\s\S]*?Show Containing Folder/);
  assert.match(sidebarJs, /trigger\.addEventListener\("contextmenu"[\s\S]*?event\.preventDefault\(\)/);
  assert.match(sidebarJs, /rpc\.\$showExportFolder\(\)/);
  assert.match(read("main.js"), /utils\.exec\("\/usr\/bin\/open", \[folder\], folder\)/);
});

test("release sources contain no stale package references or private user paths", () => {
  const releaseFiles = [
    "Info.json",
    "main.js",
    "sidebar.html",
    "sidebar.js",
    "preferences.html",
    "README.md",
    "CHANGELOG.md",
    "LICENSE",
    "scripts/package.sh",
  ];
  const combined = releaseFiles.map(read).join("\n");
  assert.doesNotMatch(combined, /sidebar\.css|TODO\.md|PRE_RELEASE_AUDIT\.md|\/Users\//);
  assert.doesNotMatch(combined, /autoNameClips|nameTemplate|fastCopy|exportModeMigrated/);
  assert.doesNotMatch(combined, /glass-range|TODO\.md|RELEASE_NOTES\.md/);
  assert.doesNotMatch(combined, /\bDEBUG\b|console\.(?:log|debug|info)\s*\(/);
});

test("manifest, changelog, and artifact filename use the same release version", () => {
  const manifest = JSON.parse(read("Info.json"));
  assert.match(read("CHANGELOG.md"), new RegExp(`^## ${manifest.version.replace(/\./g, "\\.")}$`, "m"));
  assert.match(read("scripts/package.sh"), /VERSION="\$\(node -e/);
  assert.match(read("scripts/package.sh"), /ARCHIVE="\$BUILD_DIR\/ClipMaker-\$VERSION\.iinaplgz"/);
  assert.equal(Number.isInteger(manifest.ghVersion), true);
  assert.ok(manifest.ghVersion > 0);
});

test("public release includes the MIT license and bundled speed icons", () => {
  assert.match(read("LICENSE"), /^MIT License$/m);
  assert.match(read("README.md"), /\[MIT License\]\(LICENSE\)/);

  const preferencesHtml = read("preferences.html");
  for (const asset of ["tortoise.svg", "hare.svg"]) {
    assert.match(preferencesHtml, new RegExp(`assets/${asset.replace(".", "\\.")}`));
    assert.ok(fs.existsSync(path.join(ROOT, "assets", asset)));
    assert.match(read(path.join("assets", asset)), /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  }
  assert.doesNotMatch(preferencesHtml, /(?:tortoise|hare)-fill\.png/);
  assert.equal(fs.existsSync(path.join(ROOT, "assets/tortoise-fill.png")), false);
  assert.equal(fs.existsSync(path.join(ROOT, "assets/hare-fill.png")), false);
});

test("clip sorting controls expose the required menu, direction icons, and accessibility semantics", () => {
  const sidebarHtml = read("sidebar.html");
  assert.match(sidebarHtml, /id="clipSortButton"[^>]*aria-label="Sort clips"[^>]*aria-haspopup="menu"/);
  assert.match(sidebarHtml, /id="clipSortMenu"[^>]*role="menu"/);
  const labels = matches(sidebarHtml, /class="clip-sort-menu-item"[\s\S]*?<span>([^<]+)<\/span><\/button>/g);
  assert.deepEqual(labels, [
    "Custom",
    "Creation Order",
    "Name",
    "Duration",
    "Timeline Position (In)",
    "Timeline Position (Out)",
  ]);
  assert.equal((sidebarHtml.match(/role="menuitemradio"/g) || []).length, 6);
  assert.match(sidebarHtml, /data-sort-mode="custom" aria-checked="false" tabindex="-1"/);
  assert.match(sidebarHtml, /data-sort-mode="creation" aria-checked="true" tabindex="0"/);
  assert.match(sidebarHtml, /assets\/sort-ascending\.svg/);
  assert.match(sidebarHtml, /assets\/sort-descending\.svg/);
  assert.match(read("sidebar.js"), /button\.addEventListener\("contextmenu", handleClipSortContextMenu\)/);
  assert.match(read("sidebar.js"), /\.clip-position-slot:not\(\.clip-drag-placeholder\)/);
  assert.match(sidebarHtml, /clip-sort-icon-glyph-ascending[^>]*data-approved-asset="assets\/sort-ascending\.svg"[\s\S]*?<svg viewBox="0 0 24 24"[\s\S]*?M5 19V5/);
  assert.match(sidebarHtml, /clip-sort-icon-glyph-descending[^>]*data-approved-asset="assets\/sort-descending\.svg"[\s\S]*?<svg viewBox="0 0 24 24"[\s\S]*?M5 5v14/);
  assert.match(sidebarHtml, /data-sort-direction="ascending"/);
  assert.match(sidebarHtml, /data-sort-direction="descending"/);
  assert.doesNotMatch(read("sidebar.js"), /button\.title\s*=\s*`Sort clips/);
  for (const asset of ["sort-ascending.svg", "sort-descending.svg"]) {
    const source = read(path.join("assets", asset));
    assert.match(source, /viewBox="0 0 24 24"/);
    assert.match(source, /stroke="currentColor"/);
    assert.ok(fs.existsSync(path.join(ROOT, "assets", asset)));
  }
  assert.equal(fs.existsSync(path.join(ROOT, "assets/arrow-up-arrow-down.png")), false);
  assert.match(sidebarHtml, /\.clip-sort-icon\s*\{[\s\S]*?overflow: hidden;/);
  assert.match(sidebarHtml, /is-changing-to-ascending \.clip-sort-icon-glyph-ascending\s*\{\s*animation: clip-sort-icon-in-from-bottom 170ms/);
  assert.match(sidebarHtml, /is-changing-to-descending \.clip-sort-icon-glyph-descending\s*\{\s*animation: clip-sort-icon-in-from-top 170ms/);
  assert.match(sidebarHtml, /@keyframes clip-sort-icon-out-to-top[\s\S]*?opacity: 0; transform: translateY\(-18px\)/);
  assert.match(sidebarHtml, /@keyframes clip-sort-icon-out-to-bottom[\s\S]*?opacity: 0; transform: translateY\(18px\)/);
  assert.match(read("sidebar.js"), /const CLIP_SORT_ICON_ANIMATION_MS = 170/);
  assert.match(read("sidebar.js"), /previousDirection !== direction/);
});

test("ClipMaker info hint is centered below the info button and cannot retain hover", () => {
  const sidebarHtml = read("sidebar.html");
  const sidebarJs = read("sidebar.js");
  const button = sidebarHtml.match(/<button id="pluginInfoButton"[^>]*>/);
  const hint = sidebarHtml.match(/<div id="pluginInfoPopover"[^>]*>Press Shift<\/div>/);
  assert.ok(button, "info button should exist");
  assert.ok(hint, "Press Shift hint should exist");
  assert.match(button[0], /aria-describedby="pluginInfoPopover"/);
  assert.doesNotMatch(button[0], /aria-expanded|\btitle=/);
  assert.match(hint[0], /role="tooltip"/);
  assert.match(sidebarHtml, /\.plugin-info-popover\s*\{[^}]*right: 7\.5px;[^}]*pointer-events: none;[^}]*transform: translate\(50%, -6px\) scale\(0\.96\);/);
  assert.match(sidebarHtml, /\.plugin-title-group\.is-info-hint-visible \.plugin-info-popover\s*\{[^}]*transform: translate\(50%, 0\) scale\(1\);/);
  assert.match(sidebarJs, /button\.addEventListener\("mouseenter", \(\) => \{\s*setHeaderInfoHintVisible\(true\);/);
  assert.match(sidebarJs, /button\.addEventListener\("mouseleave", \(\) => \{\s*setHeaderInfoHintVisible\(false\);\s*setHeaderInfoVisible\(false\);/);
  assert.doesNotMatch(sidebarJs, /headerInfoPopoverOpen|toggleHeaderInfoPopover|closeHeaderInfoPopover/);
});

test("Deselect morphs as one accessible control with the lightweight cursor-click vector", () => {
  const sidebarHtml = read("sidebar.html");
  const button = sidebarHtml.match(/<button id="clearSelectionButton"[\s\S]*?<\/button>/);
  assert.ok(button, "Deselect button should exist");
  assert.equal((sidebarHtml.match(/id="clearSelectionButton"/g) || []).length, 1);
  assert.match(button[0], /aria-label="Deselect"/);
  assert.match(button[0], /class="selection-clear-content-viewport"/);
  assert.match(button[0], /class="selection-clear-label">Deselect<\/span>/);
  assert.match(button[0], /class="selection-clear-icon"/);
  assert.doesNotMatch(button[0], /\btitle=/);

  assert.match(sidebarHtml, /\.selection-actions\.is-search-expanded/);
  assert.match(sidebarHtml, /--deselect-content-travel: 28px/);
  assert.match(sidebarHtml, /--toolbar-actions-duration: 170ms/);
  assert.match(sidebarHtml, /--toolbar-actions-easing: cubic-bezier\(0\.22, 1, 0\.36, 1\)/);
  assert.match(sidebarHtml, /--deselect-morph-duration: var\(--toolbar-actions-duration\)/);
  assert.match(sidebarHtml, /--deselect-content-duration: var\(--toolbar-actions-duration\)/);
  assert.match(sidebarHtml, /assets\/cursorarrow-click\.svg/);
  assert.match(button[0], /data-approved-asset="assets\/cursorarrow-click\.svg"[\s\S]*?<svg viewBox="0 0 24 24"/);
  assert.match(button[0], /stroke-width="1\.7"/);
  assert.match(sidebarHtml, /\.selection-clear-icon\s*\{[\s\S]*?width: 14px;[\s\S]*?height: 14px;/);
  assert.doesNotMatch(sidebarHtml, /(?:-webkit-)?mask:\s*url\("assets\/(?:cursorarrow-click|sort-(?:ascending|descending))\.svg"/);
  assert.match(sidebarHtml, /\.selection-clear-pill\s*\{[\s\S]*?width: 69px;[\s\S]*?min-width: 69px;[\s\S]*?flex: 0 0 auto;/);
  assert.match(sidebarHtml, /\.selection-actions\.is-search-expanded \.selection-clear-pill\s*\{\s*width: 24px;\s*min-width: 24px;/);
  assert.match(sidebarHtml, /transition:[^;]*width var\(--deselect-morph-duration\)[^;]*min-width var\(--deselect-morph-duration\)/);
  assert.doesNotMatch(sidebarHtml, /\.selection-clear-pill\s*\{[\s\S]*?transition:[^;]*flex-basis/);
  assert.match(sidebarHtml, /prefers-reduced-motion: reduce[\s\S]*?--toolbar-actions-duration: 0ms/);
  assert.match(read("sidebar.js"), /const TOOLBAR_EXPANSION_MS = 170/);
  assert.match(read("sidebar.js"), /const SELECTION_ACTIONS_ENTRY_MS = 420/);
  assert.match(read("sidebar.js"), /const SELECTION_ACTIONS_EXIT_MS = 280/);
  assert.match(read("sidebar.js"), /const SELECTION_SUMMARY_ENTRY_MS = 420/);
  assert.match(read("sidebar.js"), /const SELECTION_SUMMARY_EXIT_MS = 280/);
  assert.match(read("sidebar.js"), /activeAnimationTarget === shouldShow/);
  assert.match(read("sidebar.js"), /actions\.classList\.add\("is-hidden"\);\s*actions\.offsetWidth;\s*\}/);
  assert.match(sidebarHtml, /\.selection-actions\.is-entering\s*\{[\s\S]*?--trash-slide-duration: 200ms;[\s\S]*?--trash-slide-delay: 220ms;[\s\S]*?--deselect-fade-duration: 220ms;[\s\S]*?--deselect-fade-delay: 0ms;/);
  assert.match(sidebarHtml, /\.selection-actions\.is-exiting\s*\{[\s\S]*?--trash-slide-duration: 150ms;[\s\S]*?--trash-slide-delay: 0ms;[\s\S]*?--deselect-fade-duration: 130ms;[\s\S]*?--deselect-fade-delay: 150ms;/);
  assert.match(sidebarHtml, /\.selection-actions\.is-exiting \.selection-delete-button\s*\{\s*opacity: 0;\s*transform: translateX/);
  assert.doesNotMatch(sidebarHtml, /\.selection-delete-button:disabled\s*\{[^}]*opacity: 1/);
  assert.match(sidebarHtml, /\.selection-clear-pill\s*\{[\s\S]*?opacity: 0;[\s\S]*?transition: opacity var\(--deselect-fade-duration\)/);
  assert.match(sidebarHtml, /\.selection-actions\.is-exiting \.selection-clear-pill\s*\{\s*opacity: 0;/);
  assert.doesNotMatch(sidebarHtml, /\.selection-actions\.is-exiting \.selection-clear-occluder\s*\{[^}]*opacity:/);
  assert.doesNotMatch(sidebarHtml, /selection-clear-occluder-mask/);
  assert.doesNotMatch(sidebarHtml, /\.selection-delete-clip\s*\{[^}]*clip-path:/);
  assert.match(sidebarHtml, /\.selection-actions\.is-entering \.selection-delete-clip,\s*\.selection-actions\.is-exiting \.selection-delete-clip\s*\{\s*overflow: hidden;/);
  assert.match(sidebarHtml, /\.clips-selection-summary\.is-hiding,[\s\S]*?--clips-selection-summary-feather: 12px;[\s\S]*?-webkit-mask-image: linear-gradient/);
  assert.match(sidebarHtml, /@keyframes clips-selection-summary-show[\s\S]*?-webkit-mask-position: calc\(0px - var\(--clips-selection-summary-width\)\)[\s\S]*?-webkit-mask-position: 0 0/);
  assert.doesNotMatch(sidebarHtml, /@keyframes clips-selection-summary-(?:show|hide)[\s\S]{0,500}?transform: translateX/);

  const symbol = read("assets/cursorarrow-click.svg");
  assert.match(symbol, /viewBox="0 0 24 24"/);
  assert.match(symbol, /stroke="currentColor"/);
  assert.match(symbol, /stroke-width="1\.7"/);
  assert.match(symbol, /stroke-linecap="round"/);
  assert.match(symbol, /stroke-linejoin="round"/);
  assert.doesNotMatch(symbol, /opacity|filter|transform|fill="currentColor"/);
});

test("delete confirmations stay anchored, dismiss after threshold scroll, and expose Shift power mode", () => {
  const sidebarHtml = read("sidebar.html");
  const sidebarJs = read("sidebar.js");
  assert.match(sidebarHtml, /@media \(max-width: 350px\)[\s\S]*?\.clips-selection-label-slot\s*\{\s*display: none/);
  assert.match(sidebarJs, /const SELECTION_ACTIONS_SEARCH_RESERVED_WIDTH_PX = 104/);
  assert.match(sidebarHtml, /id="clearListConfirm"[\s\S]*?Delete all clips/);
  assert.match(sidebarHtml, /@keyframes shift-delete-power-pulse[\s\S]*?scale\(1\.16\)/);
  assert.match(sidebarJs, /const DELETE_CONFIRM_SCROLL_DISMISS_RATIO = 1 \/ 3/);
  assert.match(sidebarJs, /const CLEAR_LIST_CONFIRM_SCROLL_DISMISS_RATIO = 0\.2/);
  assert.match(sidebarJs, /const CLEAR_LIST_CONFIRM_MIN_SCROLL_PX = 24/);
  assert.match(sidebarJs, /const CLEAR_LIST_TRIGGER_VISIBLE_DISMISS_RATIO = 0\.4/);
  assert.match(sidebarJs, /document\.addEventListener\("scroll", handleDeleteConfirmationScroll, true\)/);
  assert.match(sidebarJs, /scheduleActiveDeleteConfirmationPosition\(\)/);
  assert.match(sidebarJs, /elements\.overlay\.contains\(event\.target\)/);
  assert.match(sidebarJs, /elements\.overlay\.addEventListener\("focusout"/);
  assert.match(sidebarJs, /preferredPlacement: "below"[\s\S]*?forcePlacement: false/);
  assert.match(sidebarJs, /preferredPlacement: "above"[\s\S]*?forcePlacement: true/);
  assert.match(sidebarJs, /shouldDeleteWithoutPrompt\(event\)/);
  assert.match(sidebarJs, /is-shift-delete-armed/);
  assert.match(sidebarHtml, /\.selection-delete-button\.is-shift-delete-armed:hover:not\(:disabled\)/);
  assert.doesNotMatch(sidebarHtml, /\.selection-delete-button\.is-shift-delete-armed(?:\.is-hovering|:focus-visible)/);
});

test("source title uses quick-click copy without breaking native text selection", () => {
  const sidebarHtml = read("sidebar.html");
  const sidebarJs = read("sidebar.js");
  const pointerDownBody = sidebarJs.match(/function handleTitleCopyPointerDown\([^)]*\) \{([\s\S]*?)\n\}/);

  assert.ok(pointerDownBody, "title pointerdown handler should be discoverable");
  assert.doesNotMatch(pointerDownBody[1], /preventDefault|stopPropagation/);
  assert.doesNotMatch(sidebarJs, /handleTitleTripleClick/);
  assert.match(sidebarJs, /const TITLE_COPY_QUICK_CLICK_MAX_MS = 220/);
  assert.match(sidebarJs, /const TITLE_COPY_SINGLE_CLICK_DELAY_MS = 320/);
  assert.match(sidebarJs, /const TITLE_COPY_DRAG_THRESHOLD_PX = 4/);
  assert.match(sidebarJs, /source\.addEventListener\("dblclick", cancelTitleCopyGesture\)/);
  assert.match(sidebarJs, /document\.addEventListener\("selectionchange", handleTitleSelectionChange\)/);
  assert.match(sidebarJs, /window\.addEventListener\("pointerup", handleTitleCopyPointerEnd\)/);
  assert.match(sidebarHtml, /\.video-title-viewport\s*\{[\s\S]*?user-select: text;[\s\S]*?-webkit-user-select: text;/);
  assert.match(sidebarHtml, /\.video-title-bubble-text\s*\{[\s\S]*?user-select: text;[\s\S]*?-webkit-user-select: text;/);
  assert.match(sidebarHtml, /\.title-copy-toast\s*\{[\s\S]*?top: calc\(100% \+ 7px\);[\s\S]*?background: rgba\(5, 5, 7, 0\.97\);/);
  assert.match(sidebarHtml, /@keyframes title-copy-toast-emerge/);
  assert.doesNotMatch(sidebarHtml, /title-copy-toast-ripple|\.title-copy-toast::before/);
});

test("timecode readouts do not create native hover tooltips", () => {
  const sidebarJs = read("sidebar.js");
  for (const name of ["setTimeElement", "setRangeElement", "setPositionDisplay"]) {
    const body = sidebarJs.match(new RegExp(`function ${name}\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}`));
    assert.ok(body, `${name} should be discoverable`);
    assert.doesNotMatch(body[1], /\belement\.title\s*=/, `${name} should not assign a native title tooltip`);
    assert.match(body[1], /removeAttribute\("title"\)/, `${name} should clear stale title attributes`);
  }
});

test("manual time input uses fixed transparent slots, reserved suffixes, and reduced motion", () => {
  const sidebarHtml = read("sidebar.html");
  const sidebarJs = read("sidebar.js");
  assert.match(sidebarHtml, /\.timecode-edit-slots\s*\{[\s\S]*?display: inline-grid;[\s\S]*?grid-template-columns: 1ch 1ch 1\.3ch 1ch 1ch 1\.6ch 1ch 1ch 1\.3ch 0;[\s\S]*?width: 10\.2ch;/);
  assert.match(sidebarHtml, /\.value\s*\{[\s\S]*?justify-self: end;/);
  assert.doesNotMatch(sidebarHtml, /\.value\s*\{[\s\S]*?width: 17ch;/);
  assert.match(sidebarHtml, /\.timecode-edit-suffix\s*\{[\s\S]*?color: #b8b8bd;[\s\S]*?opacity: 0;[\s\S]*?var\(--timecode-suffix-fade-out-duration\)/);
  assert.match(sidebarHtml, /\.timecode-edit-suffix\.is-visible\s*\{[\s\S]*?opacity: 1;[\s\S]*?var\(--timecode-suffix-fade-duration\)/);
  assert.match(sidebarHtml, /\.timecode-edit-caret\s*\{[\s\S]*?grid-column: var\(--timecode-caret-column, 1\);[\s\S]*?animation: timecode-edit-caret-blink/);
  assert.match(sidebarHtml, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.timecode-edit-suffix/);
  assert.match(sidebarJs, /const TIMECODE_EDIT_MAX_DIGITS = 6;/);
  assert.match(sidebarJs, /const TIMECODE_SUFFIX_APPEAR_DELAY_MS = 500;/);
  assert.match(sidebarJs, /const TIMECODE_SUFFIX_DISAPPEAR_DELAY_MS = 1400;/);
  assert.match(sidebarJs, /cleanupTimecodeSuffixTimers\(edit\);[\s\S]*?classList\.add\("is-exiting"\)/);
  assert.match(sidebarJs, /input\.setAttribute\("aria-valuetext", describeReverseTimeDigits\(digits\)\)/);
  assert.match(sidebarJs, /digit\.style\.gridColumn = String\(firstGridColumn \+ offset\)/);
  assert.match(sidebarJs, /manualTimecodeWholeSeconds\(edit\.kind, edit\.markName, requested\)/);
  assert.doesNotMatch(sidebarHtml, /\.timecode-value\.is-editable:hover[\s\S]*?background: rgba\(56, 189, 248/);
  assert.doesNotMatch(sidebarHtml, /\.mark-value\.is-editable:hover[\s\S]*?background: rgba\(56, 189, 248/);
  assert.doesNotMatch(sidebarJs, /timecode-edit-separator|seconds-placeholder|frames-placeholder/);
});
