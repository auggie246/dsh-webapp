# macOS support window and CI runner choice for DSH Desktop

Research note. Every claim links to a primary, official source.

## Question 1: Is macOS 14 (Sonoma) still supported today?

Yes. Apple's own security releases page lists `macOS Sonoma 14.8.9`, released 6 August 2026, alongside `macOS Sequoia 15.7.9` and `macOS Tahoe 26.6.1` on the same day.
Source: [Apple security releases](https://support.apple.com/en-us/100100).

Apple's pattern is security updates for the three most recent major macOS versions.
Today that window is Tahoe 26, Sequoia 15, and Sonoma 14.

Constraint: this window moves.
When the next major macOS ships, Sonoma leaves the supported set.
The support window is a recommendation for the app's minimum version, not a permanent guarantee.

## Question 2: Does the GitHub Actions `macos-15` runner build Apple Silicon (arm64) artifacts?

Yes. The official `macos-15` image is the `macos-15-arm64` image.
Its own readme reports macOS 15.7 (Sequoia) and arm64-specific paths such as `/usr/local/share/chromedriver-mac-arm64`.
Source: [macos-15-arm64 image readme](https://github.com/actions/runner-images/blob/releases/macos-15-arm64/20260421/images/macos/macos-15-arm64-Readme.md).

For Intel (x64) macOS, GitHub provides the separate `macos-15-intel` label.

Related runner facts from the same official source:

- macOS 26 (Tahoe) runners are generally available in GitHub Actions.
  Source: [runner-images announcements, issue 13739](https://github.com/actions/runner-images/issues/13739).
- The macOS 14 Sonoma runner images began deprecation on 6 July and become fully unsupported on 2 November.
  Source: [runner-images announcements, issue 13518](https://github.com/actions/runner-images/issues/13518).

## Question 3: Does an Electron app built on macOS 15 run on macOS 14 and macOS 26?

Yes, under Apple's documented SDK model.

Apple defines a **deployment target**: the earliest OS version on which the software can run.
Apple defines a **base SDK**: the newest OS features the build may use.
An app built against a newer SDK still runs on every OS version from the deployment target upward, provided symbols newer than the running OS are weakly linked or availability-checked.
Source: [Apple — Configuring a Project for SDK-Based Development](https://developer.apple.com/library/archive/documentation/DeveloperTools/Conceptual/cross_development/Configuring/configuring.html).

For Electron specifically, the prebuilt binaries carry their own floor.
Electron's official platform support is: **macOS (Ventura and up)** with 64-bit Intel and Apple Silicon binaries.
Source: [Electron readme — Platform support](https://github.com/Electron/electron).

Chromium, which Electron tracks, dropped macOS 10.15 in Electron 33.
Source: [Electron breaking changes — Removed: macOS 10.15 support](https://github.com/electron/electron/blob/main/docs/breaking-changes.md).

Combined meaning for DSH Desktop:

- macOS 14 (Sonoma) is above both floors: Apple's current security window and Electron's macOS 11 / Ventura minimum. An Electron app packaged on macOS 15 runs on Sonoma.
- macOS 26 is above the deployment target. Apple's model runs apps on OS versions newer than the deployment target. Binary compatibility forward is the normal case for Electron apps; macOS 26 runners are GA, so CI can verify it directly instead of trusting the model.

Constraint: the build machine's OS is not what decides compatibility.
Electron's prebuilt binary and the deployment target decide it.
Packaging tools (electron-builder) set `LSMinimumSystemVersion` from the Electron binary.

## Constraints

1. Apple Silicon runners build arm64 natively; Intel artifacts need `macos-15-intel` or cross-compilation flags.
2. macOS 14 CI runners disappear on 2 November; a Sonoma smoke job has an expiry date.
3. Unsigned packages still trigger Gatekeeper on every macOS version; see `docs/release-install.md`.
4. Runner OS version does not set the app's minimum version; the Electron binary's floor does.

## Recommendation for DSH Desktop CI

1. Build the arm64 DMG on `macos-15` (Apple Silicon runner). This matches the M1-through-newest-Silicon requirement.
2. Advertise macOS 14 as the supported minimum while Sonoma stays in Apple's security window. Electron's floor (Ventura, macOS 13) is lower, so no Electron constraint blocks Sonoma.
3. Smoke-test the packaged app on the macOS 26 runner (now GA) to prove forward compatibility on real hardware images.
4. Do not add a macOS 14 smoke runner for the long term; GitHub retires those images on 2 November. If floor verification is wanted before then, add it as a time-boxed job with the retirement date noted.
5. Keep Windows and Linux on `x64` as already configured.
