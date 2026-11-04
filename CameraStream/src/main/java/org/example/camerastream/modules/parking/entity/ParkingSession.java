package org.example.camerastream.modules.parking.entity;

import jakarta.persistence.*;
import lombok.*;
import org.example.camerastream.common.entity.base;
import java.time.LocalDateTime;

@Entity
@Table(name = "parking_sessions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ParkingSession extends base {

    @Column(name = "session_code", length = 64)
    private String sessionCode;

    @Column(name = "plate_number", nullable = false, length = 64)
    private String plateNumber;

    @Builder.Default
    @Enumerated(EnumType.STRING)
    @Column(name = "vehicle_type", length = 32)
    private VehicleType vehicleType = VehicleType.CAR;

    @Builder.Default
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 32)
    private ParkingSessionStatus status = ParkingSessionStatus.ACTIVE;

    @Column(name = "person_id")
    private Long personId;

    @Column(name = "person_name", length = 255)
    private String personName;

    @Column(name = "company_name", length = 255)
    private String companyName;

    @Column(name = "department_name", length = 255)
    private String departmentName;

    @Column(name = "card_code", length = 64)
    private String cardCode;

    // --- LƯỢT VÀO ---
    @Column(name = "in_time")
    private LocalDateTime inTime;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "in_lane_id")
    private Lane inLane;

    @Column(name = "in_lane_name", length = 255)
    private String inLaneName;

    @Column(name = "in_plate_image", columnDefinition = "TEXT")
    private String inPlateImage;

    @Column(name = "in_overview_image", columnDefinition = "TEXT")
    private String inOverviewImage;

    // --- LƯỢT RA ---
    @Column(name = "out_time")
    private LocalDateTime outTime;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "out_lane_id")
    private Lane outLane;

    @Column(name = "out_lane_name", length = 255)
    private String outLaneName;

    @Column(name = "out_plate_image", columnDefinition = "TEXT")
    private String outPlateImage;

    @Column(name = "out_overview_image", columnDefinition = "TEXT")
    private String outOverviewImage;

    // --- THỜI LƯỢNG & TÍNH TOÁN ---
    @Column(name = "duration_minutes")
    private Double durationMinutes;

    @Column(name = "duration_formatted", length = 64)
    private String durationFormatted;

    @Column(name = "note", length = 500)
    private String note;
}
