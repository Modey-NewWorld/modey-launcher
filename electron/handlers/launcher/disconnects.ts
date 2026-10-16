// Patterns indiquant que le joueur quitte la partie ou se déconnecte du serveur Athéna
export const DISCONNECT_PATTERNS = [
  /\[.*ClientPacketListener.*\]: Disconnected/i,
  /Disconnected from server/i,
  /Disconnecting from /i,
  /disconnect\.disconnected/i,
  /disconnect\.kicked/i,
  /disconnect\.lost/i,
  /Leaving multiplayer game/i,
  /Connection closed by server/i,
  /Lost connection to server/i,
  /\[minecraft\/Minecraft\]: Disconnecting/i,
  /Failed to connect to the server/i,
  /Could not connect to server/i,
  /Connection refused/i,
  /Stopping!/i
]
