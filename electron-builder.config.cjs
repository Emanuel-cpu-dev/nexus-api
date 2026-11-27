module.exports = {
  appId: 'com.proyecto.nexus',
  productName: 'Nexus',
  copyright: 'Copyright © 2026 Nexus',
  icon: 'nexus-violeta.ico',
  directories: { output: 'dist-electron' },
  files: ['package.json', 'electron/**/*', 'app/dist/**/*'],
  win: {
    signAndEditExecutable: false,
    target: [
      { target: 'nsis', arch: ['x64'] },
      { target: 'portable', arch: ['x64'] }
    ]
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true
  },
  portable: { artifactName: 'Nexus-Portable.exe' },
  linux: { target: ['AppImage'], category: 'Network' }
};
