import { WebSocket, WebSocketServer } from "ws";
import { wsArcjet } from "../arcjet.js";

const matchSubscribers = new Map()

function subscribe(matchId,socket) {
  if (!matchSubscribers.has(matchId)) {
    matchSubscribers.set(matchId,new Set())
  }
  matchSubscribers.get(matchId).add(socket)
}

function unsubscribe(matchId, socket){
  const subscribers = matchSubscribers.get(matchId)

  if (!subscribers) return

  subscribers.delete(socket)

  if (subscribers.size === 0) {
    matchSubscribers.delete(matchId)
  }
}

function cleanupSubscriptions(socket) {
  for (const matchId of socket.subscriptions) {
    unsubscribe(matchId,socket)
  }
}

function broadcastToMatch(matchId, payload) {
  const subscribers = matchSubscribers.get(matchId)

  if (!subscribers || subscribers.size ===0) return

  for (const client of subscribers) {
    const message = JSON.stringify(payload)
    if (client.readyState === WebSocket.OPEN) {
      client.send(message)
    }
  }
}


function sendJson(socket, payload) {
  if (socket.readyState !== WebSocket.OPEN) return;

  socket.send(JSON.stringify(payload));
}

function broadcastToAll(wss, payload) {
  for (const client of wss.clients) {
    if (client.readyState !== WebSocket.OPEN) continue;

    client.send(JSON.stringify(payload));
  }
}

function handleMessage(socket, data) {
  let message

  try {
    message = JSON.parse(data.toString())
  } catch  {
    sendJson(socket, {type:'error', message:'Invalid JSON'})
    return;
  }

  if (message?.type === 'subscribe' && Number.isInteger(message.matchId)) {
    subscribe(message.matchId,socket)
    socket.subscriptions.add(message.matchId)
    sendJson(socket, {type:'subscribed', matchId: message.matchId})
    return;
  }

  if (message?.type === 'unsubscribe' && Number.isInteger(message.matchId)) {
    unsubscribe(message.matchId,socket)
    socket.subscriptions.delete(message.matchId)
    sendJson(socket, {type:'unsubscribed', matchId: message.matchId})
  }
}

export function attachWebSocketServer(server) {
  const wss = new WebSocketServer({
    server,
    path: "/ws",
    maxPayload: 1024 * 1024,
  });

  wss.on("connection", async (socket, req) => {
    if (wsArcjet) {
      try {
        const decision = await wsArcjet.protect(req);

        if (decision.isDenied()) {
          if (decision.reason.isRateLimit()) {
            socket.close(1008, "Rate limit exceeded");
          } else {
            socket.close(1008, "Forbidden");
          }
          return;
        }
      } catch (e) {
        console.error("WS upgrade protection error", e);
        socket.close(1011, "Internal server error");
        return;
      }
    }


    socket.subscriptions = new Set()
    sendJson(socket, { type: "welcome" });

    socket.on('message', (data) => {
      handleMessage(socket,data)
    })
    socket.on('close',()=>{
      cleanupSubscriptions(socket)
    })

    socket.on('error', ()=>{
      socket.terminate()
    })

    socket.on("error", console.error);
  });

  function broadcastMatchCreated(match) {
    broadcastToAll(wss, { type: "match_created", data: match });
  }

  function broadcastCommentary (matchId, comment) {
    broadcastToMatch(matchId, {type:'commentary', data:comment})
  }

  return { broadcastMatchCreated, broadcastCommentary };
}
