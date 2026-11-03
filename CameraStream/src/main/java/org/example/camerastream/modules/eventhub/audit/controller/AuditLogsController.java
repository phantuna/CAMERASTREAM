package org.example.camerastream.modules.eventhub.audit.controller;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.example.camerastream.common.dto.ApiResponse;
import org.example.camerastream.common.security.annotation.RequirePermission;
import org.example.camerastream.modules.eventhub.audit.dto.AuditLogDto;
import org.example.camerastream.modules.eventhub.audit.dto.AuditLogFilterQuery;
import org.example.camerastream.modules.eventhub.audit.service.IAuditLogService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.Map;

/**
 * Endpoint đọc-only cho nhật ký hành động quản trị (audit trail).
 * Ghi (record) được gọi nội bộ bởi các service khác, không có endpoint public POST.
 */
@RestController
@RequestMapping("/api/v1/audit-logs")
@RequiredArgsConstructor
@Slf4j
@RequirePermission("ALERTS_VIEW")
public class AuditLogsController {

    private final IAuditLogService auditLogService;

    /** Tìm kiếm & phân trang bản ghi audit. */
    @GetMapping
    public ApiResponse<Page<AuditLogDto>> search(
            @RequestParam(required = false) String actionType,
            @RequestParam(required = false) String targetEntity,
            @RequestParam(required = false) String actorUsername,
            @RequestParam(required = false) LocalDate fromDate,
            @RequestParam(required = false) LocalDate toDate,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        AuditLogFilterQuery query = AuditLogFilterQuery.builder()
                .actionType(actionType)
                .targetEntity(targetEntity)
                .actorUsername(actorUsername)
                .fromDate(fromDate)
                .toDate(toDate)
                .build();

        Page<AuditLogDto> result = auditLogService.search(
                query, PageRequest.of(page, Math.min(size, 500)));
        return ApiResponse.success(result);
    }

    /** Đếm audit theo action_type (cho tab thống kê). */
    @GetMapping("/stats")
    public ApiResponse<Map<String, Long>> stats() {
        return ApiResponse.success(auditLogService.getStats());
    }
}
