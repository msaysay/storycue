import WebSocket from "ws";

/** ws.close() emits an asynchronous error if a handshake is still pending. */
export function closeDetachedAsrSocket(socket: WebSocket | null | undefined): void {
  if (!socket) return;
  socket.removeAllListeners();
  // Business callbacks are detached, but EventEmitter still requires an error listener.
  socket.on("error", () => {});
  try { socket.close(); } catch { /* The session has already been abandoned. */ }
}
