package org.example.camerastream.modules.gate.service;

import org.example.camerastream.modules.gate.dto.GateDto;
import org.example.camerastream.modules.gate.dto.GateRequest;

import java.util.List;
import java.util.Optional;

public interface IGateService {
    List<GateDto> getAllGates();
    Optional<GateDto> getGateById(Long id);
    GateDto createGate(GateRequest request);
    GateDto updateGate(Long id, GateRequest request);
    void deleteGate(Long id);
}
