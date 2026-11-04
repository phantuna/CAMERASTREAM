package org.example.camerastream.modules.parking.repository;

import org.example.camerastream.modules.parking.entity.Vehicle;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface VehicleRepository extends JpaRepository<Vehicle, Long>, VehicleRepositoryCustom {
    Optional<Vehicle> findByPlateNumber(String plateNumber);
}

