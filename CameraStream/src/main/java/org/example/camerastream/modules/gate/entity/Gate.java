package org.example.camerastream.modules.gate.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import org.example.camerastream.common.entity.base;

/**
 * Làn Cổng Gate (bảng "gates"): một danh mục cổng/khu vực được khai báo
 * để camera được gán theo code/mã + tên. (V16)
 */
@Entity
@Table(name = "gates")
@Data
@EqualsAndHashCode(callSuper = true)
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Gate extends base {

    @Column(name = "code", nullable = false, unique = true)
    private String code;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "location")
    private String location;

    @Column(name = "description", length = 500)
    private String description;
}
