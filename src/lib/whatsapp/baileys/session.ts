import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WASocket,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import path from "path";
import fs from "fs";
import pino from "pino";

const AUTH_DIR = path.resolve(process.cwd(), ".whatsapp-auth");

export type SessionStatus = "disconnected" | "connecting" | "qr" | "connected";

let sock: WASocket | null = null;
let status: SessionStatus = "disconnected";
let currentQR: string | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;

export function getSessionStatus(): SessionStatus {
  return status;
}

export function getCurrentQR(): string | null {
  return currentQR;
}

export function getSocket(): WASocket | null {
  return sock;
}

export async function startSession(): Promise<void> {
  if (status === "connected" || status === "connecting") return;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  status = "connecting";
  currentQR = null;

  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  // pino v9+ Logger generics drift from Baileys' expected Logger type
  const logger = pino({ level: "silent" }) as unknown as Parameters<typeof makeWASocket>[0]["logger"];

  sock = makeWASocket({
    version,
    auth: authState,
    logger,
    printQRInTerminal: true,
    browser: ["Nebula Sales", "Chrome", "1.0"],
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      currentQR = qr;
      status = "qr";
      console.log("[baileys] QR ready — scan in terminal or /api/whatsapp/session");
    }

    if (connection === "close") {
      const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;

      status = "disconnected";
      sock = null;
      currentQR = null;

      if (loggedOut) {
        console.log("[baileys] Logged out. Delete .whatsapp-auth/ and restart to re-scan.");
      } else {
        console.log(`[baileys] Disconnected (${code}). Reconnecting in 5s…`);
        reconnectTimer = setTimeout(() => void startSession(), 5_000);
      }
    }

    if (connection === "open") {
      status = "connected";
      currentQR = null;
      console.log("[baileys] Connected ✓");
    }
  });
}
