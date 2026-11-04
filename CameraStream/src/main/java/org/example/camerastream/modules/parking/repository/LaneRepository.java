package org.example.camerastream.modules.parking.repository;

import org.example.camerastream.modules.parking.entity.Lane;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface LaneRepository extends JpaRepository<Lane, Long> {
    Optional<Lane> findByCode(String code);
    List<Lane> findByDirectionAndActiveTrue(String direction);
    List<Lane> findByActiveTrue();
    Page<Lane> findByActiveTrue(Pageable pageable);
}

