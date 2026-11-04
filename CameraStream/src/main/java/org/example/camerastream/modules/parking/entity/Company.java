package org.example.camerastream.modules.parking.entity;

import jakarta.persistence.*;
import lombok.*;
import org.example.camerastream.common.entity.base;

@Entity
@Table(name = "companies")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Company extends base {

    @Column(name = "code", nullable = false, unique = true, length = 64)
    private String code;

    @Column(name = "name", nullable = false, length = 255)
    private String name;

    @Column(name = "tax_code", length = 64)
    private String taxCode;

    @Column(name = "address", length = 500)
    private String address;

    @Column(name = "phone", length = 64)
    private String phone;

    @Column(name = "email", length = 128)
    private String email;

    @Column(name = "representative", length = 128)
    private String representative;
}

