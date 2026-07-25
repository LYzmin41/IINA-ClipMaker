# ClipMaker for IINA

ClipMaker is an open-source IINA plugin for marking multiple In/Out ranges in a local video and exporting them as separate clips with FFmpeg. It keeps the complete mark, preview, organize, and export workflow inside IINA.

## Features

- Capture In and Out points from the current playback position.
- Edit Position, In, and Out from the keyboard, or adjust marks by scrolling and dragging.
- Preview marks and saved clips without leaving the sidebar.
- Rename, select, search, sort, delete, and manually reorder clips.
- Export selected clips or the complete visible list in its displayed order.
- Choose fast stream copy or precise H.264/AAC re-encoding.
- Keep the source container or export to MP4, MOV, or MKV.
- Use a fixed output folder or choose a destination for each export batch.
- Configure shortcuts, gesture direction, gesture sensitivity, and insertion order.
- Avoid overwriting existing files by assigning a numeric suffix automatically.

Clip lists are held in memory for the current player and are cleared when the media file closes or changes.

## Requirements

- macOS
- IINA 1.4.0 or newer with JavaScript plugin support
- FFmpeg-full

ClipMaker checks for the official Homebrew `ffmpeg-full` formula when its sidebar opens. If it is missing, the sidebar displays a blocking setup screen with an automatic installer.

The equivalent manual command is:

```sh
brew install ffmpeg-full
```

If Homebrew is already installed, ClipMaker launches its executable directly with `install ffmpeg-full`. If Homebrew is not installed, ClipMaker opens the official interactive Homebrew installer in Terminal and then installs FFmpeg-full. Complete the visible Terminal prompts, return to ClipMaker, and choose **Check Installation**.

After a successful installation, quit and reopen IINA so ClipMaker can load the new executable.

Managed or nonstandard systems can expand **FFmpeg-full Setup Options…** and provide an installation directory. ClipMaker prepares an isolated package-manager prefix in an empty custom directory and installs FFmpeg-full there. If the directory already contains a compatible managed prefix, ClipMaker reuses it. An existing FFmpeg-full installation can be selected by folder or entered as an executable path. ClipMaker detects the standard Apple Silicon and Intel keg-only paths automatically:

```text
/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg
/usr/local/opt/ffmpeg-full/bin/ffmpeg
```

## Installation

### GitHub release

Download `ClipMaker-1.0.0.iinaplgz` from the latest release and open it with IINA.

### Install from GitHub

In IINA's plugin manager, choose **Install from GitHub** and enter:

```text
LYzmin41/IINA-ClipMaker
```

### Manual installation

Build the project, then install the generated `build/ClipMaker.iinaplugin` directory. Its root must contain `Info.json`; do not add an extra wrapper directory.

## Usage

1. Open a local video in IINA.
2. Open **Plugin → ClipMaker → Show ClipMaker Panel**.
3. Seek to the start of a clip and choose **Set In**.
4. Seek to the end and choose **Set Out**.
5. Choose **Add Clip**.
6. Repeat as needed, then rename, select, search, sort, or reorder the saved clips.
7. Choose **Export Selected** or **Export All**.

Hold Shift while using a mark action in the sidebar to preview from that mark. Previewing Out begins five seconds before the mark and pauses at Out.

## Manual time entry

Click Position, In, or Out to enter a new time using digits only. Input is grouped from left to right as seconds, minutes, then hours:

```text
15     → 15 seconds
1540   → 40 minutes, 15 seconds
154030 → 30 hours, 40 minutes, 15 seconds
```

Press Enter to apply the value or Escape to cancel. Manual entry uses whole seconds, so the committed value displays `00f`. Standard pasted timecodes such as `01:23:45` are also accepted.

The sidebar displays compact frame-based values such as `3s 18f`, `2m 04s 00f`, or `1h 02m 03s 12f`. FPS is rounded to the nearest whole display rate and falls back to 30 fps when unavailable. Clip boundaries remain numeric seconds internally and are passed to FFmpeg without string conversion.

## Clip organization

Search filters the visible list. Sort supports Custom, Creation Order, Name, Duration, Timeline Position (In), and Timeline Position (Out). Selecting an active derived sort option again, Shift-clicking the Sort button, or right-clicking it reverses the direction.

Choosing Custom preserves the complete order from the previous sort and enables manual card reordering. Reversing the sort direction in Custom flips the entire current manual sequence, including every previous drag adjustment. Dragging a card from any other sort switches to Custom automatically without first changing the visible sequence. Dragging remains unavailable while search is filtering the list. Export Selected and Export All follow the current visible order.

## Export modes

**Fast** uses FFmpeg stream copy. It is quick and avoids re-encoding, but cut points may align to nearby keyframes and a forced container may not support every source codec.

**Precise** re-encodes video with H.264 and audio with AAC. It is slower, but normally provides more accurate boundaries. Video keeps its source dimensions and uses quality-based CRF encoding. AAC bitrate adapts to the source bitrate and channel count when `ffprobe` is available, with a safe 192 kbps fallback. MP4 and MOV outputs receive `+faststart`.

ClipMaker never overwrites an existing file. Conflicting names receive `_02`, `_03`, and so on. Unsafe filename characters are replaced automatically.

On first install, exports use the current user's Desktop by default. This can be replaced with any fixed folder, or with a destination prompt for each batch.

## Settings

- Output container and export mode
- Fixed output folder or per-batch destination prompt
- FFmpeg-full executable path and detection status
- Reveal successful exports in Finder
- Delete successfully exported clips from the list
- Delete confirmation behavior
- Timecode scroll and drag direction
- Timecode scroll and drag sensitivity
- New-clip insertion order
- Configurable menu shortcuts

Reset restores the defaults declared in `Info.json`.

## Default shortcuts

| Action | Shortcut |
| --- | --- |
| Show ClipMaker Panel | Cmd+Shift+C |
| Set In | Cmd+Shift+I |
| Set Out | Cmd+Shift+O |
| Add Clip | Cmd+Shift+A |
| Export Selected | Cmd+Shift+E |
| Export All | Cmd+Shift+Option+E |
| Clear Marks | Cmd+Shift+K |
| Clear Clip List | Cmd+Shift+Option+K |

Shortcut fields use IINA/mpv-style values such as `Meta+Shift+I`. ClipMaker detects invalid and duplicate plugin shortcuts, but cannot detect global conflicts with IINA or another plugin.

## Build and test

The project uses plain JavaScript and has no runtime package-manager dependencies. Node.js is required only for tests and packaging metadata.

```sh
node --check main.js
node --check sidebar.js
node --test tests/*.test.js
sh scripts/package.sh
```

Packaging creates:

- `build/ClipMaker.iinaplugin`
- `build/ClipMaker-1.0.0.iinaplgz`

The archive is a ZIP whose root directly contains `Info.json`, as required by IINA.

## Privacy and security

ClipMaker has no telemetry, analytics, account system, or built-in network client. Media paths and clip state remain in the local IINA plugin instance. FFmpeg and an existing Homebrew executable are launched through IINA's process API with an executable and argument array rather than a shell command. If Homebrew is missing, the default setup opens Homebrew's official interactive installer visibly in Terminal. A custom installation directory uses Git to prepare an isolated Homebrew prefix in that folder; Homebrew then performs the FFmpeg-full download.

## Known limitations

- Only local media files are supported; network streams cannot be added or exported.
- Clip lists are not persisted across file changes, player windows, or IINA restarts.
- Fast exports are keyframe-dependent and may start before the requested In point.
- Fast export may fail when a forced container is incompatible with copied source codecs.
- Export progress is tracked per clip; FFmpeg percentage progress is not parsed.
- An already-running FFmpeg process cannot be terminated through the current IINA process API. Late results are ignored if the media changes or IINA closes.
- An already-running Homebrew installation cannot be cancelled through the current IINA process API. If Homebrew is not installed, its interactive Terminal prompts must be completed by the user.
- A custom nonstandard installation prefix may need to build some dependencies locally and can therefore take longer than the default installation.
- Global shortcut conflicts cannot be detected from the preferences webview.

## Reporting issues

Include the IINA version, macOS version, FFmpeg version, source container/codecs, selected export mode/container, and the shortest reproduction steps. Do not attach private media unless you intend to share it.

## Credits

- [IINA](https://iina.io/) for the player and JavaScript plugin platform.
- [FFmpeg](https://ffmpeg.org/) for media processing.

## License

ClipMaker is available under the [MIT License](LICENSE).
