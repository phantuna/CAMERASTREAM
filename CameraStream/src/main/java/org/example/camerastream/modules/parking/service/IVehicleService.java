package org.example.camerastream.modules.parking.service;

import org.example.camerastream.modules.parking.dto.VehicleDto;
import org.example.camerastream.modules.parking.dto.VehicleFilterQuery;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface IVehicleService {
    Page<VehicleDto> searchVehicles(VehicleFilterQuery query, Pageable pageable);
    VehicleDto getVehicleById(Long id);
    VehicleDto getVehicleByPlate(String plateNumber);
    VehicleDto createVehicle(VehicleDto dto);
    VehicleDto updateVehicle(Long id, VehicleDto dto);
    void deleteVehicle(Long id);
    byte[] exportVehiclesToExcel(VehicleFilterQuery query);
}

