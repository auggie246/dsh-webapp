# Install DSH Desktop packages

DSH Desktop packages are unsigned in v0.3.

## macOS

macOS can show a Gatekeeper warning when you open the DMG application.

Move DSH Desktop to Applications.

Then Control-click DSH Desktop and select Open.

Select Open in the confirmation dialog.

Do this only when you downloaded the package from the DSH Desktop GitHub Release.

## Windows

Windows can show a SmartScreen warning for the NSIS installer or portable ZIP executable.

Select More info.

Then select Run anyway.

Do this only when you downloaded the package from the DSH Desktop GitHub Release.

## Arch Linux

Download the `.pkg.tar.zst` file from the GitHub Release, then install it with pacman:

```sh
sudo pacman -U ./dsh-desktop-*-x86_64.pkg.tar.zst
```

## Verify the download

Each release provides `SHA256SUMS`.

Compare your package SHA-256 value with the matching release entry before you install it.
