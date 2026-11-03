package org.example.camerastream.modules.auth.repository;

import org.example.camerastream.modules.auth.entity.Role;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface RoleRepository extends JpaRepository<Role, Long> {

    @EntityGraph(attributePaths = {"permissions"})
    Optional<Role> findByName(String name);

    @Override
    @EntityGraph(attributePaths = {"permissions"})
    List<Role> findAll();

    boolean existsByName(String name);
}
