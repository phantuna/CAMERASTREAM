package org.example.camerastream.modules.auth.repository;

import org.example.camerastream.modules.auth.entity.Permission;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PermissionRepository extends JpaRepository<Permission, Long> {

    Optional<Permission> findByCode(String code);

    List<Permission> findByGroupName(String groupName);

    boolean existsByCode(String code);
}
