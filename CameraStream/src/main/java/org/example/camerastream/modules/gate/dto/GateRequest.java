package org.example.camerastream.modules.gate.dto;

import lombok.Data;

/** Body tạo/sửa Làn Cổng Gate. */
@Data
public class GateRequest {
    private String code;
    private String name;
    private String location;
    private String description;
    private Boolean active;
}
