package org.example.camerastream.modules.license;

import lombok.RequiredArgsConstructor;
import org.example.camerastream.common.dto.ApiResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/license")
@RequiredArgsConstructor
public class LicenseController {

    private final LicenseService licenseService;

    /** Trang thai license + Ma may (de khach gui ve cong ty xin license). */
    @GetMapping("/status")
    public ApiResponse<Map<String, Object>> status() {
        return ApiResponse.success(toMap(licenseService.current()));
    }

    /** Kich hoat/gia han: body {"licenseKey": "PX-LIC-..."}. Chi nhan license hop le cho may nay. */
    @PostMapping("/activate")
    public ApiResponse<Map<String, Object>> activate(@RequestBody Map<String, String> body) throws IOException {
        LicenseResult r = licenseService.activate(body == null ? null : body.get("licenseKey"));
        if (!r.valid()) {
            return ApiResponse.error(400, r.message());
        }
        return ApiResponse.success("Kich hoat license thanh cong", toMap(r));
    }

    private Map<String, Object> toMap(LicenseResult r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("valid", r.valid());
        m.put("status", r.status());
        m.put("message", r.message());
        m.put("enforced", licenseService.isEnforced());
        m.put("machineCode", licenseService.machineCode());
        m.put("customerName", r.customerName());
        m.put("expiryDate", r.permanent() ? null : r.expiryDate());
        m.put("permanent", r.permanent());
        m.put("daysRemaining", r.daysRemaining());
        return m;
    }
}

