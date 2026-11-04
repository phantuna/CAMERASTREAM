package org.example.camerastream.modules.parking.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.example.camerastream.modules.parking.dto.ParkingSessionDto;
import org.example.camerastream.modules.parking.dto.ParkingSessionFilterQuery;
import org.example.camerastream.modules.parking.entity.*;
import org.example.camerastream.modules.parking.repository.LaneRepository;
import org.example.camerastream.modules.parking.repository.ParkingSessionRepository;
import org.example.camerastream.modules.parking.repository.VehicleRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class ParkingSessionServiceImpl implements IParkingSessionService {

    private final ParkingSessionRepository sessionRepository;
    private final LaneRepository laneRepository;
    private final VehicleRepository vehicleRepository;

    @Override
    @Transactional(readOnly = true)
    public Page<ParkingSessionDto> searchSessions(ParkingSessionFilterQuery query, Pageable pageable) {
        return sessionRepository.searchSessionsQueryDsl(query, pageable).map(this::toDto);
    }

    @Override
    @Transactional(readOnly = true)
    public ParkingSessionDto getSessionById(Long id) {
        return sessionRepository.findById(id).map(this::toDto).orElse(null);
    }

    @Override
    @Transactional
    public ParkingSessionDto recordVehicleCheck(String plateNumber, String laneCode, String direction, String plateImage, String overviewImage) {
        if (plateNumber == null || plateNumber.trim().isEmpty()) {
            return null;
        }

        String cleanPlate = plateNumber.replaceAll("[^a-zA-Z0-9]", "").toUpperCase();
        Lane lane = null;
        if (laneCode != null && !laneCode.trim().isEmpty()) {
            lane = laneRepository.findByCode(laneCode.trim()).orElse(null);
        }

        LocalDateTime now = LocalDateTime.now();
        Optional<Vehicle> registeredVehicle = vehicleRepository.findByPlateNumber(cleanPlate);

        boolean isOut = "OUT".equalsIgnoreCase(direction) || (lane != null && "OUT".equalsIgnoreCase(lane.getDirection()));

        if (isOut) {
            // LƯỢT RA: Tìm phiên ACTIVE gần nhất của biển số này
            Optional<ParkingSession> activeSessionOpt = sessionRepository.findTopByPlateNumberAndStatusOrderByInTimeDesc(cleanPlate, ParkingSessionStatus.ACTIVE);

            if (activeSessionOpt.isPresent()) {
                ParkingSession session = activeSessionOpt.get();
                session.setStatus(ParkingSessionStatus.COMPLETED);
                session.setOutTime(now);
                session.setOutLane(lane);
                session.setOutLaneName(lane != null ? lane.getName() : "Làn ra");
                session.setOutPlateImage(plateImage);
                session.setOutOverviewImage(overviewImage);

                if (session.getInTime() != null) {
                    long mins = Duration.between(session.getInTime(), now).toMinutes();
                    session.setDurationMinutes((double) mins);
                    session.setDurationFormatted(formatDuration(mins));
                }

                log.info("Chốt lượt ra thành công cho xe {}: thời lượng {}", cleanPlate, session.getDurationFormatted());
                return toDto(sessionRepository.save(session));
            } else {
                // Trường hợp xe ra nhưng không có lượt vào (UnmatchedOut)
                ParkingSession session = ParkingSession.builder()
                        .sessionCode("OUT_" + System.currentTimeMillis())
                        .plateNumber(cleanPlate)
                        .vehicleType(registeredVehicle.map(Vehicle::getVehicleType).orElse(VehicleType.CAR))
                        .status(ParkingSessionStatus.UNMATCHED_OUT)
                        .outTime(now)
                        .outLane(lane)
                        .outLaneName(lane != null ? lane.getName() : "Làn ra")
                        .outPlateImage(plateImage)
                        .outOverviewImage(overviewImage)
                        .note("Xe ra không khớp lượt vào (UnmatchedOut)")
                        .build();

                registeredVehicle.ifPresent(v -> {
                    session.setPersonName(v.getOwnerName());
                    if (v.getCompany() != null) session.setCompanyName(v.getCompany().getName());
                    if (v.getDepartment() != null) session.setDepartmentName(v.getDepartment().getName());
                });

                session.setActive(true);
                log.info("Tạo phiên UNMATCHED_OUT cho xe ra {}", cleanPlate);
                return toDto(sessionRepository.save(session));
            }
        } else {
            // LƯỢT VÀO: Tạo phiên mới ACTIVE
            ParkingSession session = ParkingSession.builder()
                    .sessionCode("IN_" + System.currentTimeMillis())
                    .plateNumber(cleanPlate)
                    .vehicleType(registeredVehicle.map(Vehicle::getVehicleType).orElse(VehicleType.CAR))
                    .status(ParkingSessionStatus.ACTIVE)
                    .inTime(now)
                    .inLane(lane)
                    .inLaneName(lane != null ? lane.getName() : "Làn vào")
                    .inPlateImage(plateImage)
                    .inOverviewImage(overviewImage)
                    .durationFormatted("Đang gửi trong bãi")
                    .build();

            registeredVehicle.ifPresent(v -> {
                session.setPersonName(v.getOwnerName());
                if (v.getCompany() != null) session.setCompanyName(v.getCompany().getName());
                if (v.getDepartment() != null) session.setDepartmentName(v.getDepartment().getName());
            });

            session.setActive(true);
            log.info("Tạo phiên gửi xe ACTIVE mới cho xe {}", cleanPlate);
            return toDto(sessionRepository.save(session));
        }
    }

    @Override
    @Transactional(readOnly = true)
    public byte[] exportSessionsToExcel(ParkingSessionFilterQuery query) {
        // Tối đa 5000 bản ghi xuất báo cáo
        Pageable p = PageRequest.of(0, 5000);
        List<ParkingSession> list = sessionRepository.searchSessionsQueryDsl(query, p).getContent();

        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = workbook.createSheet("Lịch Sử Xe Vào Ra");

            CellStyle headerStyle = workbook.createCellStyle();
            Font font = workbook.createFont();
            font.setBold(true);
            font.setColor(IndexedColors.WHITE.getIndex());
            headerStyle.setFont(font);
            headerStyle.setFillForegroundColor(IndexedColors.ROYAL_BLUE.getIndex());
            headerStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            headerStyle.setAlignment(HorizontalAlignment.CENTER);

            String[] headers = {
                "STT", "Biển Số Xe", "Loại Xe", "Trạng Thái", "Lái Xe / Chủ Xe",
                "Công Ty", "Phòng Ban", "Giờ Vào", "Làn Vào", "Giờ Ra", "Làn Ra",
                "Thời Lượng Gửi", "Ghi Chú"
            };
            Row headerRow = sheet.createRow(0);
            for (int i = 0; i < headers.length; i++) {
                Cell cell = headerRow.createCell(i);
                cell.setCellValue(headers[i]);
                cell.setCellStyle(headerStyle);
            }

            DateTimeFormatter dtf = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm:ss");
            int rowIdx = 1;
            for (ParkingSession s : list) {
                Row row = sheet.createRow(rowIdx++);
                row.createCell(0).setCellValue(rowIdx - 1);
                row.createCell(1).setCellValue(s.getPlateNumber());
                row.createCell(2).setCellValue(s.getVehicleType() != null ? s.getVehicleType().name() : "");
                row.createCell(3).setCellValue(formatStatus(s.getStatus()));
                row.createCell(4).setCellValue(s.getPersonName() != null ? s.getPersonName() : "");
                row.createCell(5).setCellValue(s.getCompanyName() != null ? s.getCompanyName() : "");
                row.createCell(6).setCellValue(s.getDepartmentName() != null ? s.getDepartmentName() : "");
                row.createCell(7).setCellValue(s.getInTime() != null ? s.getInTime().format(dtf) : "");
                row.createCell(8).setCellValue(s.getInLaneName() != null ? s.getInLaneName() : "");
                row.createCell(9).setCellValue(s.getOutTime() != null ? s.getOutTime().format(dtf) : "");
                row.createCell(10).setCellValue(s.getOutLaneName() != null ? s.getOutLaneName() : "");
                row.createCell(11).setCellValue(s.getDurationFormatted() != null ? s.getDurationFormatted() : "");
                row.createCell(12).setCellValue(s.getNote() != null ? s.getNote() : "");
            }

            for (int i = 0; i < headers.length; i++) {
                sheet.autoSizeColumn(i);
            }

            workbook.write(out);
            return out.toByteArray();
        } catch (Exception e) {
            log.error("Lỗi xuất Excel lịch sử phiên đỗ xe: {}", e.getMessage(), e);
            throw new RuntimeException("Lỗi xuất file Excel: " + e.getMessage());
        }
    }

    private String formatStatus(ParkingSessionStatus status) {
        if (status == null) return "";
        switch (status) {
            case ACTIVE: return "Đang gửi trong bãi";
            case COMPLETED: return "Đã ra";
            case UNMATCHED_OUT: return "Ra không khớp vào";
            default: return status.name();
        }
    }

    private String formatDuration(long minutes) {
        if (minutes < 60) {
            return minutes + " phút";
        }
        long hours = minutes / 60;
        long rem = minutes % 60;
        if (rem == 0) {
            return hours + " giờ";
        }
        return hours + " giờ " + rem + " phút";
    }

    private ParkingSessionDto toDto(ParkingSession s) {
        return ParkingSessionDto.builder()
                .id(s.getId())
                .sessionCode(s.getSessionCode())
                .plateNumber(s.getPlateNumber())
                .vehicleType(s.getVehicleType())
                .status(s.getStatus())
                .personId(s.getPersonId())
                .personName(s.getPersonName())
                .companyName(s.getCompanyName())
                .departmentName(s.getDepartmentName())
                .cardCode(s.getCardCode())
                .inTime(s.getInTime())
                .inLaneId(s.getInLane() != null ? s.getInLane().getId() : null)
                .inLaneName(s.getInLaneName())
                .inPlateImage(s.getInPlateImage())
                .inOverviewImage(s.getInOverviewImage())
                .outTime(s.getOutTime())
                .outLaneId(s.getOutLane() != null ? s.getOutLane().getId() : null)
                .outLaneName(s.getOutLaneName())
                .outPlateImage(s.getOutPlateImage())
                .outOverviewImage(s.getOutOverviewImage())
                .durationMinutes(s.getDurationMinutes())
                .durationFormatted(s.getDurationFormatted())
                .note(s.getNote())
                .createdAt(s.getCreated_at())
                .build();
    }
}

