package org.example.camerastream.modules.parking.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.example.camerastream.modules.parking.dto.CompanyDto;
import org.example.camerastream.modules.parking.dto.DepartmentDto;
import org.example.camerastream.modules.parking.dto.ContractorDto;
import org.example.camerastream.modules.parking.entity.Company;
import org.example.camerastream.modules.parking.entity.Department;
import org.example.camerastream.modules.parking.entity.Contractor;
import org.example.camerastream.modules.parking.repository.CompanyRepository;
import org.example.camerastream.modules.parking.repository.DepartmentRepository;
import org.example.camerastream.modules.parking.repository.ContractorRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class OrganizationServiceImpl implements IOrganizationService {

    private final CompanyRepository companyRepository;
    private final DepartmentRepository departmentRepository;
    private final ContractorRepository contractorRepository;

    // --- COMPANIES ---
    @Override
    @Transactional(readOnly = true)
    public Page<CompanyDto> getCompaniesPaged(Pageable pageable) {
        return companyRepository.findByActiveTrue(pageable).map(this::toDto);
    }

    @Override
    @Transactional(readOnly = true)
    public List<CompanyDto> getAllActiveCompanies() {
        return companyRepository.findByActiveTrue().stream().map(this::toDto).collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public CompanyDto getCompanyById(Long id) {
        return companyRepository.findById(id).map(this::toDto).orElse(null);
    }

    @Override
    @Transactional
    public CompanyDto createCompany(CompanyDto dto) {
        Company c = Company.builder()
                .code(dto.getCode())
                .name(dto.getName())
                .taxCode(dto.getTaxCode())
                .address(dto.getAddress())
                .phone(dto.getPhone())
                .email(dto.getEmail())
                .representative(dto.getRepresentative())
                .build();
        c.setActive(true);
        return toDto(companyRepository.save(c));
    }

    @Override
    @Transactional
    public CompanyDto updateCompany(Long id, CompanyDto dto) {
        Company c = companyRepository.findById(id).orElseThrow(() -> new IllegalArgumentException("Không tìm thấy công ty Id: " + id));
        c.setName(dto.getName());
        c.setTaxCode(dto.getTaxCode());
        c.setAddress(dto.getAddress());
        c.setPhone(dto.getPhone());
        c.setEmail(dto.getEmail());
        c.setRepresentative(dto.getRepresentative());
        return toDto(companyRepository.save(c));
    }

    @Override
    @Transactional
    public void deleteCompany(Long id) {
        companyRepository.findById(id).ifPresent(c -> {
            c.setActive(false);
            companyRepository.save(c);
        });
    }

    // --- DEPARTMENTS ---
    @Override
    @Transactional(readOnly = true)
    public Page<DepartmentDto> getDepartmentsPaged(Pageable pageable) {
        return departmentRepository.findByActiveTrue(pageable).map(this::toDto);
    }

    @Override
    @Transactional(readOnly = true)
    public List<DepartmentDto> getDepartmentsByCompany(Long companyId) {
        return departmentRepository.findByCompanyIdAndActiveTrue(companyId).stream().map(this::toDto).collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public List<DepartmentDto> getAllActiveDepartments() {
        return departmentRepository.findByActiveTrue().stream().map(this::toDto).collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public DepartmentDto getDepartmentById(Long id) {
        return departmentRepository.findById(id).map(this::toDto).orElse(null);
    }

    @Override
    @Transactional
    public DepartmentDto createDepartment(DepartmentDto dto) {
        Company comp = null;
        if (dto.getCompanyId() != null) {
            comp = companyRepository.findById(dto.getCompanyId()).orElse(null);
        }
        Department d = Department.builder()
                .company(comp)
                .code(dto.getCode())
                .name(dto.getName())
                .description(dto.getDescription())
                .build();
        d.setActive(true);
        return toDto(departmentRepository.save(d));
    }

    @Override
    @Transactional
    public DepartmentDto updateDepartment(Long id, DepartmentDto dto) {
        Department d = departmentRepository.findById(id).orElseThrow(() -> new IllegalArgumentException("Không tìm thấy phòng ban Id: " + id));
        if (dto.getCompanyId() != null) {
            d.setCompany(companyRepository.findById(dto.getCompanyId()).orElse(null));
        }
        d.setName(dto.getName());
        d.setDescription(dto.getDescription());
        return toDto(departmentRepository.save(d));
    }

    @Override
    @Transactional
    public void deleteDepartment(Long id) {
        departmentRepository.findById(id).ifPresent(d -> {
            d.setActive(false);
            departmentRepository.save(d);
        });
    }

    // --- CONTRACTORS ---
    @Override
    @Transactional(readOnly = true)
    public Page<ContractorDto> getContractorsPaged(Pageable pageable) {
        return contractorRepository.findByActiveTrue(pageable).map(this::toDto);
    }

    @Override
    @Transactional(readOnly = true)
    public List<ContractorDto> getAllActiveContractors() {
        return contractorRepository.findByActiveTrue().stream().map(this::toDto).collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public ContractorDto getContractorById(Long id) {
        return contractorRepository.findById(id).map(this::toDto).orElse(null);
    }

    @Override
    @Transactional
    public ContractorDto createContractor(ContractorDto dto) {
        Contractor c = Contractor.builder()
                .code(dto.getCode())
                .name(dto.getName())
                .taxCode(dto.getTaxCode())
                .contactPerson(dto.getContactPerson())
                .phone(dto.getPhone())
                .email(dto.getEmail())
                .fieldOfWork(dto.getFieldOfWork())
                .build();
        c.setActive(true);
        return toDto(contractorRepository.save(c));
    }

    @Override
    @Transactional
    public ContractorDto updateContractor(Long id, ContractorDto dto) {
        Contractor c = contractorRepository.findById(id).orElseThrow(() -> new IllegalArgumentException("Không tìm thấy nhà thầu Id: " + id));
        c.setName(dto.getName());
        c.setTaxCode(dto.getTaxCode());
        c.setContactPerson(dto.getContactPerson());
        c.setPhone(dto.getPhone());
        c.setEmail(dto.getEmail());
        c.setFieldOfWork(dto.getFieldOfWork());
        return toDto(contractorRepository.save(c));
    }

    @Override
    @Transactional
    public void deleteContractor(Long id) {
        contractorRepository.findById(id).ifPresent(c -> {
            c.setActive(false);
            contractorRepository.save(c);
        });
    }

    private CompanyDto toDto(Company c) {
        return CompanyDto.builder()
                .id(c.getId())
                .code(c.getCode())
                .name(c.getName())
                .taxCode(c.getTaxCode())
                .address(c.getAddress())
                .phone(c.getPhone())
                .email(c.getEmail())
                .representative(c.getRepresentative())
                .active(c.getActive())
                .createdAt(c.getCreated_at())
                .build();
    }

    private DepartmentDto toDto(Department d) {
        return DepartmentDto.builder()
                .id(d.getId())
                .companyId(d.getCompany() != null ? d.getCompany().getId() : null)
                .companyName(d.getCompany() != null ? d.getCompany().getName() : null)
                .code(d.getCode())
                .name(d.getName())
                .description(d.getDescription())
                .active(d.getActive())
                .createdAt(d.getCreated_at())
                .build();
    }

    private ContractorDto toDto(Contractor c) {
        return ContractorDto.builder()
                .id(c.getId())
                .code(c.getCode())
                .name(c.getName())
                .taxCode(c.getTaxCode())
                .contactPerson(c.getContactPerson())
                .phone(c.getPhone())
                .email(c.getEmail())
                .fieldOfWork(c.getFieldOfWork())
                .active(c.getActive())
                .createdAt(c.getCreated_at())
                .build();
    }
}

