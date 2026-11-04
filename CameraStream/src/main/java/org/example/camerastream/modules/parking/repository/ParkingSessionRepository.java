package org.example.camerastream.modules.parking.repository;

import org.example.camerastream.modules.parking.entity.ParkingSession;
import org.example.camerastream.modules.parking.entity.ParkingSessionStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface ParkingSessionRepository extends JpaRepository<ParkingSession, Long>, ParkingSessionRepositoryCustom {
    Optional<ParkingSession> findTopByPlateNumberAndStatusOrderByInTimeDesc(String plateNumber, ParkingSessionStatus status);
}

