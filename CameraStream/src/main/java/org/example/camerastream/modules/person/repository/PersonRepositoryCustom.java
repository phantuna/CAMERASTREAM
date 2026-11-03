package org.example.camerastream.modules.person.repository;

import org.example.camerastream.modules.person.entity.Person;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface PersonRepositoryCustom {

    Page<Person> searchPeopleQueryDsl(
            String search,
            String department,
            String status,
            Pageable pageable
    );
}
