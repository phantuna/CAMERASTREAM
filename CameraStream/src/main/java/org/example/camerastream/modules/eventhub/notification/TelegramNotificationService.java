package org.example.camerastream.modules.eventhub.notification;

import lombok.extern.slf4j.Slf4j;
import org.example.camerastream.modules.eventhub.dto.SystemEventDto;
import org.example.camerastream.modules.eventhub.entity.EventSeverity;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.format.DateTimeFormatter;

/**
 * Dịch vụ gửi cảnh báo tự động qua Telegram Bot.
 * Hoạt động bất đồng bộ (@Async) trên pool riêng, không chặn luồng xử lý sự kiện.
 * Tuân thủ quy tắc Zero Trust & Graceful Degradation: Bỏ qua an toàn nếu chưa cấu hình Token / ChatID.
 */
@Service
@Slf4j
public class TelegramNotificationService {

    private final String botToken;
    private final String chatId;
    private final HttpClient httpClient;
    private final DateTimeFormatter timeFormatter = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm:ss");

    public TelegramNotificationService(
            @Value("${TELEGRAM_BOT_TOKEN:${app.telegram.bot-token:}}") String botToken,
            @Value("${TELEGRAM_CHAT_ID:${app.telegram.chat-id:}}") String chatId
    ) {
        this.botToken = (botToken != null) ? botToken.trim() : "";
        this.chatId = (chatId != null) ? chatId.trim() : "";
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build();

        if (isConfigured()) {
            log.info("TelegramNotificationService đã kích hoạt sẵn sàng cho Chat ID: {}", this.chatId);
        } else {
            log.debug("TelegramNotificationService chưa cấu hình TELEGRAM_BOT_TOKEN/CHAT_ID (Bỏ qua gửi Telegram)");
        }
    }

    public boolean isConfigured() {
        return !botToken.isEmpty() && !chatId.isEmpty();
    }

    @Async("cameraEventExecutor")
    @EventListener
    public void onSystemEvent(SystemEventDto event) {
        if (event == null) return;

        // Chỉ gửi thông báo Telegram cho các sự kiện CRITICAL hoặc WARNING
        EventSeverity severity = event.getSeverity();
        if (severity != EventSeverity.CRITICAL && severity != EventSeverity.WARNING) {
            return;
        }

        if (!isConfigured()) {
            return;
        }

        try {
            sendTelegramMessage(event);
        } catch (Exception e) {
            log.warn("Không thể gửi cảnh báo Telegram cho sự kiện #{}: {}", event.getId(), e.getMessage());
        }
    }

    private void sendTelegramMessage(SystemEventDto event) {
        String severityIcon = (event.getSeverity() == EventSeverity.CRITICAL) ? "🚨 [NGHIÊM TRỌNG]" : "⚠️ [CẢNH BÁO]";
        String timeStr = (event.getCreatedAt() != null)
                ? event.getCreatedAt().format(timeFormatter)
                : "";

        StringBuilder sb = new StringBuilder();
        sb.append(severityIcon).append("\n");
        sb.append("━━━━━━━━━━━━━━━━━━━━\n");
        sb.append("📍 <b>Camera:</b> ").append(escapeHtml(event.getCameraName())).append("\n");
        sb.append("📌 <b>Loại sự kiện:</b> ").append(escapeHtml(event.getEventType())).append("\n");
        sb.append("🕒 <b>Thời gian:</b> ").append(timeStr).append("\n");

        if (event.getConfidence() != null && event.getConfidence() > 0) {
            sb.append("🎯 <b>Độ tin cậy:</b> ").append(Math.round(event.getConfidence() * 100)).append("%\n");
        }

        if (event.getSnapshotUrl() != null && !event.getSnapshotUrl().isEmpty()) {
            sb.append("📷 <b>Ảnh chụp:</b> ").append(escapeHtml(event.getSnapshotUrl())).append("\n");
        }

        String messageText = sb.toString();
        String jsonBody = "{"
                + "\"chat_id\":\"" + chatId + "\","
                + "\"text\":\"" + escapeJson(messageText) + "\","
                + "\"parse_mode\":\"HTML\""
                + "}";

        String url = "https://api.telegram.org/bot" + botToken + "/sendMessage";

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Content-Type", "application/json; charset=UTF-8")
                .timeout(Duration.ofSeconds(10))
                .POST(HttpRequest.BodyPublishers.ofString(jsonBody, StandardCharsets.UTF_8))
                .build();

        httpClient.sendAsync(request, HttpResponse.BodyHandlers.ofString())
                .thenAccept(res -> {
                    if (res.statusCode() >= 200 && res.statusCode() < 300) {
                        log.info("Đã gửi cảnh báo Telegram cho sự kiện #{} thành công", event.getId());
                    } else {
                        log.warn("Telegram API trả về mã lỗi {}: {}", res.statusCode(), res.body());
                    }
                })
                .exceptionally(ex -> {
                    log.warn("Lỗi khi kết nối Telegram API: {}", ex.getMessage());
                    return null;
                });
    }

    private String escapeHtml(String text) {
        if (text == null) return "";
        return text.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;");
    }

    private String escapeJson(String text) {
        if (text == null) return "";
        return text.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }
}

