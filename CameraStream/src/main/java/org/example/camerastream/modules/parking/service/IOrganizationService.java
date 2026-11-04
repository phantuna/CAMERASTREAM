package org.example.camerastream.modules.parking.service;

import org.example.camerastream.modules.parking.dto.CompanyDto;
import org.example.camerastream.modules.parking.dto.DepartmentDto;
import org.example.camerastream.modules.parking.dto.ContractorDto;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.List;

public interface IOrganizationService {
    // Companies
    Page<CompanyDto> getCompaniesPaged(Pageable pageable);
    List<CompanyDto> getAllActiveCompanies();
    CompanyDto getCompanyById(Long id);
    CompanyDto createCompany(CompanyDto dto);
    CompanyDto updateCompany(Long id, CompanyDto dto);
    void deleteCompany(Long id);

    // Departments
    Page<DepartmentDto> getDepartmentsPaged(Pageable pageable);
    List<DepartmentDto> getDepartmentsByCompany(Long companyId);
    List<DepartmentDto> getAllActiveDepartments();
    DepartmentDto getDepartmentById(Long id);
    DepartmentDto createDepartment(DepartmentDto dto);
    DepartmentDto updateDepartment(Long id, DepartmentDto dto);
    void deleteDepartment(Long id);

    // Contractors
    Page<ContractorDto> getContractorsPaged(Pageable pageable);
    List<ContractorDto> getAllActiveContractors();
    ContractorDto getContractorById(Long id);
    ContractorDto createContractor(ContractorDto dto);
    ContractorDto updateContractor(Long id, ContractorDto dto);
    void deleteContractor(Long id);
}

