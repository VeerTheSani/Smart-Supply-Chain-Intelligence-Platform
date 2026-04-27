let socket = null;

export const getWebSocket = (url) => {
  if (!socket || socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
    socket = new WebSocket(url);
  }
  return socket;
};
