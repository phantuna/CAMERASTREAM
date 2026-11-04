package org.example.camerastream.modules.parking.repository;

import org.example.camerastream.modules.parking.entity.Contractor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ContractorRepository extends JpaRepository<Contractor, Long> {
    Optional<Contractor> findByCode(String code);
    List<Contractor> findByActiveTrue();
    Page<Contractor> findByActiveTrue(Pageable pageable);
}

