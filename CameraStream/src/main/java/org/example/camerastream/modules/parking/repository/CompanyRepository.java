package org.example.camerastream.modules.parking.repository;

import org.example.camerastream.modules.parking.entity.Company;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface CompanyRepository extends JpaRepository<Company, Long> {
    Optional<Company> findByCode(String code);
    List<Company> findByActiveTrue();
    Page<Company> findByActiveTrue(Pageable pageable);
}

