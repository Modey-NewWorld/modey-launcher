// Configuration de build « version portable ».
// Réutilise le build de package.json et produit une archive ZIP contenant
// l'application décompressée + le marqueur portable.flag.
const pkg = require('./package.json')

module.exports = {
  ...pkg.build,
  directories: {
    ...pkg.build.directories
  },
  win: {
    ...pkg.build.win,
    target: [{ target: 'zip', arch: ['x64'] }],
    artifactName: '${productName}-Portable-${version}.${ext}',
    // Aucun privilège administrateur demandé au lancement.
    requestedExecutionLevel: 'asInvoker'
  },
  // La cible ZIP n'utilise pas NSIS : on retire la configuration pour éviter
  // de générer un installateur ou des métadonnées de mise à jour inutiles.
  nsis: undefined,
  publish: null,
  extraFiles: [
    {
      from: 'build/portable.flag',
      to: 'portable.flag'
    }
  ]
}
