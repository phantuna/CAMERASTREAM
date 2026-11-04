package org.example.camerastream.modules.parking.controller;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.example.camerastream.common.dto.ApiResponse;
import org.example.camerastream.modules.parking.dto.CompanyDto;
import org.example.camerastream.modules.parking.dto.ContractorDto;
import org.example.camerastream.modules.parking.dto.DepartmentDto;
import org.example.camerastream.modules.parking.service.IOrganizationService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * REST Controller quản lý Danh mục cơ cấu tổ chức: Công ty, Phòng ban, Nhà thầu.
 */
@RestController
@RequestMapping("/api/v1/organizations")
@RequiredArgsConstructor
@Slf4j
public class OrganizationController {

    private final IOrganizationService organizationService;

    // ==================== COMPANIES ====================

    @GetMapping("/companies")
    public ApiResponse<List<CompanyDto>> getAllCompanies() {
        return ApiResponse.success(organizationService.getAllActiveCompanies());
    }

    @GetMapping("/companies/{id}")
    public ApiResponse<CompanyDto> getCompanyById(@PathVariable Long id) {
        CompanyDto dto = organizationService.getCompanyById(id);
        if (dto != null) {
            return ApiResponse.success(dto);
        }
        return ApiResponse.error(404, "Không tìm thấy công ty với ID: " + id);
    }

    @PostMapping("/companies")
    public ApiResponse<CompanyDto> createCompany(@RequestBody CompanyDto dto) {
        return ApiResponse.success("Thêm mới công ty thành công", organizationService.createCompany(dto));
    }

    @PutMapping("/companies/{id}")
    public ApiResponse<CompanyDto> updateCompany(@PathVariable Long id, @RequestBody CompanyDto dto) {
        return ApiResponse.success("Cập nhật công ty thành công", organizationService.updateCompany(id, dto));
    }

    @DeleteMapping("/companies/{id}")
    public ApiResponse<Void> deleteCompany(@PathVariable Long id) {
        organizationService.deleteCompany(id);
        return ApiResponse.success("Xóa công ty thành công", null);
    }

    // ==================== DEPARTMENTS ====================

    @GetMapping("/departments")
    public ApiResponse<List<DepartmentDto>> getAllDepartments(@RequestParam(required = false) Long companyId) {
        if (companyId != null) {
            return ApiResponse.success(organizationService.getDepartmentsByCompany(companyId));
        }
        return ApiResponse.success(organizationService.getAllActiveDepartments());
    }

    @GetMapping("/departments/{id}")
    public ApiResponse<DepartmentDto> getDepartmentById(@PathVariable Long id) {
        DepartmentDto dto = organizationService.getDepartmentById(id);
        if (dto != null) {
            return ApiResponse.success(dto);
        }
        return ApiResponse.error(404, "Không tìm thấy phòng ban với ID: " + id);
    }

    @PostMapping("/departments")
    public ApiResponse<DepartmentDto> createDepartment(@RequestBody DepartmentDto dto) {
        return ApiResponse.success("Thêm mới phòng ban thành công", organizationService.createDepartment(dto));
    }

    @PutMapping("/departments/{id}")
    public ApiResponse<DepartmentDto> updateDepartment(@PathVariable Long id, @RequestBody DepartmentDto dto) {
        return ApiResponse.success("Cập nhật phòng ban thành công", organizationService.updateDepartment(id, dto));
    }

    @DeleteMapping("/departments/{id}")
    public ApiResponse<Void> deleteDepartment(@PathVariable Long id) {
        organizationService.deleteDepartment(id);
        return ApiResponse.success("Xóa phòng ban thành công", null);
    }

    // ==================== CONTRACTORS ====================

    @GetMapping("/contractors")
    public ApiResponse<List<ContractorDto>> getAllContractors() {
        return ApiResponse.success(organizationService.getAllActiveContractors());
    }

    @GetMapping("/contractors/{id}")
    public ApiResponse<ContractorDto> getContractorById(@PathVariable Long id) {
        ContractorDto dto = organizationService.getContractorById(id);
        if (dto != null) {
            return ApiResponse.success(dto);
        }
        return ApiResponse.error(404, "Không tìm thấy nhà thầu với ID: " + id);
    }

    @PostMapping("/contractors")
    public ApiResponse<ContractorDto> createContractor(@RequestBody ContractorDto dto) {
        return ApiResponse.success("Thêm mới nhà thầu thành công", organizationService.createContractor(dto));
    }

    @PutMapping("/contractors/{id}")
    public ApiResponse<ContractorDto> updateContractor(@PathVariable Long id, @RequestBody ContractorDto dto) {
        return ApiResponse.success("Cập nhật nhà thầu thành công", organizationService.updateContractor(id, dto));
    }

    @DeleteMapping("/contractors/{id}")
    public ApiResponse<Void> deleteContractor(@PathVariable Long id) {
        organizationService.deleteContractor(id);
        return ApiResponse.success("Xóa nhà thầu thành công", null);
    }
}
