package org.example.camerastream.modules.parking.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.example.camerastream.modules.parking.dto.LaneDto;
import org.example.camerastream.modules.parking.entity.Lane;
import org.example.camerastream.modules.parking.repository.LaneRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class LaneServiceImpl implements ILaneService {

    private final LaneRepository laneRepository;

    @Override
    @Transactional(readOnly = true)
    public Page<LaneDto> getLanesPaged(Pageable pageable) {
        return laneRepository.findByActiveTrue(pageable).map(this::toDto);
    }

    @Override
    @Transactional(readOnly = true)
    public List<LaneDto> getAllActiveLanes() {
        return laneRepository.findByActiveTrue().stream().map(this::toDto).collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public LaneDto getLaneById(Long id) {
        return laneRepository.findById(id).map(this::toDto).orElse(null);
    }

    @Override
    @Transactional(readOnly = true)
    public LaneDto getLaneByCode(String code) {
        return laneRepository.findByCode(code).map(this::toDto).orElse(null);
    }

    @Override
    @Transactional
    public LaneDto createLane(LaneDto dto) {
        Lane l = Lane.builder()
                .gateId(dto.getGateId())
                .code(dto.getCode())
                .name(dto.getName())
                .direction(dto.getDirection() != null ? dto.getDirection().toUpperCase() : "IN")
                .overviewCameraId(dto.getOverviewCameraId())
                .plateCameraId(dto.getPlateCameraId())
                .barrierDeviceId(dto.getBarrierDeviceId())
                .cardReaderId(dto.getCardReaderId())
                .description(dto.getDescription())
                .build();
        l.setActive(true);
        return toDto(laneRepository.save(l));
    }

    @Override
    @Transactional
    public LaneDto updateLane(Long id, LaneDto dto) {
        Lane l = laneRepository.findById(id).orElseThrow(() -> new IllegalArgumentException("Không tìm thấy làn Id: " + id));
        l.setGateId(dto.getGateId());
        l.setName(dto.getName());
        if (dto.getDirection() != null) l.setDirection(dto.getDirection().toUpperCase());
        l.setOverviewCameraId(dto.getOverviewCameraId());
        l.setPlateCameraId(dto.getPlateCameraId());
        l.setBarrierDeviceId(dto.getBarrierDeviceId());
        l.setCardReaderId(dto.getCardReaderId());
        l.setDescription(dto.getDescription());
        return toDto(laneRepository.save(l));
    }

    @Override
    @Transactional
    public void deleteLane(Long id) {
        laneRepository.findById(id).ifPresent(l -> {
            l.setActive(false);
            laneRepository.save(l);
        });
    }

    private LaneDto toDto(Lane l) {
        return LaneDto.builder()
                .id(l.getId())
                .gateId(l.getGateId())
                .code(l.getCode())
                .name(l.getName())
                .direction(l.getDirection())
                .overviewCameraId(l.getOverviewCameraId())
                .plateCameraId(l.getPlateCameraId())
                .barrierDeviceId(l.getBarrierDeviceId())
                .cardReaderId(l.getCardReaderId())
                .description(l.getDescription())
                .active(l.getActive())
                .createdAt(l.getCreated_at())
                .build();
    }
}

