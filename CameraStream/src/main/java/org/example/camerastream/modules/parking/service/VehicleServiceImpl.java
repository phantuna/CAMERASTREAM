package org.example.camerastream.modules.parking.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.example.camerastream.modules.parking.dto.VehicleDto;
import org.example.camerastream.modules.parking.dto.VehicleFilterQuery;
import org.example.camerastream.modules.parking.entity.Company;
import org.example.camerastream.modules.parking.entity.Department;
import org.example.camerastream.modules.parking.entity.Vehicle;
import org.example.camerastream.modules.parking.entity.VehicleType;
import org.example.camerastream.modules.parking.repository.CompanyRepository;
import org.example.camerastream.modules.parking.repository.DepartmentRepository;
import org.example.camerastream.modules.parking.repository.VehicleRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class VehicleServiceImpl implements IVehicleService {

    private final VehicleRepository vehicleRepository;
    private final CompanyRepository companyRepository;
    private final DepartmentRepository departmentRepository;

    @Override
    @Transactional(readOnly = true)
    public Page<VehicleDto> searchVehicles(VehicleFilterQuery query, Pageable pageable) {
        return vehicleRepository.searchVehiclesQueryDsl(query, pageable).map(this::toDto);
    }

    @Override
    @Transactional(readOnly = true)
    public VehicleDto getVehicleById(Long id) {
        return vehicleRepository.findById(id).map(this::toDto).orElse(null);
    }

    @Override
    @Transactional(readOnly = true)
    public VehicleDto getVehicleByPlate(String plateNumber) {
        if (plateNumber == null) return null;
        String clean = plateNumber.replaceAll("[^a-zA-Z0-9]", "").toUpperCase();
        return vehicleRepository.findByPlateNumber(clean).map(this::toDto).orElse(null);
    }

    @Override
    @Transactional
    public VehicleDto createVehicle(VehicleDto dto) {
        String cleanPlate = dto.getPlateNumber().replaceAll("[^a-zA-Z0-9]", "").toUpperCase();
        vehicleRepository.findByPlateNumber(cleanPlate).ifPresent(v -> {
            throw new IllegalArgumentException("Biển số xe " + cleanPlate + " đã tồn tại trên hệ thống!");
        });

        Company comp = null;
        if (dto.getCompanyId() != null) {
            comp = companyRepository.findById(dto.getCompanyId()).orElse(null);
        }
        Department dept = null;
        if (dto.getDepartmentId() != null) {
            dept = departmentRepository.findById(dto.getDepartmentId()).orElse(null);
        }

        Vehicle v = Vehicle.builder()
                .plateNumber(cleanPlate)
                .vehicleType(dto.getVehicleType() != null ? dto.getVehicleType() : VehicleType.CAR)
                .ownerName(dto.getOwnerName())
                .phoneNumber(dto.getPhoneNumber())
                .cardCode(dto.getCardCode())
                .company(comp)
                .department(dept)
                .personId(dto.getPersonId())
                .whitelist(dto.getWhitelist() != null ? dto.getWhitelist() : true)
                .note(dto.getNote())
                .build();
        v.setActive(true);
        return toDto(vehicleRepository.save(v));
    }

    @Override
    @Transactional
    public VehicleDto updateVehicle(Long id, VehicleDto dto) {
        Vehicle v = vehicleRepository.findById(id).orElseThrow(() -> new IllegalArgumentException("Không tìm thấy phương tiện Id: " + id));
        if (dto.getCompanyId() != null) {
            v.setCompany(companyRepository.findById(dto.getCompanyId()).orElse(null));
        } else {
            v.setCompany(null);
        }
        if (dto.getDepartmentId() != null) {
            v.setDepartment(departmentRepository.findById(dto.getDepartmentId()).orElse(null));
        } else {
            v.setDepartment(null);
        }

        v.setVehicleType(dto.getVehicleType() != null ? dto.getVehicleType() : VehicleType.CAR);
        v.setOwnerName(dto.getOwnerName());
        v.setPhoneNumber(dto.getPhoneNumber());
        v.setCardCode(dto.getCardCode());
        v.setPersonId(dto.getPersonId());
        if (dto.getWhitelist() != null) v.setWhitelist(dto.getWhitelist());
        v.setNote(dto.getNote());
        return toDto(vehicleRepository.save(v));
    }

    @Override
    @Transactional
    public void deleteVehicle(Long id) {
        vehicleRepository.findById(id).ifPresent(v -> {
            v.setActive(false);
            vehicleRepository.save(v);
        });
    }

    @Override
    @Transactional(readOnly = true)
    public byte[] exportVehiclesToExcel(VehicleFilterQuery query) {
        // Tối đa 2000 bản ghi xuất báo cáo
        Pageable p = org.springframework.data.domain.PageRequest.of(0, 2000);
        List<Vehicle> list = vehicleRepository.searchVehiclesQueryDsl(query, p).getContent();

        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = workbook.createSheet("Danh Sách Phương Tiện");

            // Header Style
            CellStyle headerStyle = workbook.createCellStyle();
            Font font = workbook.createFont();
            font.setBold(true);
            font.setColor(IndexedColors.WHITE.getIndex());
            headerStyle.setFont(font);
            headerStyle.setFillForegroundColor(IndexedColors.ROYAL_BLUE.getIndex());
            headerStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            headerStyle.setAlignment(HorizontalAlignment.CENTER);

            String[] headers = {"STT", "Biển Số Xe", "Loại Xe", "Chủ Xe / Lái Xe", "Số Điện Thoại", "Công Ty", "Phòng Ban", "Mã Thẻ", "Nhóm", "Ghi Chú", "Ngày Đăng Ký"};
            Row headerRow = sheet.createRow(0);
            for (int i = 0; i < headers.length; i++) {
                Cell cell = headerRow.createCell(i);
                cell.setCellValue(headers[i]);
                cell.setCellStyle(headerStyle);
            }

            DateTimeFormatter dtf = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");
            int rowIdx = 1;
            for (Vehicle v : list) {
                Row row = sheet.createRow(rowIdx++);
                row.createCell(0).setCellValue(rowIdx - 1);
                row.createCell(1).setCellValue(v.getPlateNumber());
                row.createCell(2).setCellValue(v.getVehicleType() != null ? v.getVehicleType().name() : "");
                row.createCell(3).setCellValue(v.getOwnerName() != null ? v.getOwnerName() : "");
                row.createCell(4).setCellValue(v.getPhoneNumber() != null ? v.getPhoneNumber() : "");
                row.createCell(5).setCellValue(v.getCompany() != null ? v.getCompany().getName() : "");
                row.createCell(6).setCellValue(v.getDepartment() != null ? v.getDepartment().getName() : "");
                row.createCell(7).setCellValue(v.getCardCode() != null ? v.getCardCode() : "");
                row.createCell(8).setCellValue(Boolean.TRUE.equals(v.getWhitelist()) ? "Nội bộ / Whitelist" : "Vãng lai");
                row.createCell(9).setCellValue(v.getNote() != null ? v.getNote() : "");
                row.createCell(10).setCellValue(v.getCreated_at() != null ? v.getCreated_at().format(dtf) : "");
            }

            for (int i = 0; i < headers.length; i++) {
                sheet.autoSizeColumn(i);
            }

            workbook.write(out);
            return out.toByteArray();
        } catch (Exception e) {
            log.error("Lỗi xuất Excel phương tiện: {}", e.getMessage(), e);
            throw new RuntimeException("Lỗi xuất file Excel: " + e.getMessage());
        }
    }

    private VehicleDto toDto(Vehicle v) {
        return VehicleDto.builder()
                .id(v.getId())
                .plateNumber(v.getPlateNumber())
                .vehicleType(v.getVehicleType())
                .ownerName(v.getOwnerName())
                .phoneNumber(v.getPhoneNumber())
                .cardCode(v.getCardCode())
                .companyId(v.getCompany() != null ? v.getCompany().getId() : null)
                .companyName(v.getCompany() != null ? v.getCompany().getName() : null)
                .departmentId(v.getDepartment() != null ? v.getDepartment().getId() : null)
                .departmentName(v.getDepartment() != null ? v.getDepartment().getName() : null)
                .personId(v.getPersonId())
                .whitelist(v.getWhitelist())
                .note(v.getNote())
                .active(v.getActive())
                .createdAt(v.getCreated_at())
                .build();
    }
}

