package org.example.camerastream.modules.parking.service;

import org.example.camerastream.modules.parking.dto.LaneDto;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.List;

public interface ILaneService {
    Page<LaneDto> getLanesPaged(Pageable pageable);
    List<LaneDto> getAllActiveLanes();
    LaneDto getLaneById(Long id);
    LaneDto getLaneByCode(String code);
    LaneDto createLane(LaneDto dto);
    LaneDto updateLane(Long id, LaneDto dto);
    void deleteLane(Long id);
}

