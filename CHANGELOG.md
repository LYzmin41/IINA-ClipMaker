# Changelog

All notable changes to ClipMaker are documented in this file.

## Unreleased

### Added

- Require and automatically detect the Homebrew `ffmpeg-full` formula, including its Apple Silicon and Intel keg-only locations.
- Add a full-sidebar FFmpeg-full setup flow with automatic Homebrew installation, managed-prefix paths, an existing-binary option, Terminal fallback, and a restart-required completion screen.

### Changed

- Delegate the entire sidebar background to IINA's native transparent WebView material so the plugin and tab header always share the same video-derived tone.
- Keep the Clips toolbar fully transparent while clipping scrolling cards at its lower edge, so it inherits IINA's native material without adding its own tint.
- Let the clip search field use the space released by the compact selection controls while preserving narrow-sidebar collision guards.
- Open the existing FFmpeg-full folder picker at an automatically detected installation when possible.
- Update settings and documentation to refer to FFmpeg-full.
- Align radio and numeric preference controls with IINA's native binding rules, and persist programmatic path and sorting changes immediately.
- Remove the unused alert permission and obsolete fallback code while retaining compatibility with IINA 1.4.0 and newer.

### Fixed

- Preserve export and interface behavior while removing nested backdrop filters and transform promotion that softened toolbar text and icons.
- Disable and visibly dim the persistent output-folder field whenever Ask where to save is enabled.

## 1.0.0

Released 2026-07-16.

### Added

- Mark and preview In/Out ranges directly from IINA playback.
- Maintain an in-memory clip list with rename, selection, search, sorting, deletion, and manual reordering.
- Export selected clips or the visible list using fast stream copy or precise H.264/AAC encoding.
- Choose the source container, MP4, MOV, or MKV and configure a fixed or per-batch output folder.
- Edit Position, In, and Out with a keyboard-first seconds → minutes → hours time input.
- Configure shortcuts, timecode gesture direction, gesture sensitivity, and clip insertion order.

### Changed

- Standardized project naming and release metadata for the first public release.
- Replaced speed-control artwork with original project-owned SVG icons.
- Made Precise AAC bitrate adapt to source quality and channel count when `ffprobe` is available.
- Changed the first-install export folder default to the user's Desktop.
- Added an MIT license and deterministic version-aware packaging.
- Improved documentation, accessibility labels, reduced-motion handling, and release tests.

### Fixed

- Preserved stable media state across close, change, and late asynchronous export results.
- Prevented export collisions and removed incomplete outputs after failed exports.
- Kept sorted export order stable without mutating manual clip order.
- Corrected fractional-FPS range display, timecode alignment, manual-input spacing, and hover behavior.
- Ensured manual time entry commits on whole seconds and therefore displays `00f`.

Known limitations are documented in `README.md`.
