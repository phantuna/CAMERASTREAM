package org.example.camerastream.modules.parking.entity;

import jakarta.persistence.*;
import lombok.*;
import org.example.camerastream.common.entity.base;

@Entity
@Table(name = "contractors")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Contractor extends base {

    @Column(name = "code", nullable = false, unique = true, length = 64)
    private String code;

    @Column(name = "name", nullable = false, length = 255)
    private String name;

    @Column(name = "tax_code", length = 64)
    private String taxCode;

    @Column(name = "contact_person", length = 128)
    private String contactPerson;

    @Column(name = "phone", length = 64)
    private String phone;

    @Column(name = "email", length = 128)
    private String email;

    @Column(name = "field_of_work", length = 255)
    private String fieldOfWork;
}

