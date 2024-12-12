import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { BleManager } from 'react-native-ble-plx';
import { ThemedView } from "../../components/ThemedView";
import { SafeAreaView } from "react-native-safe-area-context";
import { ThemedText } from "../../components/ThemedText";
import { useRouter } from "expo-router";

const manager = new BleManager();

export default function ExploreScreen() {
    const [devices, setDevices] = useState([]);
    const [connectedDevice, setConnectedDevice] = useState(null);
    const router = useRouter();

    useEffect(() => {
        // Try scanning with a known service UUID if you know it, otherwise use null
        const serviceUUIDs = ["12ab"]; // If this doesn't show the device, try null
        manager.startDeviceScan(serviceUUIDs, null, (error, device) => {
            if (error) {
                console.error('Device scan error:', error);
                return;
            }

            console.log("Discovered device:", device.id, device.name, device.localName);

            // Add the device if it's not already in the list
            if (!devices.some(d => d.id === device.id)) {
                setDevices(prevDevices => [...prevDevices, device]);
            }
        });

        return () => {
            manager.stopDeviceScan();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const connectToDevice = async (device) => {
        try {
            console.log("Connecting to device:", device.id, device.name || device.localName);
            const connectedDevice = await manager.connectToDevice(device.id);
            console.log('Connected to:', connectedDevice.name || connectedDevice.localName || 'Unknown Device');

            // Discover services and characteristics
            await connectedDevice.discoverAllServicesAndCharacteristics();
            const services = await connectedDevice.services();
            console.log("Discovered services:", services);

            for (const service of services) {
                const characteristics = await connectedDevice.characteristicsForService(service.uuid);
                console.log(`Characteristics for service ${service.uuid}:`, characteristics);
            }

            setConnectedDevice(connectedDevice);
            router.replace({
                pathname: '/(tabs)',
                params: { deviceId: connectedDevice.id }
            });
        } catch (error) {
            console.error('Connection error:', error);
        }
    };

    return (
        <SafeAreaView style={{ flex: 1 }}>
            <ThemedView style={styles.container}>
                <ThemedText style={styles.title}>
                    {connectedDevice
                        ? `Connected to ${connectedDevice.name || connectedDevice.localName || 'Unknown Device'}`
                        : 'Available Devices'
                    }
                </ThemedText>

                <FlatList
                    data={devices}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={styles.device}
                            onPress={() => connectToDevice(item)}
                        >
                            <Text>{item.name || item.localName || 'Unknown Device'}</Text>
                        </TouchableOpacity>
                    )}
                />
            </ThemedView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20 },
    title: { fontSize: 24, marginBottom: 20, fontWeight: 'bold' },
    device: { padding: 15, marginVertical: 5, backgroundColor: '#f0f0f0', borderRadius: 5 },
});
