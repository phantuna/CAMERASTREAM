package org.example.camerastream.modules.auth.repository;

import org.example.camerastream.modules.auth.entity.User;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    @EntityGraph(attributePaths = {"roles"})
    Optional<User> findByUsername(String username);

    @Override
    @EntityGraph(attributePaths = {"roles"})
    Optional<User> findById(Long id);

    @Override
    @EntityGraph(attributePaths = {"roles"})
    List<User> findAll();

    boolean existsByUsername(String username);
}
