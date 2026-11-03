# Installation

Quiet Tabs is installed as an unpacked Chrome extension. It is not currently distributed through the Chrome Web Store.

## Requirements

- Google Chrome 120 or later.
- Permission to load unpacked extensions in your Chrome profile.

Node.js, npm and a server are not required to use the extension.

## Install from source

1. On the repository page, choose **Code → Download ZIP**, or clone the repository.
2. Extract the archive into a permanent folder of your choice.
3. Find the directory containing `manifest.json`, `background.js` and `panel.html`.
4. Open `chrome://extensions`.
5. Enable **Developer mode** in the upper-right corner.
6. Click **Load unpacked** and select the directory from step 3.
7. Open Chrome's Extensions menu and pin **Quiet Tabs**.
8. Click its icon to open the side panel.

Use **EN / RU** in the panel header to choose English or Russian. The selected language is saved for future sessions.

On macOS, use **Command + Shift + G** in the folder picker to enter the location you chose.

Chrome continues to load files from this folder. Keep it in place; moving or deleting it breaks the installation.

## Confirm Trial mode

The side panel should display **Observing · no tabs will close**.

Trial mode only records suggestions and your feedback. Agree does not close a tab. The extension never leaves this mode automatically.

By default, suggestions begin after 24 hours of observation for unprotected tabs with little qualified attention. To try it sooner, open Settings and change the first retention period to one hour, leaving Trial mode selected.

## Update an existing installation

1. Download the updated source and replace the files in the same extension folder.
2. Open `chrome://extensions`.
3. Click the reload button on Quiet Tabs.
4. Reopen the side panel.

Updating in place preserves the local extension data. Do not remove the extension first unless you intend to delete that data.

## Use it on another computer

Copy the project folder or installation ZIP, then repeat the installation steps in the other Chrome profile.

Each installation maintains its own settings, statistics, journal and archive. Source files do not contain this data. Synchronization and data export are not available in this version.

## Disable or remove

- **Disable:** turn off Quiet Tabs on `chrome://extensions`. Observation stops, and existing local data remains.
- **Remove:** choose Remove on the same page. Chrome deletes the extension and its local data.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Chrome cannot find the manifest | Select the extracted directory that directly contains `manifest.json`, not the ZIP or its parent |
| The panel cannot reach the extension | Reload the extension on `chrome://extensions`, then reopen the panel |
| No suggestions appear | Allow the configured observation period to pass; selected and other protected tabs are excluded |
| Developer mode or Load unpacked is unavailable | Your organization may restrict local extensions; ask the browser administrator |
| Installation breaks after moving the folder | Move it back to its original location and reload the extension |

For platform instructions, see [Chrome's guide to loading an unpacked extension](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).

[Project overview](README.md) · [Behavior and limitations](docs/BEHAVIOR.md)
