/**
 * launcher/electron/utils/javaDetector.ts
 * Détection et résolution dynamique d'un environnement Java 21 compatible.
 * Élimine tout chemin absolu codé en dur en inspectant l'environnement, le registre et les chemins usuels.
 */

import fs from 'node:fs'
import path from 'node:path'
import child_process from 'node:child_process'
import logger from 'electron-log/main'

export interface JavaDetectionResult {
  path: string
  version: string
  source: 'env_modey' | 'env_java_home' | 'windows_registry' | 'standard_dir' | 'system_path' | 'user_configured'
}

/**
 * Vérifie si un exécutable Java correspond à une version 21
 */
export function verifyJava21(binaryPath: string): { valid: boolean; versionOutput: string } {
  try {
    if (!fs.existsSync(binaryPath)) return { valid: false, versionOutput: '' }
    const res = child_process.spawnSync(binaryPath, ['-version'], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 4000
    })
    const output = ((res.stderr || '') + (res.stdout || '')).trim()
    const is21 = /version\s+["']?(21(\.|\b)|21-)/i.test(output)
    return { valid: is21, versionOutput: output }
  } catch (err) {
    return { valid: false, versionOutput: '' }
  }
}

/**
 * Détection Windows Registry sans dépendances natives
 */
function checkWindowsRegistry(): string | null {
  if (process.platform !== 'win32') return null

  const registryKeys = [
    'HKLM\\SOFTWARE\\JavaSoft\\JDK\\21',
    'HKLM\\SOFTWARE\\JavaSoft\\Java Development Kit\\21',
    'HKLM\\SOFTWARE\\Eclipse Adoptium\\JDK\\21',
    'HKLM\\SOFTWARE\\Microsoft\\JDK\\21'
  ]

  for (const key of registryKeys) {
    try {
      const out = child_process.execSync(`reg query "${key}" /v JavaHome`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 2000
      })
      const match = out.match(/JavaHome\s+REG_SZ\s+(.+)/i)
      if (match && match[1]) {
        const candidate = path.join(match[1].trim(), 'bin', 'java.exe')
        const { valid } = verifyJava21(candidate)
        if (valid) return candidate
      }
    } catch (_) {}
  }

  return null
}

/**
 * Inspection des répertoires standards connus d'installation de JDK
 */
function checkStandardDirectories(): string | null {
  const isWin = process.platform === 'win32'
  const isMac = process.platform === 'darwin'

  const baseDirs: string[] = []

  if (isWin) {
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files'
    baseDirs.push(
      path.join(programFiles, 'Java'),
      path.join(programFiles, 'Eclipse Adoptium'),
      path.join(programFiles, 'Microsoft'),
      path.join(programFiles, 'BellSoft'),
      path.join(programFiles, 'Semeru'),
      path.join(process.env['LocalAppData'] || '', 'Programs', 'Eclipse Adoptium')
    )
  } else if (isMac) {
    baseDirs.push('/Library/Java/JavaVirtualMachines')
  } else {
    baseDirs.push('/usr/lib/jvm', '/usr/java', '/opt/jdk')
  }

  for (const base of baseDirs) {
    try {
      if (!fs.existsSync(base)) continue
      const entries = fs.readdirSync(base)
      for (const entry of entries) {
        if (/21/i.test(entry) || /jdk/i.test(entry)) {
          const candidateBin = isWin
            ? path.join(base, entry, 'bin', 'java.exe')
            : path.join(base, entry, 'bin', 'java')

          if (fs.existsSync(candidateBin)) {
            const { valid } = verifyJava21(candidateBin)
            if (valid) return candidateBin
          }

          // Cas sous-dossier Contents/Home sur macOS
          if (isMac) {
            const macBin = path.join(base, entry, 'Contents', 'Home', 'bin', 'java')
            if (fs.existsSync(macBin) && verifyJava21(macBin).valid) return macBin
          }
        }
      }
    } catch (_) {}
  }

  return null
}

/**
 * Recherche via la commande PATH système (where.exe ou which)
 */
function checkSystemPath(): string | null {
  const isWin = process.platform === 'win32'
  const cmd = isWin ? 'where.exe java' : 'which java'

  try {
    const out = child_process.execSync(cmd, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 3000
    })
    const lines = out.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    for (const line of lines) {
      if (fs.existsSync(line)) {
        const { valid } = verifyJava21(line)
        if (valid) return line
      }
    }
  } catch (_) {}

  return null
}

/**
 * Résout le chemin absolu d'un environnement Java 21 valide
 * Lève une erreur claire et explicite si aucun runtime Java 21 n'a pu être détecté.
 */
export function resolveJava21Path(customPath?: string): JavaDetectionResult {
  // 0. Chemin explicite fourni (ex: paramètres utilisateur)
  if (customPath && customPath.trim() && customPath !== 'bundled' && customPath !== 'system') {
    const clean = customPath.trim()
    const { valid, versionOutput } = verifyJava21(clean)
    if (valid) {
      logger.info(`[JavaDetector] Utilisation de Java 21 configuré : ${clean}`)
      return { path: clean, version: versionOutput, source: 'user_configured' }
    }
  }

  // 1. Variable d'environnement spécifique MODEY_JAVA_PATH
  const modeyJava = process.env.MODEY_JAVA_PATH
  if (modeyJava && modeyJava.trim()) {
    const candidate = modeyJava.trim()
    const { valid, versionOutput } = verifyJava21(candidate)
    if (valid) {
      logger.info(`[JavaDetector] Détection via MODEY_JAVA_PATH : ${candidate}`)
      return { path: candidate, version: versionOutput, source: 'env_modey' }
    }
  }

  // 2. Variable standard JAVA_HOME
  const javaHome = process.env.JAVA_HOME
  if (javaHome && javaHome.trim()) {
    const isWin = process.platform === 'win32'
    const candidate = path.join(javaHome.trim(), 'bin', isWin ? 'java.exe' : 'java')
    const { valid, versionOutput } = verifyJava21(candidate)
    if (valid) {
      logger.info(`[JavaDetector] Détection via JAVA_HOME : ${candidate}`)
      return { path: candidate, version: versionOutput, source: 'env_java_home' }
    }
  }

  // 3. Registre Windows
  const regPath = checkWindowsRegistry()
  if (regPath) {
    const { versionOutput } = verifyJava21(regPath)
    logger.info(`[JavaDetector] Détection via Registre Windows : ${regPath}`)
    return { path: regPath, version: versionOutput, source: 'windows_registry' }
  }

  // 4. Dossiers standards connus
  const stdPath = checkStandardDirectories()
  if (stdPath) {
    const { versionOutput } = verifyJava21(stdPath)
    logger.info(`[JavaDetector] Détection via répertoire standard : ${stdPath}`)
    return { path: stdPath, version: versionOutput, source: 'standard_dir' }
  }

  // 5. PATH système
  const pathCandidate = checkSystemPath()
  if (pathCandidate) {
    const { versionOutput } = verifyJava21(pathCandidate)
    logger.info(`[JavaDetector] Détection via PATH système : ${pathCandidate}`)
    return { path: pathCandidate, version: versionOutput, source: 'system_path' }
  }

  // 6. Échec : Message d'erreur guidant l'utilisateur
  throw new Error(
    "Java 21 est introuvable sur votre système.\n" +
    "Minecraft 1.21+ et les mods Modey nécessitent Java 21.\n" +
    "Veuillez installer un JDK 21 (ex: Eclipse Adoptium Temurin 21) ou configurer son chemin dans les paramètres du Launcher."
  )
}
