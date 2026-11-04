package org.example.camerastream.modules.parking.service;

import org.example.camerastream.modules.parking.dto.ParkingSessionDto;
import org.example.camerastream.modules.parking.dto.ParkingSessionFilterQuery;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface IParkingSessionService {
    Page<ParkingSessionDto> searchSessions(ParkingSessionFilterQuery query, Pageable pageable);
    ParkingSessionDto getSessionById(Long id);
    ParkingSessionDto recordVehicleCheck(String plateNumber, String laneCode, String direction, String plateImage, String overviewImage);
    byte[] exportSessionsToExcel(ParkingSessionFilterQuery query);
}

