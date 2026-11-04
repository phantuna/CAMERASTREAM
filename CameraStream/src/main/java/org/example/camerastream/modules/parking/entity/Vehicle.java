package org.example.camerastream.modules.parking.entity;

import jakarta.persistence.*;
import lombok.*;
import org.example.camerastream.common.entity.base;

@Entity
@Table(name = "vehicles")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Vehicle extends base {

    @Column(name = "plate_number", nullable = false, unique = true, length = 64)
    private String plateNumber;

    @Builder.Default
    @Enumerated(EnumType.STRING)
    @Column(name = "vehicle_type", nullable = false, length = 32)
    private VehicleType vehicleType = VehicleType.CAR;

    @Column(name = "owner_name", length = 255)
    private String ownerName;

    @Column(name = "phone_number", length = 64)
    private String phoneNumber;

    @Column(name = "card_code", length = 64)
    private String cardCode;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id")
    private Company company;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "department_id")
    private Department department;

    @Column(name = "person_id")
    private Long personId;

    @Builder.Default
    @Column(name = "is_whitelist", nullable = false)
    private Boolean whitelist = true;

    @Column(name = "note", length = 500)
    private String note;
}
