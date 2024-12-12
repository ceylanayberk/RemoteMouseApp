// Server side remains the same

// Client side code:
import React, { useState, useRef, useEffect } from "react";
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  TextInput,
  Dimensions,
  Keyboard
} from "react-native";
import {
  GestureHandlerRootView,
  PanGestureHandler,
  TapGestureHandler,
} from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import throttle from "lodash.throttle";
import {router, useFocusEffect, useLocalSearchParams} from "expo-router";
import { BleManager } from "react-native-ble-plx";

const { Buffer } = require('buffer');

const { height } = Dimensions.get("window");
const BASE_SENSITIVITY = 6;
const serviceUUID = "12ab";
const charUUID = "34cd";

// Increase throttle intervals to reduce message frequency
const MOUSE_THROTTLE_MS = 50;
const SCROLL_THROTTLE_MS = 70;
const SIGNIFICANT_DELTA = 2; // Only send if delta is larger than this

const HomeScreen = () => {
  const [serverIP, setServerIP] = useState("");
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const lastTouch = useRef(null);

  const params = useLocalSearchParams();
  const bleManager = useRef(new BleManager()).current;
  const [bleDevice, setBleDevice] = useState(null);
  const [useBluetooth, setUseBluetooth] = useState(false);


  // Keep alive interval
  const keepAliveInterval = useRef(null);

  useEffect(() => {
    // If deviceId param is present, switch to Bluetooth mode; otherwise WebSocket mode
    if (params.deviceId!==undefined) {
      // Switch to Bluetooth mode if not already
      if (!useBluetooth) {
        disconnectWebSocket();
        setUseBluetooth(true);
      }else{

        connectToBluetooth()
      }
    } else {
      // Switch to WebSocket mode if not already
      if (useBluetooth) {
        disconnectBluetooth();
        setUseBluetooth(false);
      }
    }
  }, [params.deviceId]);



  useEffect(() => {
    // On mode change, connect accordingly
    if (useBluetooth) {
      connectToBluetooth();
    } else {
      connectToWebSocket();
    }

    return () => {
      // Cleanup connections on unmount
      /*stopKeepAlive();
      disconnectWebSocket();
      disconnectBluetooth();*/
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useBluetooth]);



  const ensureBleConnection = async () => {
    if (!bleDevice) return false;
    let isConnected = await bleDevice.isConnected();
    if (isConnected) return true;

    for (let i = 0; i < 3; i++) {
      try {
        await bleDevice.connect();
        await bleDevice.discoverAllServicesAndCharacteristics();
        isConnected = await bleDevice.isConnected();
        if (isConnected) {
          return true;
        }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    return false;
  };

  const connectToWebSocket = () => {
    if (useBluetooth || !serverIP.trim()) return;

    const url = `ws://${serverIP}:3000`;
    const socket = new WebSocket(url);

    socket.onopen = () => {
      setConnected(true);
      Keyboard.dismiss();
      startKeepAlive();
    };

    socket.onerror = () => {
      setConnected(false);
      stopKeepAlive();
    };

    socket.onclose = () => {
      setConnected(false);
      stopKeepAlive();
    };

    socketRef.current = socket;
  };

  const disconnectWebSocket = () => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    setConnected(false);
    stopKeepAlive();
  };

  const connectToBluetooth = async () => {
    if (!params.deviceId || !useBluetooth) return;
    try {
      const device = await bleManager.connectToDevice(params.deviceId);
      await device.discoverAllServicesAndCharacteristics();
      setBleDevice(device);
      setConnected(true);
      startKeepAlive();

      // Listen for disconnection and attempt reconnect
      bleManager.onDeviceDisconnected(params.deviceId, async () => {
        setConnected(false);
        stopKeepAlive();

        // Attempt reconnection
        for (let i = 0; i < 3; i++) {
          try {
            await device.connect();
            await device.discoverAllServicesAndCharacteristics();
            const stillConnected = await device.isConnected();
            if (stillConnected) {
              setConnected(true);
              setBleDevice(device);
              startKeepAlive();
              break;
            }
          } catch {
            await new Promise(res => setTimeout(res, 300));
          }
        }
      });
    } catch {
      setConnected(false);
      stopKeepAlive();
    }
  };

  const disconnectBluetooth = () => {
    if (bleDevice) {
      bleDevice.cancelConnection().catch(() => {});
      setBleDevice(null);
    }
    setConnected(false);
    stopKeepAlive();
    console.log("test")
    router.replace({pathname:"/(tabs)"})
    setConnected(false)
  };

  const startKeepAlive = () => {
    stopKeepAlive(); // Clear existing intervals if any
    // Send a ping every 10 seconds
    keepAliveInterval.current = setInterval(() => {
      if (connected) {
        sendMessage("ping", {});
      }
    }, 10000);
  };

  const stopKeepAlive = () => {
    if (keepAliveInterval.current) {
      clearInterval(keepAliveInterval.current);
      keepAliveInterval.current = null;
    }
  };

  const sendMessage = async (t, payload) => {
    if (!connected) return;
    const message = JSON.stringify({ t, ...payload });

    if (useBluetooth && bleDevice) {
      let isStillConnected = await bleDevice.isConnected();
      if (!isStillConnected) {
        const reconnected = await ensureBleConnection();
        if (!reconnected) return; // Drop message if no reconnection
      }

      const base64Message = Buffer.from(message, 'utf8').toString('base64');
      bleDevice.writeCharacteristicWithoutResponseForService(serviceUUID, charUUID, base64Message)
          .catch(() => {}); // Silent fail
    } else if (!useBluetooth && socketRef.current) {
      socketRef.current.send(message);
    }
  };

  const calculateMouseDelta = (event) => {
    const { translationX, translationY } = event.nativeEvent;
    if (!lastTouch.current) {
      lastTouch.current = { x: translationX, y: translationY };
      return { deltaX: 0, deltaY: 0 };
    }

    const deltaX = (translationX - lastTouch.current.x) * BASE_SENSITIVITY;
    const deltaY = (translationY - lastTouch.current.y) * BASE_SENSITIVITY;
    lastTouch.current = { x: translationX, y: translationY };
    return { deltaX, deltaY };
  };

  const handleTapGesture = () => {
    if (connected) {
      sendMessage("c", { b: "l" });
    }
  };

  const throttledHandleTouchGesture = throttle((event) => {
    const { deltaX, deltaY } = calculateMouseDelta(event);
    if (Math.abs(deltaX) > SIGNIFICANT_DELTA || Math.abs(deltaY) > SIGNIFICANT_DELTA) {
      sendMessage("m", { x: deltaX, y: deltaY });
    }
  }, MOUSE_THROTTLE_MS);

  const throttledHandleScrollGesture = throttle((event) => {
    const { translationY } = event.nativeEvent;
    const adjustedScroll = -translationY / 3;
    if (Math.abs(adjustedScroll) > 5) {
      sendMessage("s", { a: adjustedScroll });
    }
  }, SCROLL_THROTTLE_MS);

  const handleClick = (type) => {
    if (!connected) return;
    sendMessage("c", { b: type === "left" ? "l" : "r" });
  };

  return (
      <SafeAreaView style={styles.container}>
        {!useBluetooth && (
            <>
              <TextInput
                  style={styles.input}
                  placeholder="Enter server IP"
                  placeholderTextColor="#666"
                  value={serverIP}
                  onChangeText={setServerIP}
                  keyboardType="numbers-and-punctuation"
              />
              <TouchableOpacity
                  style={[styles.connectButton, connected && styles.connectedButton]}
                  onPress={() => {
                    if(connected){
                      disconnectWebSocket()
                    }else{
                      disconnectBluetooth();
                      setUseBluetooth(false);
                      setConnected(false)
                      connectToWebSocket();
                    }
                  }}
              >
                <Text style={styles.buttonText}>{connected && !useBluetooth ? "Connected" : "Connect via WebSocket"}</Text>
              </TouchableOpacity>
            </>
        )}
        {useBluetooth && (
            <>
              {!connected && (
                  <Text style={{ color: "white", marginBottom: 10 }}>
                    Connect via Bluetooth
                  </Text>
              )}
              <TouchableOpacity
                  style={[styles.connectButton, connected && styles.connectedButton]}
                  onPress={() => {
                    if(connected){
                      disconnectBluetooth()
                      setUseBluetooth(false)
                    }else{
                      setUseBluetooth(true);
                      connectToBluetooth();
                    }
                  }}
              >
                <Text style={styles.buttonText}>{connected && useBluetooth ? "Connected" : "Connect via Bluetooth"}</Text>
              </TouchableOpacity>
            </>
        )}

        <GestureHandlerRootView style={{ flex: 1 }}>
          <TapGestureHandler onActivated={handleTapGesture}>
            <View style={[styles.touchpad, !connected && styles.disabled]}>
              <PanGestureHandler onGestureEvent={throttledHandleTouchGesture}>
                <View style={[styles.touchpad, !connected && styles.disabled]}>
                  <Text style={styles.touchpadText}>
                    {connected ? (useBluetooth ? "Touchpad (Bluetooth)" : "Touchpad (WebSocket)") : "Not Connected"}
                  </Text>
                </View>
              </PanGestureHandler>
            </View>
          </TapGestureHandler>

          <PanGestureHandler onGestureEvent={throttledHandleScrollGesture}>
            <View style={[styles.scrollArea, !connected && styles.disabled]}>
              <Text style={styles.scrollText}>
                {connected ? "Scroll Area" : "Not Connected"}
              </Text>
            </View>
          </PanGestureHandler>
        </GestureHandlerRootView>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
              style={[styles.clickButton, !connected && styles.buttonDisabled]}
              onPress={() => handleClick("left")}
              disabled={!connected}
          >
            <Text style={styles.buttonText}>Left Click</Text>
          </TouchableOpacity>
          <TouchableOpacity
              style={[styles.clickButton, !connected && styles.buttonDisabled]}
              onPress={() => handleClick("right")}
              disabled={!connected}
          >
            <Text style={styles.buttonText}>Right Click</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
            style={[styles.connectButton, !connected && styles.buttonDisabled]}
            onPress={() => connected && sendMessage("m", { x: 50, y: 50 })}
            disabled={!connected}
        >
          <Text style={styles.buttonText}>Test Mouse Move</Text>
        </TouchableOpacity>
      </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#1E1E1E" },
  input: {
    borderWidth: 1,
    borderColor: "#555",
    padding: 10,
    borderRadius: 5,
    color: "white",
    marginBottom: 10,
  },
  connectButton: {
    backgroundColor: "#007BFF",
    padding: 10,
    borderRadius: 5,
    alignItems: "center",
    marginBottom: 20,
  },
  connectedButton: { backgroundColor: "#28CD41" },
  touchpad: {
    flex: 1,
    backgroundColor: "#444",
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  scrollArea: {
    height: height * 0.2,
    backgroundColor: "#333",
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  disabled: { opacity: 0.5 },
  touchpadText: { color: "#FFF", fontSize: 16 },
  scrollText: { color: "#FFF", fontSize: 16 },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 20,
    flex: 0.2,
  },
  clickButton: {
    backgroundColor: "#007BFF",
    padding: 10,
    borderRadius: 5,
    flex: 1,
    margin: 5,
    alignItems: "center",
  },
  buttonDisabled: { backgroundColor: "#555" },
  buttonText: { color: "white", fontSize: 16, fontWeight: "bold" },
});

export default HomeScreen;
