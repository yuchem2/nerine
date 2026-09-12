import { Menu } from 'electron'

/**
 * macOS needs an application menu or native text editing stops working, and its
 * Window submenu is built by hand because the stock Close item takes the window
 * rather than the tab. Elsewhere the menu goes away: its accelerators would reach
 * the chrome renderer instead of the page, and the shortcut table owns those keys.
 */
export function installAppMenu(): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
    return
  }

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      {
        label: 'Window',
        submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
      }
    ])
  )
}
