package org.example.camerastream.modules.gate.repository;

import org.example.camerastream.modules.gate.entity.Gate;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface GateRepository extends JpaRepository<Gate, Long> {

    @Query("SELECT g FROM Gate g WHERE g.deleted_at IS NULL ORDER BY g.created_at DESC")
    List<Gate> findAllActive();

    @Query("SELECT g FROM Gate g WHERE g.id = :id AND g.deleted_at IS NULL")
    Optional<Gate> findActiveById(Long id);

    @Query("SELECT g FROM Gate g WHERE g.code = :code AND g.deleted_at IS NULL")
    Optional<Gate> findActiveByCode(String code);

    Optional<Gate> findByCode(String code);

    @Query("SELECT COUNT(g) > 0 FROM Gate g WHERE g.code = :code AND g.deleted_at IS NULL")
    boolean existsActiveByCode(String code);
}
