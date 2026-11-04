package org.example.camerastream.modules.parking.repository;

import org.example.camerastream.modules.parking.entity.Department;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface DepartmentRepository extends JpaRepository<Department, Long> {
    Optional<Department> findByCode(String code);
    List<Department> findByCompanyIdAndActiveTrue(Long companyId);
    List<Department> findByActiveTrue();
    Page<Department> findByActiveTrue(Pageable pageable);
}

