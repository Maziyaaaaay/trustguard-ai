const { PeerServer } = require("peer");

const server = PeerServer({
  port: 9000,
  path: "/peerjs",
  proxied: true,
});

server.on("connection", (client) => {
  console.log(`✅ Peer connected: ${client.getId()}`);
});

server.on("disconnect", (client) => {
  console.log(`🔴 Peer disconnected: ${client.getId()}`);
});

console.log("======================================");
console.log("   TRUSTGUARD LOCAL PEER SERVER");
console.log("======================================");
console.log("HTTP:      http://127.0.0.1:9000");
console.log("Peer path: /peerjs");
console.log("======================================");