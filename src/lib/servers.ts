import { invoke } from "@tauri-apps/api/core"

export type ServerStatus = "online" | "busy" | "full"

type StarApiServer = {
  title: string
  ip: string
  port: number
  playerNumber: {
    curNumber: number
    maxNumber: number
  }
  map: {
    name: string
    shortName: string
    winRoundCt: number
    winRoundT: number
  }
  mode: string
  ping: number | null
}

export type Server = {
  id: string
  name: string
  address: string
  ip: string
  port: number
  map: string
  mapName: string
  mode: string
  modeLabel: string
  players: number
  capacity: number
  ping: number | null
  status: ServerStatus
  color: string
  tags: string[]
  scoreCt: number
  scoreT: number
}

const serverColors = [
  "from-primary to-secondary",
  "from-accent to-orange-400",
  "from-cyan-500 to-primary",
  "from-emerald-500 to-cyan-500",
  "from-secondary to-primary",
  "from-slate-500 to-slate-700",
]

export const modeLabels: Record<string, string> = {
  AFK: "挂机大厅",
  JB: "监狱风云",
  MG: "小游戏",
  SCP: "异常研究区",
  TTT: "谍影重重",
  ZE: "僵尸逃跑",
  ZM: "僵尸感染",
}

function getStatus(players: number, capacity: number): ServerStatus {
  if (capacity > 0 && players >= capacity) return "full"
  if (capacity > 0 && players / capacity >= 0.8) return "busy"
  return "online"
}

export function isServerJoinable(server: Server) {
  return server.capacity <= 0 || server.players < server.capacity
}

export async function launchAndConnectServer(address: string): Promise<void> {
  await invoke("launch_cs2_and_connect", { address })
}

export async function fetchStarServers(): Promise<Server[]> {
  const response = await invoke<StarApiServer[]>("fetch_star_servers")

  return response.map((server, index) => {
    const modeLabel = modeLabels[server.mode] ?? server.mode
    return {
      id: `${server.ip}:${server.port}`,
      name: server.title,
      address: `${server.ip}:${server.port}`,
      ip: server.ip,
      port: server.port,
      map: server.map.shortName || server.map.name,
      mapName: server.map.name,
      mode: server.mode,
      modeLabel,
      players: server.playerNumber.curNumber,
      capacity: server.playerNumber.maxNumber,
      ping: server.ping,
      status: getStatus(
        server.playerNumber.curNumber,
        server.playerNumber.maxNumber,
      ),
      color: serverColors[index % serverColors.length],
      tags: [modeLabel, "A2S"],
      scoreCt: server.map.winRoundCt,
      scoreT: server.map.winRoundT,
    }
  })
}
