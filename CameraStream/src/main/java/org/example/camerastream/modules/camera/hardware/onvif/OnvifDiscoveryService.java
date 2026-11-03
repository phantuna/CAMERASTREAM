package org.example.camerastream.modules.camera.hardware.onvif;

import lombok.extern.slf4j.Slf4j;
import org.example.camerastream.modules.camera.dto.OnvifDiscoveryDevice;
import org.springframework.stereotype.Service;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@Slf4j
public class OnvifDiscoveryService {

    private static final String WS_DISCOVERY_PROBE_WILDCARD =
            "<?xml version=\"1.0\" encoding=\"utf-8\"?>" +
            "<Envelope xmlns:dn=\"http://www.onvif.org/ver10/network/wsdl\" " +
            "xmlns=\"http://www.w3.org/2003/05/soap-envelope\">" +
            "<Header>" +
            "<wsa:MessageID xmlns:wsa=\"http://schemas.xmlsoap.org/ws/2004/08/addressing\">" +
            "uuid:%s</wsa:MessageID>" +
            "<wsa:To xmlns:wsa=\"http://schemas.xmlsoap.org/ws/2004/08/addressing\">" +
            "urn:schemas-xmlsoap-org:ws:2005:04:discovery</wsa:To>" +
            "<wsa:Action xmlns:wsa=\"http://schemas.xmlsoap.org/ws/2004/08/addressing\">" +
            "http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</wsa:Action>" +
            "</Header>" +
            "<Body>" +
            "<Probe xmlns=\"http://schemas.xmlsoap.org/ws/2005/04/discovery\"/>" +
            "</Body>" +
            "</Envelope>";

    private static final Pattern XADDRS_PATTERN = Pattern.compile("<(?:[^:]+:)?XAddrs>([^<]+)</(?:[^:]+:)?XAddrs>");
    private static final Pattern URL_PARSER_PATTERN = Pattern.compile("https?://([0-9a-zA-Z._-]+)(?::([0-9]+))?");

    public List<OnvifDiscoveryDevice> discoverCameras(int timeoutMs) {
        Map<String, OnvifDiscoveryDevice> discoveredMap = new LinkedHashMap<>();
        DatagramSocket socket = null;

        try {
            socket = new DatagramSocket();
            socket.setBroadcast(true);
            socket.setSoTimeout(timeoutMs);

            String messageId = UUID.randomUUID().toString();
            String probeMsg = String.format(WS_DISCOVERY_PROBE_WILDCARD, messageId);
            byte[] sendData = probeMsg.getBytes(StandardCharsets.UTF_8);

            // 1. Multicast ONVIF
            InetAddress multicastGroup = InetAddress.getByName("239.255.255.250");
            socket.send(new DatagramPacket(sendData, sendData.length, multicastGroup, 3702));

            // 2. Global broadcast
            InetAddress broadcast = InetAddress.getByName("255.255.255.255");
            socket.send(new DatagramPacket(sendData, sendData.length, broadcast, 3702));

            // 3. Send on each network interface broadcast (Ethernet, Wi-Fi, etc.)
            try {
                Enumeration<NetworkInterface> networkInterfaces = NetworkInterface.getNetworkInterfaces();
                while (networkInterfaces.hasMoreElements()) {
                    NetworkInterface ni = networkInterfaces.nextElement();
                    if (ni.isLoopback() || !ni.isUp()) continue;

                    for (var ifAddr : ni.getInterfaceAddresses()) {
                        InetAddress bcast = ifAddr.getBroadcast();
                        if (bcast != null) {
                            try {
                                socket.send(new DatagramPacket(sendData, sendData.length, bcast, 3702));
                                log.debug("Sent ONVIF probe to {} on {}", bcast.getHostAddress(), ni.getDisplayName());
                            } catch (Exception ignored) {}
                        }
                    }
                }
            } catch (Exception ex) {
                log.debug("Interface broadcast enumeration error: {}", ex.getMessage());
            }

            log.info("Broadcasted ONVIF WS-Discovery probe across all network interfaces");

            long endTime = System.currentTimeMillis() + timeoutMs;
            byte[] recvBuf = new byte[8192];

            while (System.currentTimeMillis() < endTime) {
                try {
                    DatagramPacket recvPacket = new DatagramPacket(recvBuf, recvBuf.length);
                    socket.receive(recvPacket);
                    String response = new String(recvPacket.getData(), 0, recvPacket.getLength(), StandardCharsets.UTF_8);

                    Matcher matcher = XADDRS_PATTERN.matcher(response);
                    if (matcher.find()) {
                        String xAddrs = matcher.group(1).trim();
                        String[] urls = xAddrs.split("\\s+");
                        for (String url : urls) {
                            Matcher urlMatcher = URL_PARSER_PATTERN.matcher(url);
                            if (urlMatcher.find()) {
                                String ip = urlMatcher.group(1);
                                String portStr = urlMatcher.group(2);
                                int port = portStr != null ? Integer.parseInt(portStr) : 80;

                                // Ignore Windows WSD devices (port 5357 is Windows PC/printer, not an ONVIF camera)
                                if (port == 5357 || url.contains(":5357") || !response.toLowerCase().contains("onvif")) {
                                    log.debug("Ignoring non-camera WSD device at {}:{}", ip, port);
                                    continue;
                                }

                                if (!discoveredMap.containsKey(ip)) {
                                    OnvifDiscoveryDevice device = OnvifDiscoveryDevice.builder()
                                            .ipAddress(ip)
                                            .port(port)
                                            .xAddrs(url)
                                            .name("Camera " + ip)
                                            .build();
                                    discoveredMap.put(ip, device);
                                    log.info("Discovered ONVIF Camera: IP={}, Port={}, URL={}", ip, port, url);
                                }
                            }
                        }
                    }
                } catch (SocketTimeoutException e) {
                    break;
                } catch (Exception ex) {
                    log.warn("Error receiving ONVIF packet: {}", ex.getMessage());
                }
            }

        } catch (Exception e) {
            log.warn("WS-Discovery probe failed: {}", e.getMessage());
        } finally {
            if (socket != null && !socket.isClosed()) {
                socket.close();
            }
        }

        return new ArrayList<>(discoveredMap.values());
    }
}
