package org.example.camerastream.modules.person.entity;

import jakarta.persistence.*;
import lombok.*;
import org.example.camerastream.common.entity.base;

import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "people")
@Data
@EqualsAndHashCode(callSuper = true)
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Person extends base {

    @Column(name = "full_name", nullable = false)
    private String fullName;

    @Column(name = "employee_code", nullable = false, unique = true)
    private String employeeCode;

    @Column(name = "department")
    private String department;

    @Column(name = "role")
    private String role;

    @Column(name = "primary_photo_url")
    private String primaryPhotoUrl;

    @Builder.Default
    @Column(name = "status")
    private String status = "ACTIVE";

    @OneToMany(mappedBy = "person", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @Builder.Default
    private List<PersonFaceImage> faceImages = new ArrayList<>();
}
