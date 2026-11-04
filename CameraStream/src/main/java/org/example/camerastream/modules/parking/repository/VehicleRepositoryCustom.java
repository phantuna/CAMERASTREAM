package org.example.camerastream.modules.parking.repository;

import org.example.camerastream.modules.parking.dto.VehicleFilterQuery;
import org.example.camerastream.modules.parking.entity.Vehicle;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface VehicleRepositoryCustom {
    Page<Vehicle> searchVehiclesQueryDsl(VehicleFilterQuery filterQuery, Pageable pageable);
}

