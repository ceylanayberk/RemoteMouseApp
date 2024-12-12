import { WebSocketServer } from "ws";
import robot from "robotjs";
import os from "os";
import clipboardy from "clipboardy";
import bleno from "@abandonware/bleno";

// Get Local IP
const getLocalIp = () => {
  const networkInterfaces = os.networkInterfaces();
  for (const interfaceName in networkInterfaces) {
    for (const iface of networkInterfaces[interfaceName]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "127.0.0.1";
};

const localIp = getLocalIp();
clipboardy.writeSync(localIp);
console.log("IP Address copied to clipboard!");

// WebSocket Server
const wss = new WebSocketServer({ port: 3000 });
console.log("WebSocket server running...");

wss.on("connection", (socket) => {
  socket.on("message", (message) => {
    try {
      const { t, x, y, a, b } = JSON.parse(message);
      const screenSize = robot.getScreenSize();
      const { width, height } = screenSize;
      const currentPos = robot.getMousePos();

      switch (t) {
        case "m": // mouse move
        {
          const newX = Math.min(Math.max(0, currentPos.x + x), width - 1);
          const newY = Math.min(Math.max(0, currentPos.y + y), height - 1);
          robot.moveMouse(newX, newY);
        }
          break;
        case "s": // scroll
          robot.scrollMouse(0, a);
          break;
        case "c": // click
          if (!["l", "r"].includes(b)) throw new Error("Invalid click type");
          robot.mouseClick(b === "l" ? "left" : "right");
          break;
        case "ping":
          // Keep-alive message, do nothing
          break;
        default:
          throw new Error("Unknown message type");
      }
    } catch (error) {
      console.error("Error handling message:", error.message);
    }
  });
});

// Bluetooth Setup
const serviceUUID = "12ab";
const characteristicUUID = "34cd";
const PrimaryService = bleno.PrimaryService;
const Characteristic = bleno.Characteristic;

const mouseCharacteristic = new Characteristic({
  uuid: characteristicUUID,
  properties: ["write", "writeWithoutResponse"],
  permissions: ["write"],
  onWriteRequest: (data, offset, withoutResponse, callback) => {
    try {
      const { t, x, y, a, b } = JSON.parse(data.toString());
      const screenSize = robot.getScreenSize();
      const { width, height } = screenSize;
      const currentPos = robot.getMousePos();

      switch (t) {
        case "m": // mouse move
        {
          const newX = Math.min(Math.max(0, currentPos.x + x), width - 1);
          const newY = Math.min(Math.max(0, currentPos.y + y), height - 1);
          robot.moveMouse(newX, newY);
        }
          break;
        case "s": // scroll
          robot.scrollMouse(0, a);
          break;
        case "c": // click
          if (!["l", "r"].includes(b)) throw new Error("Invalid click type");
          robot.mouseClick(b === "l" ? "left" : "right");
          break;
        case "ping":
          // Keep-alive from Bluetooth
          break;
        default:
          throw new Error("Unknown message type");
      }

      callback(Characteristic.RESULT_SUCCESS);
    } catch (err) {
      console.error("Bluetooth write error:", err.message);
      callback(Characteristic.RESULT_UNLIKELY_ERROR);
    }
  },
});

const mouseService = new PrimaryService({
  uuid: serviceUUID,
  characteristics: [mouseCharacteristic],
});

bleno.on("stateChange", (state) => {
  if (state === "poweredOn") {
    console.log("Bluetooth powered on, advertising...");
    bleno.startAdvertising("RemoteControl", [serviceUUID]);
  } else {
    bleno.stopAdvertising();
  }
});

bleno.on("advertisingStart", (error) => {
  if (!error) {
    bleno.setServices([mouseService]);
    console.log("Bluetooth advertising started");
  } else {
    console.error("Failed to start advertising:", error);
  }
});

console.log(`
🖱️  Remote Control API Running
📍 Host: ${localIp}
🌐 WebSocket: ws://${localIp}:3000
🔵 BLE: Advertising 'RemoteControl' (Service: ${serviceUUID})
`);
