package org.example.camerastream.modules.parking.repository;

import org.example.camerastream.modules.parking.dto.ParkingSessionFilterQuery;
import org.example.camerastream.modules.parking.entity.ParkingSession;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface ParkingSessionRepositoryCustom {
    Page<ParkingSession> searchSessionsQueryDsl(ParkingSessionFilterQuery filterQuery, Pageable pageable);
}

