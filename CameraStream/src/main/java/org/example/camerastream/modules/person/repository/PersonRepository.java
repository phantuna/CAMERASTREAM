package org.example.camerastream.modules.person.repository;

import org.example.camerastream.modules.person.entity.Person;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PersonRepository extends JpaRepository<Person, Long>, PersonRepositoryCustom {

    @Override
    @EntityGraph(attributePaths = {"faceImages"})
    List<Person> findAll();

    @Override
    @EntityGraph(attributePaths = {"faceImages"})
    Optional<Person> findById(Long id);

    @EntityGraph(attributePaths = {"faceImages"})
    Optional<Person> findByEmployeeCode(String employeeCode);

    boolean existsByEmployeeCode(String employeeCode);

    @EntityGraph(attributePaths = {"faceImages"})
    @Query("SELECT p FROM Person p WHERE p.active = true " +
           "AND (:search IS NULL OR LOWER(p.fullName) LIKE LOWER(CONCAT('%', :search, '%')) " +
           "     OR LOWER(p.employeeCode) LIKE LOWER(CONCAT('%', :search, '%')) " +
           "     OR LOWER(p.department) LIKE LOWER(CONCAT('%', :search, '%')))")
    Page<Person> searchPeople(
            @Param("search") String search,Pageable pageable
    );
}
