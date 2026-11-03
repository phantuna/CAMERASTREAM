package org.example.camerastream.modules.camera.hardware.onvif;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@Slf4j
public class OnvifClientService {

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    private final SecureRandom random = new SecureRandom();

    private static final Pattern MEDIA_XADDR_PATTERN = Pattern.compile("<(?:[^:]+:)?Media>.*?<(?:[^:]+:)?XAddr>([^<]+)</(?:[^:]+:)?XAddr>", Pattern.DOTALL);
    private static final Pattern PROFILE_TOKEN_PATTERN = Pattern.compile("<(?:[^:]+:)?Profiles[^>]*token=\"([^\"]+)\"");
    private static final Pattern RTSP_URI_PATTERN = Pattern.compile("<(?:[^:]+:)?Uri>([^<]+)</(?:[^:]+:)?Uri>");
    private static final Pattern SNAPSHOT_URI_PATTERN = Pattern.compile("<(?:[^:]+:)?Uri>([^<]+)</(?:[^:]+:)?Uri>");

    public boolean testConnection(String ip, int port, String username, String password) {
        try {
            String deviceUrl = getDeviceServiceUrl(ip, port);
            String soapRequest = buildSoapEnvelope(
                    "<GetDeviceInformation xmlns=\"http://www.onvif.org/ver10/device/wsdl\"/>",
                    username, password
            );

            String response = sendSoap(deviceUrl, soapRequest);
            return response != null && response.contains("GetDeviceInformationResponse");
        } catch (Exception e) {
            log.warn("ONVIF test connection failed for {}:{}: {}", ip, port, e.getMessage());
            return false;
        }
    }

    public String resolveRtspUri(String ip, int port, String username, String password) {
        try {
            String deviceUrl = getDeviceServiceUrl(ip, port);

            String capRequest = buildSoapEnvelope(
                    "<GetCapabilities xmlns=\"http://www.onvif.org/ver10/device/wsdl\">" +
                    "<Category>Media</Category>" +
                    "</GetCapabilities>",
                    username, password
            );

            String capResponse = sendSoap(deviceUrl, capRequest);
            String mediaUrl = null;
            if (capResponse != null) {
                Matcher capMatcher = MEDIA_XADDR_PATTERN.matcher(capResponse);
                if (capMatcher.find()) {
                    mediaUrl = capMatcher.group(1).trim();
                }
            }

            if (mediaUrl == null || mediaUrl.isBlank()) {
                mediaUrl = String.format("http://%s:%d/onvif/media_service", ip, port);
            }

            String profileRequest = buildSoapEnvelope(
                    "<GetProfiles xmlns=\"http://www.onvif.org/ver10/media/wsdl\"/>",
                    username, password
            );

            String profileResponse = sendSoap(mediaUrl, profileRequest);
            String profileToken = null;
            if (profileResponse != null) {
                Matcher profMatcher = PROFILE_TOKEN_PATTERN.matcher(profileResponse);
                if (profMatcher.find()) {
                    profileToken = profMatcher.group(1).trim();
                }
            }

            if (profileToken == null) {
                profileToken = "Profile_1";
            }

            String streamUriRequest = buildSoapEnvelope(
                    "<GetStreamUri xmlns=\"http://www.onvif.org/ver10/media/wsdl\">" +
                    "<StreamSetup>" +
                    "<Stream xmlns=\"http://www.onvif.org/ver10/schema\">RTP-Unicast</Stream>" +
                    "<Transport xmlns=\"http://www.onvif.org/ver10/schema\">" +
                    "<Protocol>RTSP</Protocol>" +
                    "</Transport>" +
                    "</StreamSetup>" +
                    "<ProfileToken>" + profileToken + "</ProfileToken>" +
                    "</GetStreamUri>",
                    username, password
            );

            String streamResponse = sendSoap(mediaUrl, streamUriRequest);
            if (streamResponse != null) {
                Matcher uriMatcher = RTSP_URI_PATTERN.matcher(streamResponse);
                if (uriMatcher.find()) {
                    String rawUri = uriMatcher.group(1).trim();
                    if (username != null && !username.isBlank() && !rawUri.contains("@")) {
                        return rawUri.replace("rtsp://", String.format("rtsp://%s:%s@", username, password != null ? password : ""));
                    }
                    return rawUri;
                }
            }

        } catch (Exception e) {
            log.warn("Failed to resolve RTSP URI via ONVIF for {}:{}: {}", ip, port, e.getMessage());
        }

        return buildVendorFallbackRtspUrl(ip, username, password);
    }

    public String resolveSnapshotUri(String ip, int port, String username, String password) {
        try {
            String mediaUrl = String.format("http://%s:%d/onvif/media_service", ip, port);
            String snapRequest = buildSoapEnvelope(
                    "<GetSnapshotUri xmlns=\"http://www.onvif.org/ver10/media/wsdl\">" +
                    "<ProfileToken>Profile_1</ProfileToken>" +
                    "</GetSnapshotUri>",
                    username, password
            );

            String snapResponse = sendSoap(mediaUrl, snapRequest);
            if (snapResponse != null) {
                Matcher matcher = SNAPSHOT_URI_PATTERN.matcher(snapResponse);
                if (matcher.find()) {
                    return matcher.group(1).trim();
                }
            }
        } catch (Exception e) {
            log.warn("Failed to get snapshot URI via ONVIF: {}", e.getMessage());
        }

        return String.format("http://%s:%d/ISAPI/Streaming/channels/101/picture", ip, port);
    }

    public byte[] fetchSnapshot(String ip, int port, String username, String password) {
        String snapshotUrl = resolveSnapshotUri(ip, port, username, password);
        try {
            HttpRequest.Builder reqBuilder = HttpRequest.newBuilder()
                    .uri(URI.create(snapshotUrl))
                    .timeout(Duration.ofSeconds(6))
                    .GET();

            if (username != null && !username.isBlank()) {
                String auth = Base64.getEncoder().encodeToString((username + ":" + (password != null ? password : "")).getBytes(StandardCharsets.UTF_8));
                reqBuilder.header("Authorization", "Basic " + auth);
            }

            HttpResponse<byte[]> response = httpClient.send(reqBuilder.build(), HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() == 200) {
                return response.body();
            }
        } catch (Exception e) {
            log.warn("Error fetching snapshot from {}: {}", snapshotUrl, e.getMessage());
        }
        return null;
    }

    public boolean ptzControl(String ip, int port, String username, String password, String action) {
        try {
            String ptzUrl = String.format("http://%s:%d/onvif/ptz_service", ip, port);
            String soapBody;

            if ("STOP".equalsIgnoreCase(action)) {
                soapBody = "<Stop xmlns=\"http://www.onvif.org/ver20/ptz/wsdl\">" +
                           "<ProfileToken>Profile_1</ProfileToken><PanTilt>true</PanTilt><Zoom>true</Zoom></Stop>";
            } else {
                double x = 0;
                double y = 0;
                double z = 0;
                switch (action.toUpperCase()) {
                    case "UP": y = 0.5; break;
                    case "DOWN": y = -0.5; break;
                    case "LEFT": x = -0.5; break;
                    case "RIGHT": x = 0.5; break;
                    case "ZOOM_IN": z = 0.5; break;
                    case "ZOOM_OUT": z = -0.5; break;
                    default: return false;
                }
                soapBody = String.format(
                        Locale.US,
                        "<ContinuousMove xmlns=\"http://www.onvif.org/ver20/ptz/wsdl\">" +
                        "<ProfileToken>" + profileTokenOrDefault() + "</ProfileToken>" +
                        "<Velocity>" +
                        "<PanTilt xmlns=\"http://www.onvif.org/ver10/schema\" x=\"%.1f\" y=\"%.1f\"/>" +
                        "<Zoom xmlns=\"http://www.onvif.org/ver10/schema\" x=\"%.1f\"/>" +
                        "</Velocity>" +
                        "</ContinuousMove>", x, y, z
                );
            }

            String envelope = buildSoapEnvelope(soapBody, username, password);
            String response = sendSoap(ptzUrl, envelope);
            return response != null;
        } catch (Exception e) {
            log.warn("PTZ action '{}' failed for {}: {}", action, ip, e.getMessage());
            return false;
        }
    }

    private String profileTokenOrDefault() {
        return "Profile_1";
    }

    private String getDeviceServiceUrl(String ip, int port) {
        return String.format("http://%s:%d/onvif/device_service", ip, port);
    }

    private String buildVendorFallbackRtspUrl(String ip, String username, String password) {
        String authPrefix = (username != null && !username.isBlank()) 
                ? String.format("%s:%s@", username, password != null ? password : "") 
                : "";
        return String.format("rtsp://%s%s:554/Streaming/Channels/101", authPrefix, ip);
    }

    private String sendSoap(String url, String soapBody) {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(6))
                    .header("Content-Type", "application/soap+xml; charset=utf-8")
                    .POST(HttpRequest.BodyPublishers.ofString(soapBody, StandardCharsets.UTF_8))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                return response.body();
            }
        } catch (Exception e) {
            log.debug("SOAP send error to {}: {}", url, e.getMessage());
        }
        return null;
    }

    private String buildSoapEnvelope(String bodyContent, String username, String password) {
        String headerContent = "";
        if (username != null && !username.isBlank()) {
            try {
                byte[] nonceBytes = new byte[16];
                random.nextBytes(nonceBytes);
                String nonceBase64 = Base64.getEncoder().encodeToString(nonceBytes);

                String created = DateTimeFormatter.ISO_INSTANT.format(Instant.now().atZone(ZoneOffset.UTC));

                MessageDigest sha1 = MessageDigest.getInstance("SHA-1");
                sha1.update(nonceBytes);
                sha1.update(created.getBytes(StandardCharsets.UTF_8));
                sha1.update((password != null ? password : "").getBytes(StandardCharsets.UTF_8));
                String passwordDigest = Base64.getEncoder().encodeToString(sha1.digest());

                headerContent = "<Header>" +
                        "<Security xmlns=\"http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd\">" +
                        "<UsernameToken>" +
                        "<Username>" + username + "</Username>" +
                        "<Password Type=\"http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest\">" +
                        passwordDigest + "</Password>" +
                        "<Nonce EncodingType=\"http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary\">" +
                        nonceBase64 + "</Nonce>" +
                        "<Created xmlns=\"http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd\">" +
                        created + "</Created>" +
                        "</UsernameToken>" +
                        "</Security>" +
                        "</Header>";
            } catch (Exception e) {
                log.warn("Failed to generate WS-Security token: {}", e.getMessage());
            }
        }

        return "<?xml version=\"1.0\" encoding=\"utf-8\"?>" +
                "<Envelope xmlns=\"http://www.w3.org/2003/05/soap-envelope\">" +
                headerContent +
                "<Body>" +
                bodyContent +
                "</Body>" +
                "</Envelope>";
    }
}
